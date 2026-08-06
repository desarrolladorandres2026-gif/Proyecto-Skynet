import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAudioAnalyzer } from './useAudioAnalyzer.js'
import { useHablar } from './useHablar.js'
import { useReconocimientoVoz } from './useReconocimientoVoz.js'

// Orquesta micrófono, síntesis de voz y visualización del orbe. NO habla con
// la API: recibe `onPregunta` y deja que el widget haga la petición.
//
// ── Por qué ya no llama a copiloto.chat() ───────────────────────────────────
// Antes este hook mantenía su PROPIO historial (`historialRef`) y hacía su
// propia petición, en paralelo al historial del widget. Con dos fuentes de
// verdad para la misma conversación pasaban dos cosas, las dos observables:
//  - Lo preguntado por voz no aparecía nunca en el chat, porque se guardaba en
//    el historial del hook y el chat pintaba el suyo.
//  - Los dos historiales divergían: alternar voz y texto dejaba al modelo con
//    un hilo distinto según por dónde hubiera entrado el último mensaje.
// Ahora hay un único camino (CopilotoWidget#enviarTexto) y este hook solo se
// ocupa del audio y del estado visual.

// Estados posibles del orbe. Se DERIVAN de las señales reales en vez de
// transicionarse a mano — ver `estadoVoz` más abajo.
const ESTADOS = ['IDLE', 'LISTENING', 'PROCESSING', 'SPEAKING', 'ERROR']

export function useVoiceAssistant({ onPregunta } = {}) {
  const [procesando, setProcesando] = useState(false)
  const [errorMensaje, setErrorMensaje] = useState('')

  const voz = useHablar()
  const analyzer = useAudioAnalyzer()

  // El widget recrea `onPregunta` en cada render (depende de su estado), y
  // useReconocimientoVoz no debe reiniciar el micrófono por eso.
  const onPreguntaRef = useRef(onPregunta)
  useEffect(() => {
    onPreguntaRef.current = onPregunta
  }, [onPregunta])

  const manejarPregunta = useCallback(async (pregunta) => {
    const limpio = pregunta?.trim()
    if (!limpio) return
    setProcesando(true)
    setErrorMensaje('')
    try {
      await onPreguntaRef.current?.(limpio, { porVoz: true })
    } catch (err) {
      setErrorMensaje(err?.message || 'Ocurrió un error en Skynet')
    } finally {
      setProcesando(false)
    }
  }, [])

  const microfono = useReconocimientoVoz({
    onPregunta: manejarPregunta,
    // Mientras Skynet habla el micrófono se suspende: si no, capta la propia
    // respuesta por el altavoz. La excepción es la interrupción por frase de
    // activación, que gestiona el propio hook (ver `permitirInterrupcion`).
    pausado: voz.hablando || procesando,
    // Barge-in acotado: durante la respuesta se sigue escuchando SOLO la frase
    // completa "oye Skynet". No es interrupción por voz general —eso exigiría
    // cancelación de eco sobre el stream, y la Web Speech API no deja
    // configurar el suyo— pero cubre el caso que importa: cortar una respuesta
    // larga sin tener que buscar el botón.
    permitirInterrupcion: voz.hablando,
    onInterrupcion: () => {
      voz.detener()
      analyzer.detenerAnalisis()
    },
  })

  // ── Estado derivado, no transicionado ─────────────────────────────────────
  // La versión anterior llamaba a cambiarEstado('SPEAKING') al recibir el
  // primer trozo del stream, pero `voz.hablando` no se pone en true hasta que
  // el sintetizador dispara onstart, unos milisegundos después. En esa ventana
  // se cumplía `estadoVoz === 'SPEAKING' && !voz.hablando`, que era justo la
  // condición del efecto que devolvía el orbe a IDLE a los 500 ms: el orbe se
  // apagaba mientras Skynet seguía hablando.
  //
  // Derivándolo de las señales reales esa ventana no existe: no hay dos
  // representaciones del mismo hecho que puedan desincronizarse.
  const estadoVoz = useMemo(() => {
    if (errorMensaje || microfono.error) return 'ERROR'
    if (microfono.capturandoPregunta) return 'LISTENING'
    // Antes que PROCESSING: mientras se recibe el stream las dos son ciertas
    // (sigue llegando texto y ya se está leyendo), y lo que hay que mostrar es
    // que está hablando.
    if (voz.hablando) return 'SPEAKING'
    if (procesando) return 'PROCESSING'
    return 'IDLE'
  }, [errorMensaje, microfono.error, microfono.capturandoPregunta, voz.hablando, procesando])

  // El analizador alimenta la animación del orbe a 60 FPS. Se engancha y
  // desengancha siguiendo al estado derivado, así que tampoco puede quedarse
  // corriendo tras un cambio que antes pasaba por un camino distinto.
  useEffect(() => {
    if (estadoVoz === 'SPEAKING') {
      analyzer.iniciarAnalisisSinteticoTTS()
      return () => analyzer.detenerAnalisis()
    }
    if (estadoVoz === 'IDLE' || estadoVoz === 'ERROR') analyzer.detenerAnalisis()
    return undefined
  }, [estadoVoz, analyzer])

  // El error se muestra un rato y se limpia solo: es información de un momento
  // puntual, no un estado en el que haya que dejar la interfaz atascada.
  useEffect(() => {
    if (!errorMensaje) return undefined
    const t = setTimeout(() => setErrorMensaje(''), 3500)
    return () => clearTimeout(t)
  }, [errorMensaje])

  const activarMicrofono = useCallback(() => {
    // Pulsar el micrófono mientras habla es la forma explícita de
    // interrumpirlo, y funciona siempre (no depende del reconocimiento).
    if (voz.hablando) voz.detener()
    // Calienta el sintetizador aprovechando este gesto del usuario: la primera
    // llamada real a speak() en Chrome tarda bastante más que las siguientes
    // (ver useHablar#precalentar), y hacerlo aquí saca esa demora de la ruta
    // de la respuesta.
    voz.precalentar()
    microfono.escucharUnaVez()
  }, [microfono, voz])

  const alternarWake = useCallback(() => {
    if (microfono.escuchandoWake) {
      microfono.desactivarWake()
    } else {
      voz.precalentar()
      microfono.activarWake()
    }
  }, [microfono, voz])

  const cancelarVoz = useCallback(() => {
    voz.detener()
    analyzer.detenerAnalisis()
    microfono.detener()
    setProcesando(false)
  }, [analyzer, microfono, voz])

  return {
    estadoVoz,
    errorMensaje: errorMensaje || microfono.error,
    rmsRef: analyzer.rmsRef,
    escuchandoWake: microfono.escuchandoWake,
    capturandoPregunta: microfono.capturandoPregunta,
    hablando: voz.hablando,
    activarMicrofono,
    alternarWake,
    cancelarVoz,
    voz,
    microfono,
  }
}

export { ESTADOS as ESTADOS_VOZ }
