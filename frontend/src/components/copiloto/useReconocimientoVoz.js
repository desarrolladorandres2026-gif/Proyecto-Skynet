import { useCallback, useEffect, useRef, useState } from 'react'

// Reconocimiento de voz para Skynet, con dos modos sobre la MISMA Web Speech
// API (Chrome/Edge; Firefox no la implementa y Safari solo a medias — por eso
// todo el widget degrada a texto si `soportado` es false):
//
//  1. Pulsar para hablar: una sola captura, disparada por el botón de
//     micrófono. Es el modo por defecto y no deja el micrófono abierto.
//  2. "Oye Skynet": escucha continua buscando la frase de activación. Va
//     APAGADO por defecto y lo enciende el usuario a conciencia, porque en
//     Chrome el audio se transcribe en servidores de Google — dejarlo abierto
//     sin que la persona lo sepa sería enviar conversaciones del Terminal a un
//     tercero sin su consentimiento.
//
// Limitación conocida de la API (no es un bug de este código): el navegador
// corta el reconocimiento continuo cada cierto tiempo y cuando la pestaña deja
// de estar en primer plano. Se reinicia solo mientras el modo siga activo, así
// que "Oye Skynet" funciona con la app abierta en pantalla, no en segundo plano.

const SpeechRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

// Quita tildes y signos para comparar: el transcriptor devuelve "Oye, Skynet."
// con puntuación y acentos variables.
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacríticos separados por NFD
    .replace(/[.,;:!?¡¿]/g, '')
    .trim()
}

// "Skynet" es una palabra inglesa dicha por hispanohablantes: el transcriptor
// en es-CO puede devolverla deformada de maneras impredecibles (no probadas
// contra el motor real, solo contra texto inventado — ver detectarActivacion
// más abajo). Se separan las dos partes (frase disparadora + nombre) en vez de
// exigir una frase fija completa, y el nombre acepta un abanico amplio de
// variantes fonéticas para maximizar que algo capture, incluso a costa de
// algún falso positivo — el modo wake ya es opt-in, así que ese costo es
// aceptable.
const DISPARADORES = 'oye|hey|hei|ey|oiga|ola|hola|epa'
const VARIANTES_SKYNET =
  'skynet|sky\\s*net|s\\s*ki\\s*net|es\\s*ki\\s*net|es\\s*kai\\s*net|es\\s*quai\\s*net|esquinet|escainet|eskinet|skinet|escuinet|iskinet|iskaynet|iskainet'
const PATRON_ACTIVACION = new RegExp(`\\b(${DISPARADORES})\\W*(${VARIANTES_SKYNET})\\b`)
// Respaldo sin disparador: si el transcriptor devuelve solo "skynet" (se
// comió el "oye" por ruido, o la persona lo omitió), igual activa. Se exige
// que la variante de "skynet" esté cerca del INICIO del turno para no
// disparar cuando la palabra aparece a mitad de una frase sobre otra cosa
// ("el requerimiento de skynet quedó listo").
const PATRON_ACTIVACION_LAXO = new RegExp(`^(${VARIANTES_SKYNET})\\b`)

// Exportada aparte de la clausura del hook para poder probarla sin navegador
// (es la pieza más frágil de todo esto: depende de cómo el transcriptor en
// es-CO deforme una palabra inglesa). Devuelve null si no hubo activación, o
// `{ resto }` con lo que la persona dijo DESPUÉS de la frase de activación
// ('' si solo dijo "Oye Skynet" y se quedó esperando).
export function detectarActivacion(texto) {
  const normalizado = normalizar(texto)
  const coincidencia = normalizado.match(PATRON_ACTIVACION) || normalizado.match(PATRON_ACTIVACION_LAXO)
  if (!coincidencia) return null
  return { resto: normalizado.slice(coincidencia.index + coincidencia[0].length).trim() }
}

// Pide el permiso de micrófono de forma EXPLÍCITA, antes de arrancar el
// reconocimiento. Si se deja que lo pida SpeechRecognition.start() por su
// cuenta, el navegador muestra el diálogo en un momento indeterminado y, si el
// usuario lo rechaza, el fallo llega como un evento de error genérico sin que
// se pueda explicar qué pasó. Pedirlo aparte permite dar un mensaje claro.
//
// El stream se cierra de inmediato: no se necesita el audio en bruto (de eso
// se encarga la Web Speech API), solo disparar el diálogo de permiso y saber
// la respuesta.
export async function pedirPermisoMicrofono() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    // Navegador sin getUserMedia: no se puede preguntar por adelantado, se deja
    // que lo intente el propio reconocedor.
    return 'no-soportado'
  }
  // Si el usuario ya concedió el permiso en una pulsación anterior, no hace
  // falta abrir el micrófono otra vez solo para confirmarlo — eso agregaba un
  // round-trip innecesario a CADA pulsación del botón, justo la ruta que debía
  // sentirse inmediata. La Permissions API solo consulta el estado ya
  // decidido, sin volver a pedir nada. No todos los navegadores soportan la
  // consulta para 'microphone' (Firefox no la tiene) — si falla, se sigue por
  // el camino de siempre.
  try {
    const estado = await navigator.permissions?.query({ name: 'microphone' })
    if (estado?.state === 'granted') return 'concedido'
    if (estado?.state === 'denied') return 'denegado'
  } catch {
    /* Permissions API no disponible para 'microphone' en este navegador */
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const pista of stream.getTracks()) pista.stop()
    return 'concedido'
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') return 'denegado'
    if (err.name === 'NotFoundError') return 'sin-microfono'
    return 'error'
  }
}

export function useReconocimientoVoz({ onPregunta, pausado = false } = {}) {
  const [escuchandoWake, setEscuchandoWake] = useState(false)
  const [capturandoPregunta, setCapturandoPregunta] = useState(false)
  const [parcial, setParcial] = useState('')
  const [error, setError] = useState('')
  const [pidiendoPermiso, setPidiendoPermiso] = useState(false)

  const reconocedorRef = useRef(null)
  const modoRef = useRef(null) // 'wake' | 'pregunta' | null
  const wakeActivoRef = useRef(false)
  const pausadoRef = useRef(pausado)
  const onPreguntaRef = useRef(onPregunta)

  useEffect(() => {
    onPreguntaRef.current = onPregunta
  }, [onPregunta])

  // Mientras Skynet habla se suspende la escucha: si no, el micrófono capta la
  // propia respuesta por el altavoz y puede volver a autoactivarse en bucle.
  useEffect(() => {
    pausadoRef.current = pausado
    if (pausado) detenerReconocedor()
    else if (wakeActivoRef.current) arrancar('wake')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausado])

  // Vigilante: bug conocido de Chrome en modo `continuous` — el reconocedor a
  // veces se queda "vivo" pero deja de emitir resultados y NUNCA dispara
  // `onend` (así que el reintento normal de onend nunca se activa). Sin este
  // respaldo, "Oye Skynet" podía quedar escuchando en silencio indefinidamente
  // tras uno de esos cuelgues, pareciendo encendido sin estarlo de verdad.
  // Reiniciar un reconocedor que sí funciona es inofensivo (un corte de medio
  // segundo, inaudible para quien habla), así que se hace incondicionalmente.
  useEffect(() => {
    if (!escuchandoWake) return
    const intervalo = setInterval(() => {
      if (wakeActivoRef.current && !pausadoRef.current) arrancar('wake')
    }, 15000)
    return () => clearInterval(intervalo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escuchandoWake])

  const soportado = Boolean(SpeechRecognition)

  function detenerReconocedor() {
    const r = reconocedorRef.current
    reconocedorRef.current = null
    modoRef.current = null
    if (r) {
      r.onend = null // evita que el handler lo reinicie
      r.onresult = null
      r.onerror = null
      try {
        r.stop()
      } catch {
        /* ya estaba detenido */
      }
    }
    setCapturandoPregunta(false)
    setParcial('')
  }

  function arrancar(modo) {
    if (!SpeechRecognition || pausadoRef.current) return
    detenerReconocedor()

    const r = new SpeechRecognition()
    r.lang = 'es-CO'
    r.interimResults = true
    // En modo pregunta se corta solo al terminar de hablar; en wake se mantiene
    // abierto buscando la frase de activación.
    r.continuous = modo === 'wake'
    r.maxAlternatives = 1

    r.onresult = (evento) => {
      let textoFinal = ''
      let textoParcial = ''
      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const t = evento.results[i][0].transcript
        if (evento.results[i].isFinal) textoFinal += t
        else textoParcial += t
      }
      setParcial(textoParcial)

      if (!textoFinal.trim()) return

      if (modoRef.current === 'wake') {
        const activacion = detectarActivacion(textoFinal)
        // Diagnóstico en consola: sin esto no hay forma de saber, cuando "no
        // responde", si el motor transcribió otra cosa (regex no la reconoce)
        // o si nunca llegó a transcribir nada. Se deja siempre activo (no solo
        // en dev): es una herramienta interna, no un producto público, y ver
        // "qué entendió" en DevTools es el primer paso para ajustar el patrón.
        console.debug(
          `[Skynet wake] escuchó: "${textoFinal.trim()}" ${activacion ? '→ ACTIVÓ' : '→ no coincide con "Oye Skynet"'}`
        )
        if (!activacion) return
        // Si dijo "Oye Skynet, ¿cuántos requerimientos tengo?" en una sola
        // frase, lo que va después de la activación YA es la pregunta y no
        // hace falta un segundo turno.
        const { resto } = activacion
        if (resto) {
          onPreguntaRef.current?.(resto)
          return // el widget pausa la escucha mientras responde
        }
        setCapturandoPregunta(true)
        modoRef.current = 'pregunta'
        arrancar('pregunta')
        return
      }

      // modo 'pregunta': lo dicho es la consulta completa
      const pregunta = textoFinal.trim()
      detenerReconocedor()
      if (pregunta) onPreguntaRef.current?.(pregunta)
    }

    // Diagnóstico: confirma en consola que el navegador de verdad arrancó la
    // captura y detectó voz, para distinguir "el micrófono nunca se activó"
    // (revisar permisos/hardware) de "se activó pero no oye" (revisar
    // volumen/ruido) de "oye pero no reconoce la frase" (ver el log de
    // onresult más arriba) — son tres fallas distintas con arreglos distintos.
    if (modo === 'wake') {
      r.onstart = () => console.debug('[Skynet wake] micrófono activo, escuchando…')
      r.onspeechstart = () => console.debug('[Skynet wake] detectó que alguien está hablando…')
    }

    r.onerror = (evento) => {
      // 'no-speech'/'aborted' son ruido normal del bucle continuo, no fallos
      // que valga la pena mostrarle al usuario.
      if (evento.error === 'no-speech' || evento.error === 'aborted') return
      if (evento.error === 'not-allowed') {
        wakeActivoRef.current = false
        setEscuchandoWake(false)
        setError('No diste permiso para usar el micrófono.')
        return
      }
      setError(`Error de micrófono: ${evento.error}`)
    }

    r.onend = () => {
      // Chrome corta el reconocimiento continuo cada cierto tiempo: se vuelve
      // a levantar solo si el usuario sigue con "Oye Skynet" encendido.
      if (modoRef.current === 'wake' && wakeActivoRef.current && !pausadoRef.current) {
        arrancar('wake')
      } else if (modoRef.current === 'pregunta') {
        setCapturandoPregunta(false)
      }
    }

    modoRef.current = modo
    reconocedorRef.current = r
    try {
      r.start()
    } catch {
      /* start() lanza si ya estaba corriendo; el onend lo reintenta */
    }
  }

  // Traduce el resultado de pedirPermisoMicrofono() a un mensaje que la
  // persona entienda (dónde arreglarlo), en vez del error genérico y opaco que
  // deja SpeechRecognition cuando el permiso ya viene denegado.
  async function asegurarPermiso() {
    setPidiendoPermiso(true)
    const resultado = await pedirPermisoMicrofono()
    setPidiendoPermiso(false)
    if (resultado === 'denegado') {
      setError('Bloqueaste el acceso al micrófono. Actívalo desde el icono de candado/cámara en la barra de direcciones y vuelve a intentar.')
      return false
    }
    if (resultado === 'sin-microfono') {
      // NotFoundError casi nunca es "este equipo no tiene micrófono": lo más
      // común, sobre todo en Windows, es que el sistema operativo le esté
      // ocultando TODOS los micrófonos al navegador (Configuración > Privacidad
      // y seguridad > Micrófono > "Acceso al micrófono" o "Permitir que las
      // aplicaciones de escritorio accedan a tu micrófono", ambos apagados) —
      // en ese caso Chrome/Edge no logran ni enumerar el dispositivo, así que
      // el error es indistinguible de que de verdad no exista.
      setError(
        'El navegador no encontró ningún micrófono. Si el equipo sí tiene uno, revisa Configuración de Windows → Privacidad y seguridad → Micrófono, y activa el acceso para el navegador.'
      )
      return false
    }
    if (resultado === 'error') {
      setError('No se pudo acceder al micrófono.')
      return false
    }
    return true // 'concedido' o 'no-soportado' (se deja intentar igual)
  }

  // Pulsar para hablar: pide el permiso explícitamente y, si se concede, hace
  // una captura puntual sin dejar el micrófono abierto.
  const escucharUnaVez = useCallback(async () => {
    if (!SpeechRecognition) return
    setError('')
    if (!(await asegurarPermiso())) return
    setCapturandoPregunta(true)
    arrancar('pregunta')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activarWake = useCallback(async () => {
    if (!SpeechRecognition) return
    setError('')
    if (!(await asegurarPermiso())) return
    wakeActivoRef.current = true
    setEscuchandoWake(true)
    arrancar('wake')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const desactivarWake = useCallback(() => {
    wakeActivoRef.current = false
    setEscuchandoWake(false)
    detenerReconocedor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const detener = useCallback(() => {
    detenerReconocedor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => detenerReconocedor()
  }, [])

  return {
    soportado,
    escuchandoWake,
    capturandoPregunta,
    pidiendoPermiso,
    parcial,
    error,
    escucharUnaVez,
    activarWake,
    desactivarWake,
    detener,
  }
}
