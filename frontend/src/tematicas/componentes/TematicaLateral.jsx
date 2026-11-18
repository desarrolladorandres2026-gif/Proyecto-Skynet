import { useTematica } from '../useTematica.js'

// Decoración de la barra lateral. La temática aporta componentes propios:
//   LateralFondo → capa que va como PRIMER hijo de la barra (nieve, luces…)
//   LateralPie   → bloque que va al FINAL, debajo del menú
// zona: 'fondo' | 'pie'. Sin temática (o sin ese componente) no pinta nada.
export default function TematicaLateral({ zona }) {
  const { tematica } = useTematica()
  const Componente = zona === 'fondo' ? tematica?.LateralFondo : tematica?.LateralPie
  return Componente ? <Componente /> : null
}
