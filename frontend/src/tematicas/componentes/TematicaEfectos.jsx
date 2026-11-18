import { useEffect } from 'react'
import { TEMATICAS_ACTIVAS } from '../config.js'
import { cargarTematica, useTematica } from '../useTematica.js'
import '../base.css'

const BOMBILLOS = 12

// Capa global (se monta una vez por layout, ya con sesión): trae del servidor
// la temática vigente —al abrir y cada vez que la pestaña vuelve a estar
// visible, para que un cambio del administrador llegue sin recargar— y pinta
// la guirnalda de luces de la temática activa.
export default function TematicaEfectos() {
  const { tematica } = useTematica()

  useEffect(() => {
    if (!TEMATICAS_ACTIVAS) return undefined
    cargarTematica()
    const alVolver = () => {
      if (document.visibilityState === 'visible') cargarTematica()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])

  const colores = tematica?.luces?.colores
  if (!colores?.length) return null

  return (
    <div className="tem-luces" aria-hidden="true" style={{ '--tem-borde': tematica.luces.borde }}>
      {Array.from({ length: BOMBILLOS }, (_, i) => (
        <span
          key={i}
          className="luz"
          style={{ '--c': colores[i % colores.length], animationDelay: `${(i % 4) * 0.4}s` }}
        />
      ))}
    </div>
  )
}
