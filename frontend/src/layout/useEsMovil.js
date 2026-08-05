import { useEffect, useState } from 'react'

// Mismo umbral 'md' que ya usan las páginas responsive del proyecto (ej.
// "md:max-w-2xl" en ReportarDanoPage.jsx) para pasar de tratamiento móvil a
// desktop — no se inventa un breakpoint nuevo.
const CONSULTA_MOVIL = '(max-width: 768px)'

// Reactivo: si alguien redimensiona la ventana del navegador (o gira el
// celular), el shell cambia solo, sin recargar la página.
export function useEsMovil() {
  const [esMovil, setEsMovil] = useState(() => window.matchMedia(CONSULTA_MOVIL).matches)

  useEffect(() => {
    const mql = window.matchMedia(CONSULTA_MOVIL)
    const onChange = (e) => setEsMovil(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return esMovil
}
