import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import Hallazgo from '../../models/mantenimiento/Hallazgo.js'

// Indicadores Personales del Técnico (Fase 3.1): panel de desarrollo, no de
// sanción — nunca se expone como ranking comparativo público entre técnicos
// (ver diseño aprobado). Cada técnico consulta solo los suyos; un supervisor
// puede consultar los de otro pasando tecnicoId explícito.
export async function obtenerIndicadoresPersonales(tecnicoId, { desde, hasta } = {}) {
  const filtroFecha = {}
  if (desde || hasta) {
    filtroFecha.creado_en = {}
    if (desde) filtroFecha.creado_en.$gte = new Date(desde)
    if (hasta) filtroFecha.creado_en.$lte = new Date(hasta)
  }

  const [misOrdenes, hallazgos] = await Promise.all([
    Mantenimiento.find({ tecnico_asignado: tecnicoId, ...filtroFecha }),
    Hallazgo.find({ registradoPor: tecnicoId, ...filtroFecha }),
  ])

  const cerradas = misOrdenes.filter((o) => o.estado === 'cerrada')
  const tiemposSolucionMs = cerradas
    .map((o) => (o.aprobacion?.aprobadoEn ? o.aprobacion.aprobadoEn.getTime() : o.creado_en.getTime()) - o.creado_en.getTime())
    .filter((ms) => ms >= 0)

  const horasTrabajadasMin = misOrdenes.reduce((acc, o) => {
    const propias = (o.horas || []).filter((h) => String(h.tecnico) === String(tecnicoId))
    return acc + propias.reduce((a, h) => a + h.tiempo_efectivo_minutos, 0)
  }, 0)

  const conSLA = cerradas.filter((o) => o.sla?.cumplido_solucion !== null && o.sla?.cumplido_solucion !== undefined)
  const cumplimientoSLA = conSLA.length ? conSLA.filter((o) => o.sla.cumplido_solucion).length / conSLA.length : null

  return {
    periodo: { desde: desde || null, hasta: hasta || null },
    ot_asignadas: misOrdenes.length,
    ot_cerradas: cerradas.length,
    tiempo_promedio_solucion_horas: tiemposSolucionMs.length
      ? Math.round((tiemposSolucionMs.reduce((a, b) => a + b, 0) / tiemposSolucionMs.length / 3_600_000) * 10) / 10
      : null,
    cumplimiento_sla: cumplimientoSLA,
    horas_trabajadas: Math.round((horasTrabajadasMin / 60) * 10) / 10,
    retrabajos: misOrdenes.filter((o) => o.reaperturas > 0).length,
    hallazgos_encontrados: hallazgos.length,
    hallazgos_resueltos: hallazgos.filter((h) => ['resuelto', 'convertido_en_ot'].includes(h.estado)).length,
    costo_materiales_administrado: misOrdenes.reduce((acc, o) => acc + (o.costo_materiales || 0), 0),
    ordenes_criticas_atendidas: misOrdenes.filter((o) => o.prioridad === 'critica').length,
  }
}
