import { useTematica } from '../useTematica.js'

// Decoración de la pantalla de login. La temática aporta componentes propios:
//   LoginFondo → capa a pantalla completa (nieve, confeti…)
//   LoginHero  → sobre la foto de la columna izquierda
//   LoginPie   → al pie de la columna del formulario
// zona: 'fondo' | 'hero' | 'pie'. Sin temática (o sin ese componente) no pinta nada.
const CAMPO = { fondo: 'LoginFondo', hero: 'LoginHero', pie: 'LoginPie' }

export default function TematicaLogin({ zona }) {
  const { tematica } = useTematica()
  const Componente = tematica?.[CAMPO[zona]]
  return Componente ? <Componente /> : null
}
