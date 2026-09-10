import { useCallback, useEffect, useRef, useState } from 'react'
import { reproducirCampanita } from './campanitaInstitucional.js'
import { avisosTerminal } from '../../api/avisosTerminal.js'

// Pausa entre la campanita y el arranque de la voz — pedida explícitamente
// entre 300 y 500 ms: suficiente para que el oído "suelte" el timbre de la
// campana antes de que empiece a hablar, sin sentirse como un silencio
// muerto.
const PAUSA_TRAS_CAMPANITA_MS = 400

// Réplica deliberadamente pequeña de la selección de voz de
// components/copiloto/useHablar.js (no se importa de ahí): ese hook resuelve
// un problema distinto — hablar un STREAM de oraciones sueltas — y acoplarse
// a él por una utilidad de 15 líneas arriesgaría romper el asistente de voz
// del copiloto por un cambio pensado para este módulo. Un anuncio
// institucional siempre es una frase completa y ya armada.
function vocesEnEspanol(voces) {
  return voces.filter((v) => /^es/i.test(v.lang))
}

// La Web Speech API local solo se usa como RESPALDO (ver reproducir() más
// abajo) cuando el aviso no trae audio generado por el servidor — no hay
// forma de "subir" una voz mejor desde acá para ese caso. Lo único que este
// código controla es CUÁL de las voces instaladas usar por defecto, y ahí sí
// hay una diferencia real: en Chrome, las voces marcadas `localService:false`
// ("Google español", etc.) son sintetizadas en la nube con un motor mucho
// más natural que las voces locales del sistema operativo (en Windows, el
// motor SAPI local es el que suena más "robótico"). Se prioriza una voz de
// red en español sobre una local cuando ambas están disponibles; dentro de
// cada grupo, se prefiere el español latino (es-CO primero) sobre es-ES.
function puntuarVoz(v) {
  let puntos = 0
  if (v.localService === false) puntos += 10 // voz de red (Google) — menos "robótica"
  if (/es-CO/i.test(v.lang)) puntos += 3
  else if (/^es-(419|MX|AR|PE|CL|EC|VE|BO|PY|UY|CR|PA|GT|HN|SV|NI|DO|CU|PR|US)/i.test(v.lang)) puntos += 2
  else if (/^es/i.test(v.lang)) puntos += 1
  return puntos
}

function elegirVozPorDefecto(voces) {
  const esp = vocesEnEspanol(voces)
  if (!esp.length) return voces[0] || null
  return [...esp].sort((a, b) => puntuarVoz(b) - puntuarVoz(a))[0]
}

const ESPERA_VOCES_MS = 4000
const INTERVALO_SONDEO_MS = 200

// getVoices() suele venir vacío hasta que el navegador termina de cargar la
// lista de forma asíncrona (mismo problema documentado en useHablar.js): se
// sondea en vez de asumir un tiempo fijo, con un tope para no colgar la
// locución en un equipo sin ninguna voz instalada.
function cargarVoces() {
  return new Promise((resolve) => {
    if (window.speechSynthesis.getVoices().length > 0) return resolve()
    let terminado = false
    const terminar = () => {
      if (terminado) return
      terminado = true
      window.speechSynthesis.removeEventListener('voiceschanged', terminar)
      clearInterval(sondeo)
      clearTimeout(limite)
      resolve()
    }
    window.speechSynthesis.addEventListener('voiceschanged', terminar)
    const sondeo = setInterval(() => {
      if (window.speechSynthesis.getVoices().length > 0) terminar()
    }, INTERVALO_SONDEO_MS)
    const limite = setTimeout(terminar, ESPERA_VOCES_MS)
  })
}

// Preferencia de voz LOCAL de respaldo, por dispositivo (localStorage, no
// viaja al backend): solo entra en juego cuando el aviso no trae audio
// generado en el servidor (ver reproducir()) — no existe una sola voz local
// que se pueda "transmitir" igual a todos, por eso el aviso normal usa la
// voz institucional generada una sola vez en el servidor en vez de esto.
const CLAVE_VOZ_PREFERIDA = 'skynet_voz_aviso_terminal'

function leerVozGuardada() {
  try {
    return localStorage.getItem(CLAVE_VOZ_PREFERIDA) || ''
  } catch {
    return ''
  }
}

// Reproduce un <audio> apuntando a un Blob URL y resuelve cuando termina.
// Usa el mismo contrato { completado, bloqueadoPorAutoplay } que hablar():
// a diferencia de SpeechSynthesisUtterance (cuyo bloqueo por autoplay solo
// se puede inferir por no haber llegado a 'onstart'), HTMLMediaElement.play()
// rechaza DIRECTAMENTE con NotAllowedError cuando el navegador lo bloquea
// por falta de gesto reciente — señal limpia, sin heurística.
function reproducirElementoAudio(url, audioRef, { volumen = 1 } = {}) {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    audio.volume = volumen
    audioRef.current = audio

    let resuelto = false
    const terminar = (resultado) => {
      if (resuelto) return
      resuelto = true
      resolve(resultado)
    }

    audio.addEventListener('ended', () => terminar({ completado: true, bloqueadoPorAutoplay: false }))
    audio.addEventListener('error', () => terminar({ completado: false, bloqueadoPorAutoplay: false }))
    audio.play().catch((err) => {
      terminar({ completado: false, bloqueadoPorAutoplay: err.name === 'NotAllowedError' })
    })
  })
}

// Reproduce el flujo completo de un Aviso Terminal de Neiva: campanita ->
// pausa -> voz. La voz prioriza el audio institucional generado UNA VEZ en
// el servidor (misma voz para todos los destinatarios, ver
// Backend/src/modules/avisos_terminal/avisos.tts.js) — si el aviso no trae
// audio (falló la generación, típicamente por la cuota gratuita del modelo
// de voz, o es un aviso viejo de antes de esta función) cae a la voz local
// del dispositivo (SpeechSynthesis), igual que antes.
//
// Expone `fase` para que la UI pueda mostrar "sonando la campanita" vs
// "hablando" con estados visuales distintos, `detener()` para poder cortar
// el audio en cualquier punto del flujo, `reintentar()` para repetir el
// último intento con un gesto real del usuario (tras un bloqueo de
// autoplay), y control de la voz LOCAL de respaldo
// (`vocesDisponibles`/`elegirVoz`/`probarVoz`) para quien reciba un aviso
// sin audio institucional.
export function useAnuncioVoz() {
  const [reproduciendo, setReproduciendo] = useState(false)
  const [fase, setFase] = useState('inactivo') // 'campanita' | 'voz' | 'inactivo'
  const [vocesDisponibles, setVocesDisponibles] = useState([])
  const [vozElegidaURI, setVozElegidaURI] = useState(leerVozGuardada)
  const canceladoRef = useRef(false)
  const vozElegidaRef = useRef(null)
  const audioActualRef = useRef(null)
  const ultimoIntentoRef = useRef(null) // { textoLocucion, avisoId }

  const soportado = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    if (!soportado) return
    let cancelado = false
    cargarVoces().then(() => {
      if (cancelado) return
      setVocesDisponibles(vocesEnEspanol(window.speechSynthesis.getVoices()))
    })
    return () => {
      cancelado = true
    }
  }, [soportado])

  useEffect(() => {
    if (!vocesDisponibles.length) {
      vozElegidaRef.current = null
      return
    }
    const guardada = vozElegidaURI && vocesDisponibles.find((v) => v.voiceURI === vozElegidaURI)
    vozElegidaRef.current = guardada || elegirVozPorDefecto(vocesDisponibles)
  }, [vocesDisponibles, vozElegidaURI])

  // AvisoTerminalPlayer.jsx (el reproductor global que auto-encola los
  // avisos entrantes) y esta misma página cuando alguien "prueba"/"repite"
  // una voz son instancias SEPARADAS de este hook — a propósito, para que
  // reproducir manualmente un aviso viejo no interfiera con la cola
  // automática en curso. Sin este evento, cambiar la voz local de respaldo
  // desde "Mis avisos" solo se notaría DESPUÉS de recargar la página, porque
  // cada instancia solo lee localStorage una vez al montarse.
  useEffect(() => {
    function alCambiar(event) {
      if (typeof event.detail === 'string') setVozElegidaURI(event.detail)
    }
    window.addEventListener('skynet:voz-aviso-cambiada', alCambiar)
    return () => window.removeEventListener('skynet:voz-aviso-cambiada', alCambiar)
  }, [])

  const elegirVoz = useCallback((voiceURI) => {
    setVozElegidaURI(voiceURI)
    try {
      localStorage.setItem(CLAVE_VOZ_PREFERIDA, voiceURI)
    } catch {
      /* navegación privada u otro bloqueo de localStorage: la elección solo dura esta sesión */
    }
    window.dispatchEvent(new CustomEvent('skynet:voz-aviso-cambiada', { detail: voiceURI }))
  }, [])

  const limpiarMediaSession = useCallback(() => {
    try {
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'
    } catch {
      /* MediaSession no disponible en este navegador: degrada sin romper nada */
    }
  }, [])

  const detener = useCallback(() => {
    canceladoRef.current = true
    if (soportado) window.speechSynthesis.cancel()
    if (audioActualRef.current) {
      audioActualRef.current.pause()
      audioActualRef.current = null
    }
    setReproduciendo(false)
    setFase('inactivo')
    limpiarMediaSession()
  }, [limpiarMediaSession, soportado])

  function hablar(texto, vozForzada, { volumen = 1, rate = 1 } = {}) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(texto)
      const voz = vozForzada !== undefined ? vozForzada : vozElegidaRef.current
      if (voz) {
        utterance.voice = voz
        utterance.lang = voz.lang
      } else {
        utterance.lang = 'es-CO'
      }
      // Volumen máximo permitido por la Web Speech API (0-1): sigue
      // gobernado por el volumen MULTIMEDIA del dispositivo, nunca lo
      // sobrepasa ni toca el volumen del sistema — ver requisitos de
      // audibilidad ("sin saltarse el control de volumen del usuario").
      utterance.volume = volumen
      utterance.rate = rate
      utterance.pitch = 1

      let empezoAHablar = false
      utterance.onstart = () => {
        empezoAHablar = true
      }
      utterance.onend = () => resolve({ completado: !canceladoRef.current, bloqueadoPorAutoplay: false })
      utterance.onerror = () =>
        resolve({
          completado: false,
          bloqueadoPorAutoplay: !empezoAHablar && !canceladoRef.current,
        })

      window.speechSynthesis.speak(utterance)
    })
  }

  // Deja oír una voz LOCAL específica (de respaldo) sin afectar la que está
  // elegida ni el flujo en curso — para un botón "probar" en el selector.
  const probarVoz = useCallback(
    (voiceURI) => {
      if (!soportado) return
      const voz = vocesDisponibles.find((v) => v.voiceURI === voiceURI)
      window.speechSynthesis.cancel()
      setTimeout(() => hablar('Así suena esta voz en los avisos del Terminal.', voz || null), 60)
    },
    [soportado, vocesDisponibles]
  )

  const encenderMediaSession = useCallback(() => {
    try {
      if ('mediaSession' in navigator && 'MediaMetadata' in window) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Aviso institucional',
          artist: 'Terminal de Transportes de Neiva',
        })
        navigator.mediaSession.setActionHandler('stop', () => detener())
        navigator.mediaSession.setActionHandler('pause', () => detener())
        navigator.mediaSession.playbackState = 'playing'
      }
    } catch {
      /* MediaSession es un realce, no un requisito — el anuncio sigue sonando sin él */
    }
  }, [detener])

  // Devuelve { completado, bloqueadoPorAutoplay } — el reproductor global usa
  // `bloqueadoPorAutoplay` para mostrar el botón "Toca para escuchar" cuando
  // el navegador no permitió que el audio arrancara solo (política de
  // autoplay sin gesto reciente del usuario), en vez de fingir que sonó.
  const intentar = useCallback(
    async ({ textoLocucion, avisoId = null }) => {
      ultimoIntentoRef.current = { textoLocucion, avisoId }
      canceladoRef.current = false
      setReproduciendo(true)
      setFase('campanita')

      // La campanita "ligeramente por debajo de la voz" (0.75 vs 1.0, ver
      // requisitos de audibilidad) — nunca al mismo nivel para que la voz
      // sea inequívocamente el foco del anuncio.
      await reproducirCampanita({ volumen: 0.75 })
      if (canceladoRef.current) {
        setReproduciendo(false)
        return { completado: false, bloqueadoPorAutoplay: false }
      }

      await new Promise((resolve) => setTimeout(resolve, PAUSA_TRAS_CAMPANITA_MS))
      if (canceladoRef.current) {
        setReproduciendo(false)
        return { completado: false, bloqueadoPorAutoplay: false }
      }

      setFase('voz')
      encenderMediaSession()

      // Camino principal: la voz institucional generada en el servidor
      // (misma para todos). Si el aviso no tiene audio (404: no se generó,
      // ver crearYTransmitirAviso en avisos.service.js), obtenerAudio()
      // lanza y se cae al respaldo local de abajo.
      if (avisoId) {
        try {
          const blob = await avisosTerminal.obtenerAudio(avisoId)
          const url = URL.createObjectURL(blob)
          const resultado = await reproducirElementoAudio(url, audioActualRef, { volumen: 1 })
          URL.revokeObjectURL(url)
          setReproduciendo(false)
          setFase('inactivo')
          limpiarMediaSession()
          return resultado
        } catch {
          // Sin audio institucional disponible: sigue al respaldo local.
        }
      }

      if (!soportado) {
        setReproduciendo(false)
        setFase('inactivo')
        return { completado: false, bloqueadoPorAutoplay: false }
      }

      await cargarVoces()
      if (!vocesDisponibles.length) setVocesDisponibles(vocesEnEspanol(window.speechSynthesis.getVoices()))
      if (!vozElegidaRef.current) {
        vozElegidaRef.current = vozElegidaURI
          ? window.speechSynthesis.getVoices().find((v) => v.voiceURI === vozElegidaURI)
          : elegirVozPorDefecto(vocesEnEspanol(window.speechSynthesis.getVoices()))
      }

      const resultado = await hablar(textoLocucion, undefined, { volumen: 1, rate: 1 })

      setReproduciendo(false)
      setFase('inactivo')
      limpiarMediaSession()
      return resultado
    },
    [encenderMediaSession, limpiarMediaSession, soportado, vocesDisponibles.length, vozElegidaURI]
  )

  const reproducir = useCallback((args) => intentar(args), [intentar])

  // Repite el ÚLTIMO intento (mismo aviso, mismo avisoId si tenía audio
  // institucional) con un gesto real del usuario — para el botón "Escuchar"
  // tras un bloqueo de autoplay, o "Repetir" una vez terminado.
  const reintentar = useCallback(() => {
    if (!ultimoIntentoRef.current) return Promise.resolve({ completado: false, bloqueadoPorAutoplay: false })
    return intentar(ultimoIntentoRef.current)
  }, [intentar])

  return {
    reproducir,
    reintentar,
    detener,
    reproduciendo,
    fase,
    soportado,
    vocesDisponibles,
    vozElegidaURI: vozElegidaRef.current?.voiceURI || vozElegidaURI,
    elegirVoz,
    probarVoz,
  }
}
