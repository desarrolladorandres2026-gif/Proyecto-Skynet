import { useTematica } from '../useTematica.js'

// Decoración de la app en teléfono (MobileShell). La temática aporta:
//   MovilFondo → capa sobre toda la app (nieve ligera, confeti…)
//   MovilPie   → sobre el borde de la barra inferior (el padre debe ser `relative`)
// zona: 'fondo' | 'pie'. Sin temática (o sin ese componente) no pinta nada.
export default function TematicaMovil({ zona }) {
  const { tematica } = useTematica()
  const Componente = zona === 'fondo' ? tematica?.MovilFondo : tematica?.MovilPie
  return Componente ? <Componente /> : null
}
