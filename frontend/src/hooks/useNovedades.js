import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { esNovedadVigente, guardarVistas, hoyISO, leerVistas, rutaCoincide } from '../lib/novedades.js'

// Qué items del menú son novedad PARA ESTE usuario: marcados `nuevoHasta`
// vigente en modulosRegistry.js y todavía no visitados. Visitar la ruta del
// item (por el menú, por la paleta de comandos o con la URL directa) lo marca
// como visto, y eso se recuerda por usuario en este navegador.
//
// Se llama una vez por shell (AppLayout y MobileShell) y el resultado baja
// como prop; no es un store global porque solo uno de los dos shells está
// montado a la vez.
export function useNovedades(modulosVisibles) {
  const { usuario } = useAuth()
  const { pathname } = useLocation()
  const idUsuario = usuario?.id_usuario
  const [vistas, setVistas] = useState(() => leerVistas(idUsuario))
  const hoy = hoyISO()

  const esNueva = (item) => Boolean(item) && esNovedadVigente(item, hoy) && !vistas.has(item.to)

  useEffect(() => {
    const visitadas = modulosVisibles
      .flatMap((m) => m.items)
      .filter((item) => esNueva(item) && rutaCoincide(pathname, item))
    if (visitadas.length === 0) return
    const siguiente = new Set(vistas)
    visitadas.forEach((item) => siguiente.add(item.to))
    guardarVistas(idUsuario, siguiente)
    setVistas(siguiente)
    // esNueva se recrea en cada render; lo que realmente dispara el efecto es
    // navegar o que cambie el conjunto de vistas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, vistas, modulosVisibles])

  return {
    esNueva,
    moduloTieneNovedad: (modulo) => modulo.items.some(esNueva),
  }
}

// Valor por defecto para componentes que reciben `novedades` como prop
// opcional (y para sus tests, que no montan AuthProvider).
export const SIN_NOVEDADES = {
  esNueva: () => false,
  moduloTieneNovedad: () => false,
}
