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
// en es-CO la devuelve deformada de varias maneras. Se aceptan las variantes
// más frecuentes en vez de exigir la escritura exacta.
const PATRON_ACTIVACION = /\b(oye|hey|oiga|ola|hola)\s+(skynet|sky\s*net|esquinet|escainet|eskinet|skinet|es\s*kainet)\b/

export function useReconocimientoVoz({ onPregunta, pausado = false } = {}) {
  const [escuchandoWake, setEscuchandoWake] = useState(false)
  const [capturandoPregunta, setCapturandoPregunta] = useState(false)
  const [parcial, setParcial] = useState('')
  const [error, setError] = useState('')

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
      const normalizado = normalizar(textoFinal)

      if (modoRef.current === 'wake') {
        const coincidencia = normalizado.match(PATRON_ACTIVACION)
        if (!coincidencia) return
        // Si dijo "Oye Skynet, ¿cuántos requerimientos tengo?" en una sola
        // frase, lo que va después de la activación YA es la pregunta y no
        // hace falta un segundo turno.
        const resto = normalizado.slice(coincidencia.index + coincidencia[0].length).trim()
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

  // Pulsar para hablar: una captura puntual, sin dejar el micrófono abierto.
  const escucharUnaVez = useCallback(() => {
    if (!SpeechRecognition) return
    setError('')
    setCapturandoPregunta(true)
    arrancar('pregunta')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activarWake = useCallback(() => {
    if (!SpeechRecognition) return
    setError('')
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
    parcial,
    error,
    escucharUnaVez,
    activarWake,
    desactivarWake,
    detener,
  }
}
