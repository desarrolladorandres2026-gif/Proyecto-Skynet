import { puenteEscritorio } from './esEscritorio.js'

// Reconocimiento de voz OFFLINE con Vosk, para el asistente de escritorio.
//
// ── Por qué hace falta otro motor ───────────────────────────────────────────
// La Web Speech API de Chromium no transcribe por sí sola: manda el audio a un
// servicio de Google al que se accede con una clave que viene compilada en las
// builds oficiales de Chrome y NO en las de Electron. Dentro del asistente,
// `webkitSpeechRecognition` arranca y falla con `error: 'network'`.
//
// Vosk resuelve eso y además arregla dos cosas que el navegador nunca hizo
// bien para este caso: funciona sin internet y el audio no sale del equipo,
// que es justo lo que exige tener el micrófono abierto todo el día en el
// Terminal (la versión web advertía de esto y por eso el wake word era opt-in).
//
// ── Por qué imita a SpeechRecognition en vez de traer su propia API ─────────
// Toda la inteligencia de la escucha —detectar "Oye Skynet", los tres modos
// (wake / pregunta / interrupción), el vigilante de cuelgues, el reinicio
// automático— ya está escrita y probada en `useReconocimientoVoz.js`. Si esta
// clase expusiera una API propia, habría que duplicar esa lógica aquí y
// mantener dos copias que se van separando.
//
// Copiando la forma de `SpeechRecognition` (`start`, `stop`, `onresult`,
// `onerror`, `onend`, y resultados con `[i][0].transcript` + `isFinal`), el
// hook no distingue cuál de los dos está usando: solo cambia el constructor.
// Es un adaptador, no un segundo cerebro.

// El modelo pesa ~40 MB y tarda segundos en cargarse. El hook crea un
// reconocedor nuevo en cada `arrancar()` (varias veces por minuto en modo
// wake), así que el modelo TIENE que ser un singleton del módulo: cargarlo por
// instancia dejaría el asistente inservible.
let modeloPrometido = null
let modeloError = null

async function obtenerModelo() {
  if (modeloError) throw modeloError
  if (modeloPrometido) return modeloPrometido

  modeloPrometido = (async () => {
    const url = puenteEscritorio().urlModelo()
    if (!url) {
      throw new Error(
        'El modelo de voz no está instalado. Ejecuta "npm run modelo" en la carpeta escritorio/.'
      )
    }
    // Importación dinámica: `vosk-browser` arrastra un WebAssembly de varios
    // MB, y en el navegador normal no se usa NUNCA. Cargarlo de forma estática
    // lo metería en el bundle del panel web, que lo descargarían todos los
    // usuarios para nada.
    const vosk = await import('vosk-browser')
    return vosk.createModel(url)
  })()

  try {
    return await modeloPrometido
  } catch (err) {
    // El fallo no se memoriza como promesa rechazada: si se reintenta (por
    // ejemplo tras instalar el modelo sin reiniciar), debe poder volver a
    // cargar. Se guarda el error solo para reportarlo en el diagnóstico.
    modeloPrometido = null
    modeloError = err
    throw err
  }
}

/** Para el autodiagnóstico: ¿el modelo llegó a cargar, y si no, por qué? */
export function estadoModelo() {
  if (modeloError) return { cargado: false, error: modeloError.message }
  if (modeloPrometido) return { cargado: true, error: null }
  return { cargado: false, error: null }
}

/**
 * Precarga el modelo sin arrancar el micrófono.
 *
 * Sin esto, la primera pulsación del atajo global se comería los segundos de
 * carga del modelo con el usuario ya hablando, y se perdería la frase. Se
 * llama al montar el asistente, cuando nadie está esperando.
 */
export async function precargarModelo() {
  try {
    await obtenerModelo()
    return true
  } catch {
    return false
  }
}

// Cuántas muestras se le pasan al reconocedor de una vez. 4096 a 48 kHz son
// ~85 ms: suficientemente corto para que la respuesta se sienta inmediata y
// suficientemente largo para no ahogar el hilo con llamadas al WASM.
const TAMANO_BUFFER = 4096

/**
 * Adaptador con la forma de `SpeechRecognition`, movido por Vosk.
 *
 * Las propiedades `lang`, `interimResults` y `maxAlternatives` se aceptan y se
 * ignoran a propósito: existen para que el hook pueda asignarlas sin ramas
 * (`r.lang = 'es-CO'`). El idioma lo fija el modelo instalado, no una
 * propiedad, y Vosk siempre entrega parciales y una sola alternativa.
 */
export class ReconocedorVosk {
  constructor() {
    this.lang = 'es-CO'
    this.continuous = false
    this.interimResults = true
    this.maxAlternatives = 1

    this.onstart = null
    this.onresult = null
    this.onerror = null
    this.onend = null
    this.onspeechstart = null

    this._corriendo = false
    this._detenido = false
    this._stream = null
    this._contexto = null
    this._nodo = null
    this._fuente = null
    this._reconocedor = null
    this._huboVoz = false
  }

  async start() {
    if (this._corriendo) return
    this._corriendo = true
    this._detenido = false

    try {
      const modelo = await obtenerModelo()
      // Entre pedir el modelo y tenerlo pueden pasar segundos, y en ese rato
      // el hook puede haber llamado a stop() (el usuario cambió de modo, o
      // Skynet empezó a hablar). Sin esta comprobación se abriría el micrófono
      // después de que alguien pidiera cerrarlo.
      if (this._detenido) return

      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Vosk trabaja en mono. El resto son las mismas mejoras que aplica
          // el navegador por defecto para voz: sin cancelación de eco, el
          // micrófono capta la propia respuesta de Skynet por el altavoz.
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      if (this._detenido) {
        this._soltarMicrofono()
        return
      }

      this._contexto = new AudioContext()
      this._reconocedor = new modelo.KaldiRecognizer(this._contexto.sampleRate)

      this._reconocedor.on('result', (mensaje) => {
        const texto = mensaje?.result?.text?.trim()
        if (!texto) return
        this._emitir(texto, true)
        // En modo no continuo, una frase cerrada ES el final de la captura,
        // igual que hace SpeechRecognition: el hook espera un `onend` para
        // apagar el indicador de "escuchando".
        if (!this.continuous) this.stop()
      })

      this._reconocedor.on('partialresult', (mensaje) => {
        const parcial = mensaje?.result?.partial?.trim()
        if (!parcial) return
        if (!this._huboVoz) {
          this._huboVoz = true
          this.onspeechstart?.()
        }
        this._emitir(parcial, false)
      })

      this._fuente = this._contexto.createMediaStreamSource(this._stream)
      // ScriptProcessorNode está marcado como obsoleto en favor de
      // AudioWorklet, pero AudioWorklet exige cargar un módulo desde una URL
      // propia, lo que complica el empaquetado de Vite para una ganancia nula
      // aquí: este nodo solo copia un buffer y se lo pasa al WASM. Chromium lo
      // sigue soportando y el asistente corre sobre Chromium fijo (Electron),
      // no sobre "cualquier navegador".
      this._nodo = this._contexto.createScriptProcessor(TAMANO_BUFFER, 1, 1)
      this._nodo.onaudioprocess = (evento) => {
        if (this._detenido || !this._reconocedor) return
        try {
          this._reconocedor.acceptWaveformFloat(
            evento.inputBuffer.getChannelData(0),
            this._contexto.sampleRate
          )
        } catch {
          /* buffer suelto tras cerrar: no es un fallo que reportar */
        }
      }
      this._fuente.connect(this._nodo)
      // El nodo debe estar conectado a algo para que el grafo lo procese, pero
      // NO queremos oír el micrófono por el altavoz. Un GainNode a 0 cierra el
      // circuito sin producir sonido.
      const mudo = this._contexto.createGain()
      mudo.gain.value = 0
      this._nodo.connect(mudo)
      mudo.connect(this._contexto.destination)

      this.onstart?.()
    } catch (err) {
      this._corriendo = false
      this._soltarMicrofono()
      this.onerror?.({ error: this._traducirError(err) })
      this.onend?.()
    }
  }

  stop() {
    if (this._detenido) return
    this._detenido = true
    this._corriendo = false

    // El resultado final pendiente se pide ANTES de soltar nada: si el usuario
    // deja de hablar y se corta enseguida, Vosk puede tener media frase sin
    // cerrar, y perderla se ve como "no me entendió".
    try {
      this._reconocedor?.retrieveFinalResult()
    } catch {
      /* ya estaba cerrado */
    }

    this._soltarMicrofono()
    this.onend?.()
  }

  /** SpeechRecognition tiene abort(); el hook no lo usa, pero la forma se respeta. */
  abort() {
    this.stop()
  }

  _emitir(texto, esFinal) {
    if (!this.onresult) return
    // Se reconstruye la forma exacta que produce SpeechRecognition, incluido
    // `resultIndex`, porque el hook recorre `results` desde ahí.
    const alternativa = { transcript: texto, confidence: esFinal ? 0.9 : 0.5 }
    const resultado = { 0: alternativa, length: 1, isFinal: esFinal }
    this.onresult({ resultIndex: 0, results: { 0: resultado, length: 1 } })
  }

  _soltarMicrofono() {
    // El orden importa: primero se desconecta el grafo, luego se cierra el
    // contexto y al final se paran las pistas. Al revés, el nodo puede seguir
    // recibiendo buffers de un stream muerto.
    try {
      this._nodo?.disconnect()
      this._fuente?.disconnect()
    } catch {
      /* ya desconectado */
    }
    if (this._nodo) this._nodo.onaudioprocess = null
    this._contexto?.close?.().catch(() => {})
    for (const pista of this._stream?.getTracks?.() || []) pista.stop()

    try {
      this._reconocedor?.remove()
    } catch {
      /* ya liberado */
    }

    this._nodo = null
    this._fuente = null
    this._contexto = null
    this._stream = null
    this._reconocedor = null
    this._huboVoz = false
  }

  // Se traducen a los mismos códigos que usa SpeechRecognition para que el
  // manejo de errores del hook (que ya distingue 'not-allowed' y 'no-speech')
  // funcione igual con los dos motores.
  _traducirError(err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return 'not-allowed'
    if (err?.name === 'NotFoundError') return 'audio-capture'
    if (String(err?.message || '').includes('modelo de voz')) return 'modelo-no-instalado'
    return 'audio-capture'
  }
}
