import { useTematica } from '../useTematica.js'
import '../base.css'

// Adornos dentro de la barra superior (lado: 'izq' | 'der'): en el flujo
// normal, nunca encima de texto. Cada item: { emoji, animacion?: 'saludo'|'salto' }.
export default function TematicaAdorno({ lado }) {
  const { tematica } = useTematica()
  const items = tematica?.adorno?.[lado]
  if (!items?.length) return null
  return (
    <span className={`tem-adorno tem-adorno-${lado}`} aria-hidden="true">
      {items.map(({ emoji, animacion }) => (
        <span key={emoji} className={animacion ? `tem-anim-${animacion}` : undefined}>{emoji}</span>
      ))}
    </span>
  )
}
