import { useTematica } from '../useTematica.js'
import '../base.css'

// Detalle sobre la esquina superior izquierda de un botón (el botón debe ser
// `relative`). `grande` lo agranda (p. ej. sobre el logo del login). La temática aporta un componente `Gorro` propio o un `gorroEmoji`.
export default function TematicaGorro({ grande = false }) {
  const { tematica } = useTematica()
  if (!tematica) return null
  const { Gorro, gorroEmoji } = tematica
  if (Gorro) return <Gorro grande={grande} />
  if (gorroEmoji) return <span className="tem-gorro-emoji" aria-hidden="true">{gorroEmoji}</span>
  return null
}
