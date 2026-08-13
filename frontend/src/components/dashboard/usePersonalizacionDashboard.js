import { useEffect, useMemo, useState } from 'react'

// Personalización del Dashboard denso (orden + tarjetas ocultas), persistida
// en localStorage — mismo patrón que el tema y el colapso del sidebar
// (AppLayout.jsx): preferencia de ESTE navegador, no de la cuenta, así que
// no hace falta un endpoint nuevo en el backend para algo puramente visual.
const CLAVE_ORDEN = 'skynet_dashboard_orden'
const CLAVE_OCULTAS = 'skynet_dashboard_ocultas'

function leerJSON(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? JSON.parse(crudo) : porDefecto
  } catch {
    return porDefecto
  }
}

export function usePersonalizacionDashboard(visibles) {
  const [personalizando, setPersonalizando] = useState(false)
  const [orden, setOrden] = useState(() => leerJSON(CLAVE_ORDEN, []))
  const [ocultas, setOcultas] = useState(() => new Set(leerJSON(CLAVE_OCULTAS, [])))

  useEffect(() => {
    localStorage.setItem(CLAVE_ORDEN, JSON.stringify(orden))
  }, [orden])
  useEffect(() => {
    localStorage.setItem(CLAVE_OCULTAS, JSON.stringify([...ocultas]))
  }, [ocultas])

  // El orden guardado puede quedar desactualizado (un permiso nuevo agrega
  // una tarjeta, uno retirado la quita) — se respeta el orden guardado para
  // las claves que siguen existiendo y las nuevas se agregan al final, en
  // vez de perder toda la personalización cada vez que cambia el set de
  // tarjetas disponibles.
  const ordenadas = useMemo(() => {
    const porClave = new Map(visibles.map((t) => [t.clave, t]))
    const guardadas = orden.map((c) => porClave.get(c)).filter(Boolean)
    const nuevas = visibles.filter((t) => !orden.includes(t.clave))
    return [...guardadas, ...nuevas]
  }, [visibles, orden])

  const visiblesMostradas = personalizando ? ordenadas : ordenadas.filter((t) => !ocultas.has(t.clave))

  function mover(clave, direccion) {
    setOrden(() => {
      const base = ordenadas.map((t) => t.clave)
      const i = base.indexOf(clave)
      const j = i + direccion
      if (i === -1 || j < 0 || j >= base.length) return base
      const copia = [...base]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })
  }

  function alternarOculta(clave) {
    setOcultas((actual) => {
      const copia = new Set(actual)
      if (copia.has(clave)) copia.delete(clave)
      else copia.add(clave)
      return copia
    })
  }

  function restablecer() {
    setOrden([])
    setOcultas(new Set())
  }

  return {
    personalizando,
    setPersonalizando,
    ordenadas,
    visiblesMostradas,
    hayOcultas: ocultas.size > 0,
    mover,
    alternarOculta,
    esOculta: (clave) => ocultas.has(clave),
    restablecer,
  }
}
