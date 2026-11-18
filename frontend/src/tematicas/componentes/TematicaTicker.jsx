import { useEffect, useState } from 'react'
import { useTematica } from '../useTematica.js'

const TICKER_EVERY_MS = 2500
const TICKER_SLIDE_MS = 500

// Ticker vertical decorativo con las frases de la temática activa: una a la
// vez, sube y da paso a la siguiente. La primera se repite al final para que
// el bucle no tenga salto visible. Sin temática (o sin frases) no pinta nada.
export default function TematicaTicker() {
  const { tematica } = useTematica()
  const mensajes = tematica?.ticker
  if (!mensajes?.length) return null
  // key: al cambiar de temática se reinicia el carrusel desde la primera frase.
  return <Carrusel key={tematica.id} mensajes={mensajes} />
}

function Carrusel({ mensajes }) {
  const [index, setIndex] = useState(0)
  const [snap, setSnap] = useState(false)
  const total = mensajes.length

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => i + 1), TICKER_EVERY_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (index !== total) return undefined
    const id = setTimeout(() => { setSnap(true); setIndex(0) }, TICKER_SLIDE_MS)
    return () => clearTimeout(id)
  }, [index, total])

  useEffect(() => {
    if (!snap) return undefined
    const id = setTimeout(() => setSnap(false), 50)
    return () => clearTimeout(id)
  }, [snap])

  const frases = [...mensajes, mensajes[0]]

  return (
    <div aria-hidden="true" className="hidden h-8 min-w-0 flex-1 justify-center overflow-hidden md:flex">
      <div
        style={{ transform: `translateY(-${index * 2}rem)`, transitionDuration: `${TICKER_SLIDE_MS}ms` }}
        className={`flex shrink-0 flex-col ${snap ? 'transition-none' : 'transition-transform ease-in-out'} motion-reduce:transition-none`}
      >
        {frases.map((texto, i) => (
          <span key={i} className="flex h-8 shrink-0 items-center justify-center whitespace-nowrap text-base font-semibold">
            {texto}
          </span>
        ))}
      </div>
    </div>
  )
}
