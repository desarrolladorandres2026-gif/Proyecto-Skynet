import { useState, useEffect, useMemo } from 'react'

const STORAGE_KEY = 'skynet_dashboard_custom_v3'

export const SECCIONES_DEFECTO = [
  { id: 'kpis', label: 'Indicadores Clave (KPIs)', visible: true, ancho: 'completo' },
  { id: 'recomendaciones', label: 'Análisis & Recomendaciones', visible: true, ancho: 'medio' },
  { id: 'cola', label: 'Cola de Atención Prioritaria', visible: true, ancho: 'medio' },
]

function leerConfiguracion() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return null
    const parsed = JSON.parse(data)
    if (parsed?.secciones) {
      parsed.secciones = parsed.secciones.filter((s) => s.id !== 'graficas')
    }
    return parsed
  } catch {
    return null
  }
}

export function usePersonalizacionDashboardCompleta(visibles = []) {
  const [modalAbierto, setModalAbierto] = useState(false)
  const [config, setConfig] = useState(() => {
    const guardada = leerConfiguracion()
    return {
      secciones: guardada?.secciones || SECCIONES_DEFECTO,
      estiloKpi: guardada?.estiloKpi || 'ribbon', // 'ribbon' | 'grid' | 'pills'
      tarjetasOrden: guardada?.tarjetasOrden || [],
      tarjetasOcultas: new Set(guardada?.tarjetasOcultas || []),
      densidad: guardada?.densidad || 'compacta',
    }
  })

  useEffect(() => {
    try {
      const serializado = {
        secciones: config.secciones,
        estiloKpi: config.estiloKpi,
        tarjetasOrden: config.tarjetasOrden,
        tarjetasOcultas: Array.from(config.tarjetasOcultas),
        densidad: config.densidad,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializado))
    } catch {
      // Ignorar errores de localStorage
    }
  }, [config])

  // Asegurar que si hay nuevas secciones en el sistema se agreguen
  const seccionesOrdenadas = useMemo(() => {
    const idsExistentes = new Set(config.secciones.map((s) => s.id))
    const faltantes = SECCIONES_DEFECTO.filter((s) => !idsExistentes.has(s.id))
    return [...config.secciones, ...faltantes]
  }, [config.secciones])

  // Orden y visibilidad de tarjetas de KPI
  const tarjetasOrdenadas = useMemo(() => {
    const porClave = new Map(visibles.map((t) => [t.clave, t]))
    const guardadas = config.tarjetasOrden.map((c) => porClave.get(c)).filter(Boolean)
    const nuevas = visibles.filter((t) => !config.tarjetasOrden.includes(t.clave))
    return [...guardadas, ...nuevas]
  }, [visibles, config.tarjetasOrden])

  const tarjetasFiltradas = useMemo(() => {
    return tarjetasOrdenadas.filter((t) => !config.tarjetasOcultas.has(t.clave))
  }, [tarjetasOrdenadas, config.tarjetasOcultas])

  function alternarSeccion(id) {
    setConfig((prev) => ({
      ...prev,
      secciones: prev.secciones.map((s) =>
        s.id === id ? { ...s, visible: !s.visible } : s
      ),
    }))
  }

  function moverSeccion(id, direccion) {
    setConfig((prev) => {
      const idx = prev.secciones.findIndex((s) => s.id === id)
      const targetIdx = idx + direccion
      if (idx === -1 || targetIdx < 0 || targetIdx >= prev.secciones.length) return prev
      const copia = [...prev.secciones]
      const [removido] = copia.splice(idx, 1)
      copia.splice(targetIdx, 0, removido)
      return { ...prev, secciones: copia }
    })
  }

  function cambiarAnchoSeccion(id, ancho) {
    setConfig((prev) => ({
      ...prev,
      secciones: prev.secciones.map((s) =>
        s.id === id ? { ...s, ancho } : s
      ),
    }))
  }

  function cambiarEstiloKpi(estiloKpi) {
    setConfig((prev) => ({ ...prev, estiloKpi }))
  }

  function alternarTarjeta(clave) {
    setConfig((prev) => {
      const nuevoSet = new Set(prev.tarjetasOcultas)
      if (nuevoSet.has(clave)) nuevoSet.delete(clave)
      else nuevoSet.add(clave)
      return { ...prev, tarjetasOcultas: nuevoSet }
    })
  }

  function moverTarjeta(clave, direccion) {
    setConfig((prev) => {
      const base = tarjetasOrdenadas.map((t) => t.clave)
      const i = base.indexOf(clave)
      const j = i + direccion
      if (i === -1 || j < 0 || j >= base.length) return prev
      const copia = [...base]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return { ...prev, tarjetasOrdenadas: copia, tarjetasOrden: copia }
    })
  }

  function restablecerTodo() {
    setConfig({
      secciones: SECCIONES_DEFECTO,
      estiloKpi: 'ribbon',
      tarjetasOrden: [],
      tarjetasOcultas: new Set(),
      densidad: 'compacta',
    })
  }

  return {
    modalAbierto,
    setModalAbierto,
    secciones: seccionesOrdenadas,
    estiloKpi: config.estiloKpi,
    tarjetasOrdenadas,
    tarjetasFiltradas,
    esTarjetaOculta: (clave) => config.tarjetasOcultas.has(clave),
    alternarSeccion,
    moverSeccion,
    cambiarAnchoSeccion,
    cambiarEstiloKpi,
    alternarTarjeta,
    moverTarjeta,
    restablecerTodo,
  }
}
