import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import Equipo from '../../models/mantenimiento/Equipo.js'
import Hallazgo from '../../models/mantenimiento/Hallazgo.js'
import InventarioMaterial from '../../models/mantenimiento/InventarioMaterial.js'
import Usuario from '../../models/Usuario.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { notificarUsuarios as _notificarUsuarios } from '../../utils/sendPush.js'

// Categoría fija para todo este módulo (ver notificaciones.catalogo.js):
// respeta la preferencia de canal/categoría del usuario en vez del envío
// solo-push incondicional de antes.
const notificarUsuarios = (userIds, payload) => _notificarUsuarios(userIds, payload, 'mantenimiento')
import { registrarAuditoria } from '../../utils/auditoria.js'
import { ESTADOS_ACTIVOS, obtenerOT, idDe, usuariosConPermiso, validarTecnico, auditar } from './comun.js'

// Módulo del Supervisor (CMMS Fase 4): centro de control, asignación
// inteligente, balanceador de carga, SLA, hallazgos, activos, alertas y
// dashboard gerencial. Todo de solo-lectura o acciones que reutilizan el
// motor de transiciones ya existente (Fase 1) — no se inventa un mecanismo
// paralelo de mutación de estado.

// ── 1. Centro de Control Operativo ──────────────────────────────────────

export async function obtenerCentroControl() {
  const ahora = new Date()
  const en2h = new Date(ahora.getTime() + 2 * 3600_000)

  const [porEstado, matrizPrioridadEstado, vencidas, proximasAVencer, tecnicoIds] = await Promise.all([
    Mantenimiento.aggregate([{ $group: { _id: '$estado', total: { $sum: 1 } } }]),
    Mantenimiento.aggregate([
      { $match: { estado: { $in: ESTADOS_ACTIVOS } } },
      { $group: { _id: { estado: '$estado', prioridad: '$prioridad' }, total: { $sum: 1 } } },
    ]),
    Mantenimiento.countDocuments({ estado: { $in: ESTADOS_ACTIVOS }, 'sla.fecha_limite_solucion': { $lt: ahora } }),
    Mantenimiento.countDocuments({ estado: { $in: ESTADOS_ACTIVOS }, 'sla.fecha_limite_solucion': { $gte: ahora, $lte: en2h } }),
    usuariosConPermiso('mantenimiento:ejecutar', { incluirSuperAdmin: false }),
  ])

  const ocupadosIds = await Mantenimiento.distinct('tecnico_asignado', {
    tecnico_asignado: { $in: tecnicoIds },
    estado: { $in: ['asignada', 'en_progreso', 'en_espera'] },
  })

  const alertas = await obtenerAlertasOperativas()

  return {
    conteosPorEstado: Object.fromEntries(porEstado.map((p) => [p._id, p.total])),
    matrizPrioridadEstado: matrizPrioridadEstado.map((m) => ({ estado: m._id.estado, prioridad: m._id.prioridad, total: m.total })),
    slaVencidas: vencidas,
    slaProximasAVencer: proximasAVencer,
    tecnicosDisponibles: tecnicoIds.length - ocupadosIds.length,
    tecnicosOcupados: ocupadosIds.length,
    alertasDestacadas: alertas.slice(0, 5),
  }
}

// ── 2. Asignación Inteligente (sin IA — puntaje determinístico) ────────────
// Nota de alcance: el "perfil de técnico" (especialidad/certificaciones) no
// existe todavía como entidad — el puntaje usa los datos que sí existen hoy
// (carga de trabajo, historial real por tipo de equipo, retrabajos). Está
// diseñado para extenderse cuando se modele ese perfil, sin rehacer nada.
export async function sugerirTecnico(otId) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (!['reportado', 'programada'].includes(ot.estado)) {
    throw new ErrorConflicto('Solo se puede sugerir técnico para una orden reportada o programada')
  }

  const tecnicoIds = await usuariosConPermiso('mantenimiento:ejecutar', { incluirSuperAdmin: false })
  const tecnicos = await Usuario.find({ _id: { $in: tecnicoIds }, estado: 'activo' }).select('nombre')

  const tipoNombre = ot.equipo?.tipo?.nombre
  const equipoIdsDelTipo = tipoNombre ? (await Equipo.find({ 'tipo.nombre': tipoNombre }).select('_id')).map((e) => e._id) : []

  const candidatos = []
  for (const tecnico of tecnicos) {
    const [ordenesActivas, cerradasDelTipo, retrabajosDelTipo] = await Promise.all([
      Mantenimiento.countDocuments({ tecnico_asignado: tecnico._id, estado: { $in: ESTADOS_ACTIVOS } }),
      equipoIdsDelTipo.length
        ? Mantenimiento.countDocuments({ tecnico_asignado: tecnico._id, estado: 'cerrada', equipo: { $in: equipoIdsDelTipo } })
        : 0,
      equipoIdsDelTipo.length
        ? Mantenimiento.countDocuments({ tecnico_asignado: tecnico._id, estado: 'cerrada', equipo: { $in: equipoIdsDelTipo }, reaperturas: { $gt: 0 } })
        : 0,
    ])

    const razones = []
    let puntaje = 0

    const puntajeCarga = Math.max(0, 40 - ordenesActivas * 10)
    puntaje += puntajeCarga
    razones.push(`Carga actual: ${ordenesActivas} orden(es) activa(s) (${puntajeCarga >= 0 ? '+' : ''}${puntajeCarga})`)

    const puntajeHistorial = Math.min(40, cerradasDelTipo * 10)
    if (cerradasDelTipo > 0) {
      puntaje += puntajeHistorial
      razones.push(`${cerradasDelTipo} orden(es) cerrada(s) de este tipo de equipo (+${puntajeHistorial})`)
    }

    const penalizacion = Math.min(20, retrabajosDelTipo * 10)
    if (retrabajosDelTipo > 0) {
      puntaje -= penalizacion
      razones.push(`${retrabajosDelTipo} reapertura(s) previa(s) en este tipo de equipo (-${penalizacion})`)
    }

    if (['critica', 'alta'].includes(ot.prioridad) && ordenesActivas === 0) {
      puntaje += 15
      razones.push('Disponible de inmediato para una orden urgente (+15)')
    }

    candidatos.push({ tecnico: { _id: tecnico._id, nombre: tecnico.nombre }, puntaje, razones, ordenesActivas })
  }

  candidatos.sort((a, b) => b.puntaje - a.puntaje)
  return candidatos.slice(0, 3)
}

// ── 3. Balanceador de Carga ──────────────────────────────────────────────

export async function obtenerBalanceCarga() {
  const tecnicoIds = await usuariosConPermiso('mantenimiento:ejecutar', { incluirSuperAdmin: false })
  const tecnicos = await Usuario.find({ _id: { $in: tecnicoIds } }).select('nombre')
  const ahora = Date.now()

  const resultado = []
  for (const tecnico of tecnicos) {
    const ordenes = await Mantenimiento.find({ tecnico_asignado: tecnico._id, estado: { $in: ESTADOS_ACTIVOS } })
    const horasAsignadasMin = ordenes.reduce(
      (acc, o) => acc + (o.horas || []).reduce((a, h) => a + h.tiempo_efectivo_minutos, 0),
      0
    )
    resultado.push({
      tecnico: { _id: tecnico._id, nombre: tecnico.nombre },
      ordenesActivas: ordenes.length,
      horasAsignadasMin,
      slaComprometidos: ordenes.filter((o) => o.sla?.fecha_limite_solucion && o.sla.fecha_limite_solucion.getTime() - ahora < 8 * 3600_000).length,
      preventivosPendientes: ordenes.filter((o) => o.origen === 'preventivo').length,
      correctivosPendientes: ordenes.filter((o) => o.origen !== 'preventivo').length,
      retrabajos: ordenes.filter((o) => o.reaperturas > 0).length,
    })
  }
  return resultado.sort((a, b) => b.ordenesActivas - a.ordenesActivas)
}

export async function reasignar(otId, nuevoTecnicoId, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (!['asignada', 'en_progreso', 'en_espera'].includes(ot.estado)) {
    throw new ErrorConflicto(`No se puede reasignar una orden en estado "${ot.estado}"`)
  }
  const nuevoId = await validarTecnico(nuevoTecnicoId)
  const anterior = ot.tecnico_asignado ? idDe(ot.tecnico_asignado) : null
  if (anterior && String(anterior) === String(nuevoId)) throw new ErrorValidacion('La orden ya está asignada a ese técnico')

  ot.tecnico_asignado = nuevoId
  await ot.save()

  await auditar(usuarioActor, 'reasignar', ot, 'Orden reasignada por el supervisor', {
    antes: { tecnico_asignado: anterior }, despues: { tecnico_asignado: nuevoId },
  })

  await notificarUsuarios([nuevoId], { titulo: 'Orden reasignada a ti', cuerpo: `Prioridad ${ot.prioridad}: ${ot.descripcion.slice(0, 120)}` })
  if (anterior) await notificarUsuarios([anterior], { titulo: 'Orden reasignada', cuerpo: 'Esta orden fue reasignada a otro técnico.' })

  return ot
}

export async function reasignarEnLote(otIds, nuevoTecnicoId, usuarioActor) {
  const resultados = []
  for (const otId of otIds) {
    try {
      await reasignar(otId, nuevoTecnicoId, usuarioActor)
      resultados.push({ otId, ok: true })
    } catch (err) {
      resultados.push({ otId, ok: false, error: err.message })
    }
  }
  return resultados
}

// ── 4. Centro de Aprobaciones ────────────────────────────────────────────
// Bandeja unificada de solo-lectura: agrupa lo que ya existe (cierres
// pendientes, solicitudes de repuestos, escalamientos) sin duplicar la
// lógica de aprobación, que sigue viviendo en ordenes.service/tecnico.service.
export async function obtenerCentroAprobaciones() {
  const [cierres, ordenesConRepuestos, escaladas] = await Promise.all([
    Mantenimiento.find({ estado: 'pendiente_aprobacion' }).populate('equipo').populate('tecnico_asignado', 'nombre').sort({ prioridad: -1 }),
    Mantenimiento.find({ 'solicitudesRepuestos.estado': 'solicitado' }).populate('equipo').populate('tecnico_asignado', 'nombre'),
    Mantenimiento.find({ escalado: true, estado: { $in: ESTADOS_ACTIVOS } }).populate('equipo').populate('tecnico_asignado', 'nombre'),
  ])

  const repuestos = []
  for (const ot of ordenesConRepuestos) {
    for (const s of ot.solicitudesRepuestos) {
      if (s.estado === 'solicitado') repuestos.push({ ordenTrabajo: ot._id, equipo: ot.equipo?.numero_inventario, solicitud: s })
    }
  }

  return {
    cierresPendientes: cierres,
    solicitudesRepuestos: repuestos,
    escalamientos: escaladas,
  }
}

// ── 5. Calendario Operativo ──────────────────────────────────────────────
export async function obtenerCalendario({ desde, hasta } = {}) {
  const filtroFecha = {}
  if (desde || hasta) {
    filtroFecha.fecha = {}
    if (desde) filtroFecha.fecha.$gte = new Date(desde)
    if (hasta) filtroFecha.fecha.$lte = new Date(hasta)
  }
  return Mantenimiento.find({ ...filtroFecha, estado: { $ne: 'cancelada' } })
    .populate('equipo', 'numero_inventario')
    .populate('tecnico_asignado', 'nombre')
    .select('equipo tecnico_asignado fecha estado prioridad origen')
    .sort({ fecha: 1 })
}

// ── 6. Centro de SLA ─────────────────────────────────────────────────────
export async function obtenerCentroSLA() {
  const ahora = Date.now()
  const activasConSLA = await Mantenimiento.find({ estado: { $in: ESTADOS_ACTIVOS }, 'sla.fecha_limite_solucion': { $exists: true } })
    .populate('equipo')
    .populate('tecnico_asignado', 'nombre')

  const vencidas = []
  const proximasAVencer = []
  for (const ot of activasConSLA) {
    const restanteMs = ot.sla.fecha_limite_solucion.getTime() - ahora
    if (restanteMs < 0) vencidas.push(ot)
    else if (restanteMs < 4 * 3600_000) proximasAVencer.push(ot)
  }

  const porTecnico = new Map()
  for (const ot of [...vencidas, ...proximasAVencer]) {
    const key = ot.tecnico_asignado ? String(idDe(ot.tecnico_asignado)) : 'sin_asignar'
    const actual = porTecnico.get(key) || { nombre: ot.tecnico_asignado?.nombre || 'Sin asignar', total: 0 }
    actual.total += 1
    porTecnico.set(key, actual)
  }

  const cerradasIncumplidas = await Mantenimiento.find({ estado: 'cerrada', 'sla.cumplido_solucion': false }).populate('equipo')
  const porDependencia = new Map()
  for (const ot of cerradasIncumplidas) {
    const dep = ot.equipo?.dependencia || 'Desconocida'
    porDependencia.set(dep, (porDependencia.get(dep) || 0) + 1)
  }

  return {
    vencidas,
    proximasAVencer,
    tecnicosComprometidos: [...porTecnico.values()].sort((a, b) => b.total - a.total),
    dependenciasConMasIncumplimientos: [...porDependencia.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([dependencia, total]) => ({ dependencia, total })),
  }
}

// ── 7. Centro de Hallazgos (transversal, todas las OT) ───────────────────
export async function obtenerCentroHallazgos({ criticidad, estado } = {}) {
  const filtro = {}
  if (criticidad) filtro.criticidad = criticidad
  if (estado) filtro.estado = estado

  const [hallazgos, recurrencia] = await Promise.all([
    Hallazgo.find(filtro).populate('ordenTrabajo', 'equipo').populate('responsable', 'nombre').sort({ criticidad: -1, creado_en: -1 }),
    Hallazgo.aggregate([
      { $match: { tipo: { $ne: null, $ne: '' } } },
      { $group: { _id: '$tipo', total: { $sum: 1 } } },
      { $match: { total: { $gt: 1 } } },
      { $sort: { total: -1 } },
    ]),
  ])

  return { hallazgos, tiposRecurrentes: recurrencia.map((r) => ({ tipo: r._id, total: r.total })) }
}

// ── 8. Centro de Activos ─────────────────────────────────────────────────
export async function obtenerFichaActivo(equipoId) {
  const equipo = await Equipo.findById(equipoId)
  if (!equipo) throw new ErrorNoEncontrado('Equipo no encontrado')

  const ordenes = await Mantenimiento.find({ equipo: equipoId }).populate('tecnico_asignado', 'nombre').sort({ fecha: -1 })
  const hallazgos = await Hallazgo.find({ ordenTrabajo: { $in: ordenes.map((o) => o._id) } })

  const msFueraDeServicio = ordenes
    .filter((o) => o.afectaDisponibilidad && o.estado === 'cerrada' && o.fecha_cierre)
    .reduce((acc, o) => acc + (o.fecha_cierre.getTime() - o.creado_en.getTime()), 0)

  return {
    equipo,
    ordenes,
    hallazgos,
    costoAcumulado: ordenes.reduce((acc, o) => acc + (o.costo_materiales || 0), 0),
    preventivosEjecutados: ordenes.filter((o) => o.origen === 'preventivo' && o.estado === 'cerrada').length,
    correctivosEjecutados: ordenes.filter((o) => o.origen !== 'preventivo' && o.estado === 'cerrada').length,
    horasFueraDeServicio: Math.round(msFueraDeServicio / 3_600_000),
  }
}

export async function actualizarCriticidadActivo(equipoId, datos, usuarioActor) {
  const equipo = await Equipo.findById(equipoId)
  if (!equipo) throw new ErrorNoEncontrado('Equipo no encontrado')

  if (datos.criticidad) equipo.criticidad = datos.criticidad
  if (datos.garantia_fecha_fin !== undefined) equipo.garantia_fecha_fin = datos.garantia_fecha_fin ? new Date(datos.garantia_fecha_fin) : null
  if (datos.garantia_proveedor !== undefined) equipo.garantia_proveedor = datos.garantia_proveedor?.trim()
  if (datos.vida_util_anios !== undefined) equipo.vida_util_anios = datos.vida_util_anios ? Number(datos.vida_util_anios) : null
  await equipo.save()

  await registrarAuditoria({
    usuario: usuarioActor, accion: 'actualizar_criticidad', modulo: 'mantenimiento', entidad: 'Equipo',
    entidadId: equipo._id, descripcion: `Datos de activo actualizados: ${equipo.numero_inventario}`,
  })

  return equipo
}

export async function listarActivosProblematicos(limite = 10) {
  const equipos = await Equipo.find()
  const resultado = []
  for (const eq of equipos) {
    const otIds = await Mantenimiento.find({ equipo: eq._id }).distinct('_id')
    if (otIds.length === 0) continue

    const [agregadoCosto, totalHallazgos] = await Promise.all([
      Mantenimiento.aggregate([{ $match: { equipo: eq._id } }, { $group: { _id: null, total: { $sum: '$costo_materiales' } } }]),
      Hallazgo.countDocuments({ ordenTrabajo: { $in: otIds } }),
    ])
    resultado.push({
      equipo: { _id: eq._id, numero_inventario: eq.numero_inventario, criticidad: eq.criticidad },
      totalOrdenes: otIds.length,
      costoTotal: agregadoCosto[0]?.total || 0,
      totalHallazgos,
    })
  }
  return resultado.sort((a, b) => b.totalOrdenes - a.totalOrdenes).slice(0, limite)
}

// ── 9. Alertas Operativas ────────────────────────────────────────────────
// Computadas bajo demanda (mismo patrón que actualizarEstadosVencidos ya
// usado en el módulo legado) en vez de un registro persistente con
// seguimiento propio — simplificación consciente para este alcance; un
// registro de alertas con estado propio (nueva/en_atención/resuelta) queda
// como evolución futura si se necesita trazabilidad de "quién la atendió".
export async function obtenerAlertasOperativas() {
  const ahora = Date.now()
  const alertas = []

  const vencidas = await Mantenimiento.find({ estado: { $in: ESTADOS_ACTIVOS }, 'sla.fecha_limite_solucion': { $lt: new Date() } })
    .populate('equipo', 'numero_inventario')
    .limit(20)
  for (const ot of vencidas) {
    alertas.push({ tipo: 'sla_vencido', prioridad: 'alta', descripcion: `SLA vencido: ${ot.equipo?.numero_inventario}`, ordenTrabajo: ot._id })
  }

  const hallazgosCriticos = await Hallazgo.find({ criticidad: 'critica', estado: { $in: ['abierto', 'en_seguimiento'] } }).limit(10)
  for (const h of hallazgosCriticos) {
    alertas.push({ tipo: 'hallazgo_critico', prioridad: 'alta', descripcion: `Hallazgo crítico sin resolver: ${h.descripcion.slice(0, 80)}`, hallazgo: h._id })
  }

  const reaperturas = await Mantenimiento.find({ reaperturas: { $gt: 3 } }).populate('equipo', 'numero_inventario').limit(10)
  for (const ot of reaperturas) {
    alertas.push({ tipo: 'reaperturas_excesivas', prioridad: 'media', descripcion: `${ot.equipo?.numero_inventario} reabierta ${ot.reaperturas} veces`, ordenTrabajo: ot._id })
  }

  const escaladas = await Mantenimiento.find({ escalado: true, estado: { $in: ESTADOS_ACTIVOS } }).populate('equipo', 'numero_inventario').limit(10)
  for (const ot of escaladas) {
    alertas.push({ tipo: 'escalamiento', prioridad: 'media', descripcion: `Escalada: ${ot.equipo?.numero_inventario} (${ot.escaladoMotivo || ''})`, ordenTrabajo: ot._id })
  }

  const stockBajo = await InventarioMaterial.find({ stock: { $lte: 0 } }).limit(10)
  for (const m of stockBajo) {
    alertas.push({ tipo: 'stock_insuficiente', prioridad: 'media', descripcion: `Sin stock: ${m.nombre}`, material: m._id })
  }

  const ORDEN_PRIORIDAD = { alta: 0, media: 1, baja: 2 }
  return alertas.sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad])
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Serie mensual (últimos `meses`, fija — independiente del filtro desde/hasta
// del resto del dashboard, que es un corte total, no una tendencia): OT
// abiertas se cuentan por `creado_en`, cerradas/costo/SLA por `fecha_cierre`
// (el momento en que esos datos quedan definitivos), mismo criterio temporal
// que ya usa `obtenerFichaActivo` para "fuera de servicio".
async function obtenerSerieMensual(meses = 6) {
  const ahora = new Date()
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - (meses - 1), 1)

  const [creadas, cerradas] = await Promise.all([
    Mantenimiento.aggregate([
      { $match: { creado_en: { $gte: inicio } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$creado_en' } }, total: { $sum: 1 } } },
    ]),
    Mantenimiento.aggregate([
      { $match: { estado: 'cerrada', fecha_cierre: { $gte: inicio } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$fecha_cierre' } },
          total: { $sum: 1 },
          costoMateriales: { $sum: '$costo_materiales' },
          conSLA: { $sum: { $cond: [{ $ne: ['$sla.cumplido_solucion', null] }, 1, 0] } },
          slaCumplido: { $sum: { $cond: [{ $eq: ['$sla.cumplido_solucion', true] }, 1, 0] } },
        },
      },
    ]),
  ])

  const porMes = new Map()
  for (let i = 0; i < meses; i++) {
    const fecha = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1)
    const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
    porMes.set(key, {
      mes: key,
      etiqueta: `${MESES_CORTOS[fecha.getMonth()]} ${String(fecha.getFullYear()).slice(-2)}`,
      otAbiertas: 0,
      otCerradas: 0,
      costoMateriales: 0,
      cumplimientoSLA: null,
    })
  }
  for (const c of creadas) {
    if (porMes.has(c._id)) porMes.get(c._id).otAbiertas = c.total
  }
  for (const c of cerradas) {
    const m = porMes.get(c._id)
    if (!m) continue
    m.otCerradas = c.total
    m.costoMateriales = c.costoMateriales
    m.cumplimientoSLA = c.conSLA ? Math.round((c.slaCumplido / c.conSLA) * 100) : null
  }
  return [...porMes.values()]
}

// ── 10. Dashboard Gerencial ──────────────────────────────────────────────
export async function obtenerDashboardGerencial({ desde, hasta } = {}) {
  const filtroFecha = {}
  if (desde || hasta) {
    filtroFecha.creado_en = {}
    if (desde) filtroFecha.creado_en.$gte = new Date(desde)
    if (hasta) filtroFecha.creado_en.$lte = new Date(hasta)
  }

  const todas = await Mantenimiento.find(filtroFecha).populate('equipo')
  const cerradas = todas.filter((o) => o.estado === 'cerrada')
  const conSLA = cerradas.filter((o) => o.sla?.cumplido_solucion !== null && o.sla?.cumplido_solucion !== undefined)

  const tiemposAtencionMs = todas.filter((o) => o.fecha_aceptacion).map((o) => o.fecha_aceptacion.getTime() - o.creado_en.getTime())
  const tiemposSolucionMs = cerradas.filter((o) => o.fecha_cierre).map((o) => o.fecha_cierre.getTime() - o.creado_en.getTime())
  // MTTR: tiempo efectivo de reparación (horas registradas), aislado del tiempo de espera externo.
  const mttrMinutos = cerradas.flatMap((o) => o.horas || []).reduce((acc, h) => acc + h.tiempo_efectivo_minutos, 0)
  const cerradasConHoras = cerradas.filter((o) => (o.horas || []).length > 0).length

  const promedio = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

  const preventivos = todas.filter((o) => o.origen === 'preventivo')
  const correctivos = todas.filter((o) => o.origen !== 'preventivo')
  const hallazgos = await Hallazgo.find({ ordenTrabajo: { $in: todas.map((o) => o._id) } })

  const porEquipo = new Map()
  for (const o of todas) {
    if (!o.equipo) continue
    const key = String(o.equipo._id)
    const actual = porEquipo.get(key) || { numero_inventario: o.equipo.numero_inventario, total: 0, costo: 0 }
    actual.total += 1
    actual.costo += o.costo_materiales || 0
    porEquipo.set(key, actual)
  }
  const activosMasProblematicos = [...porEquipo.values()].sort((a, b) => b.total - a.total).slice(0, 5)
  const serieMensual = await obtenerSerieMensual()

  return {
    periodo: { desde: desde || null, hasta: hasta || null },
    serieMensual,
    cumplimiento_sla: conSLA.length ? conSLA.filter((o) => o.sla.cumplido_solucion).length / conSLA.length : null,
    tiempo_promedio_atencion_horas: tiemposAtencionMs.length ? Math.round((promedio(tiemposAtencionMs) / 3_600_000) * 10) / 10 : null,
    tiempo_promedio_solucion_horas: tiemposSolucionMs.length ? Math.round((promedio(tiemposSolucionMs) / 3_600_000) * 10) / 10 : null,
    mttr_horas: cerradasConHoras ? Math.round((mttrMinutos / 60 / cerradasConHoras) * 10) / 10 : null,
    costos_totales: todas.reduce((acc, o) => acc + (o.costo_materiales || 0), 0),
    retrabajos: todas.filter((o) => o.reaperturas > 0).length,
    hallazgos_total: hallazgos.length,
    hallazgos_resueltos: hallazgos.filter((h) => ['resuelto', 'convertido_en_ot'].includes(h.estado)).length,
    preventivos_ejecutados: preventivos.filter((o) => o.estado === 'cerrada').length,
    preventivos_programados: preventivos.length,
    correctivos_ejecutados: correctivos.filter((o) => o.estado === 'cerrada').length,
    activos_mas_problematicos: activosMasProblematicos,
    ordenes_totales: todas.length,
    ordenes_cerradas: cerradas.length,
  }
}
