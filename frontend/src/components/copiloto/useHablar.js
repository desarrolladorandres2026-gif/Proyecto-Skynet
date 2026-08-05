import { useCallback, useEffect, useRef, useState } from 'react'

// Lee en voz alta la respuesta de Skynet CONFORME VA LLEGANDO del stream, no
// al final: apenas se cierra una oración completa se manda a hablar, mientras
// el modelo sigue generando el resto. Sin esto habría que esperar la respuesta
// entera (~2 s) antes de oír la primera palabra, y se perdería la sensación de
// inmediatez que da el streaming.
//
// Es primo de modules/induccion/useNarracionVoz.js (misma Web Speech API y
// misma preferencia de voz es-CO) pero resuelve un problema distinto: aquel
// narra una lista de textos ya conocida de antemano; este recibe un chorro de
// trozos sueltos y tiene que decidir dónde termina cada oración.

// Corta en el signo de puntuación final, incluidos los de cierre del español.
// El salto de línea también cierra oración: el modelo suele usar viñetas.
const FIN_DE_ORACION = /([.!?…:;\n]+)\s*/

// El modelo responde en Markdown (**negrita**, listas con - o *). Sin limpiar,
// el sintetizador lee "asterisco asterisco siete asterisco asterisco".
function limpiarParaVoz(texto) {
  return texto
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/_{2,}/g, '')
    .trim()
}

function elegirVoz() {
  const voces = window.speechSynthesis.getVoices()
  return (
    voces.find((v) => /es-CO/i.test(v.lang)) ||
    voces.find((v) => /^es/i.test(v.lang)) ||
    voces[0] ||
    null
  )
}

// getVoices() suele venir vacío en la primera llamada (el navegador carga las
// voces de forma asíncrona) — sin esperar, la primera respuesta se leería con
// la voz por defecto en inglés.
function cargarVoces() {
  return new Promise((resolve) => {
    if (window.speechSynthesis.getVoices().length > 0) return resolve()
    const onVoces = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoces)
      resolve()
    }
    window.speechSynthesis.addEventListener('voiceschanged', onVoces)
    setTimeout(resolve, 1000)
  })
}

export function useHablar() {
  const [hablando, setHablando] = useState(false)
  const pendienteRef = useRef('') // texto recibido que aún no forma una oración
  const cancelarRef = useRef(false)
  const vocesListasRef = useRef(false)

  const soportado = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    return () => {
      cancelarRef.current = true
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
    }
  }, [])

  const decir = useCallback((frase) => {
    const limpio = limpiarParaVoz(frase)
    if (!limpio || cancelarRef.current) return
    const mensaje = new SpeechSynthesisUtterance(limpio)
    const voz = elegirVoz()
    if (voz) {
      mensaje.voice = voz
      mensaje.lang = voz.lang
    }
    mensaje.rate = 1.05 // un pelo más rápido que la narración de inducción
    mensaje.onstart = () => setHablando(true)
    // `speechSynthesis.speaking` sigue en true mientras queden frases en cola;
    // solo se baja la bandera cuando de verdad se vació.
    const alTerminar = () => {
      if (!window.speechSynthesis.pending && !window.speechSynthesis.speaking) setHablando(false)
    }
    mensaje.onend = alTerminar
    mensaje.onerror = alTerminar
    window.speechSynthesis.speak(mensaje)
  }, [])

  // Recibe cada trozo del stream y habla solo las oraciones ya cerradas; lo
  // que quede a medias se guarda para el siguiente trozo.
  const encolarTexto = useCallback(
    async (trozo) => {
      if (!soportado || cancelarRef.current) return
      if (!vocesListasRef.current) {
        await cargarVoces()
        vocesListasRef.current = true
      }
      pendienteRef.current += trozo

      let corte = pendienteRef.current.search(FIN_DE_ORACION)
      while (corte !== -1) {
        const match = pendienteRef.current.match(FIN_DE_ORACION)
        const hasta = corte + match[0].length
        decir(pendienteRef.current.slice(0, hasta))
        pendienteRef.current = pendienteRef.current.slice(hasta)
        corte = pendienteRef.current.search(FIN_DE_ORACION)
      }
    },
    [decir, soportado]
  )

  // Al cerrar el stream: habla el resto que no alcanzó a cerrar oración.
  const finalizar = useCallback(() => {
    if (!soportado) return
    const resto = pendienteRef.current
    pendienteRef.current = ''
    if (resto.trim()) decir(resto)
  }, [decir, soportado])

  const detener = useCallback(() => {
    pendienteRef.current = ''
    if (soportado) window.speechSynthesis.cancel()
    setHablando(false)
  }, [soportado])

  // Se llama antes de cada respuesta nueva: limpia la cola de la anterior.
  const reiniciar = useCallback(() => {
    cancelarRef.current = false
    pendienteRef.current = ''
    if (soportado) window.speechSynthesis.cancel()
  }, [soportado])

  return { hablando, encolarTexto, finalizar, detener, reiniciar, soportado }
}
