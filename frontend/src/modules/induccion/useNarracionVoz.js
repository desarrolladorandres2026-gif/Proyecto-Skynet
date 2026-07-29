import { useCallback, useEffect, useRef, useState } from 'react'

// Lee en voz alta un arreglo de textos, uno tras otro, usando la Web Speech
// API del navegador (igual que el "agente" de voz del induccion/*.html
// original). Es un extra de accesibilidad: si el navegador no soporta
// speechSynthesis, simplemente no hace nada y el contenido sigue siendo
// legible en pantalla como siempre.
export function useNarracionVoz() {
  const [reproduciendo, setReproduciendo] = useState(false)
  const cancelarRef = useRef(false)

  useEffect(() => {
    return () => {
      cancelarRef.current = true
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  function elegirVoz() {
    const voces = window.speechSynthesis.getVoices()
    return (
      voces.find((v) => /es-CO/i.test(v.lang)) ||
      voces.find((v) => /^es/i.test(v.lang)) ||
      voces[0] ||
      null
    )
  }

  function cargarVoces() {
    return new Promise((resolve) => {
      const voces = window.speechSynthesis.getVoices()
      if (voces.length > 0) return resolve()
      const onVoces = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoces)
        resolve()
      }
      window.speechSynthesis.addEventListener('voiceschanged', onVoces)
      // Algunos navegadores nunca disparan voiceschanged si ya no hay voces
      // instaladas: no bloquear la narración indefinidamente.
      setTimeout(resolve, 1000)
    })
  }

  function hablarUno(texto) {
    return new Promise((resolve) => {
      if (cancelarRef.current) return resolve()
      const mensaje = new SpeechSynthesisUtterance(texto)
      const voz = elegirVoz()
      if (voz) {
        mensaje.voice = voz
        mensaje.lang = voz.lang
      }
      mensaje.rate = 0.98
      mensaje.pitch = 1
      mensaje.onend = resolve
      mensaje.onerror = resolve
      window.speechSynthesis.speak(mensaje)
    })
  }

  const iniciar = useCallback(async (pasos) => {
    if (!('speechSynthesis' in window)) return
    cancelarRef.current = false
    window.speechSynthesis.cancel()
    setReproduciendo(true)
    await cargarVoces()
    for (const paso of pasos) {
      if (cancelarRef.current) break
      await hablarUno(paso)
    }
    setReproduciendo(false)
  }, [])

  const detener = useCallback(() => {
    cancelarRef.current = true
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setReproduciendo(false)
  }, [])

  const soportado = typeof window !== 'undefined' && 'speechSynthesis' in window

  return { reproduciendo, iniciar, detener, soportado }
}
