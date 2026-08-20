import RespuestaSig from '../../models/RespuestaSig.js'
import ProgramacionSig from '../../models/ProgramacionSig.js'
import PlanRefuerzoSig from '../../models/PlanRefuerzoSig.js'
import Usuario from '../../models/Usuario.js'
import { hoy, rangoDeDias } from '../../utils/fechas.js'
import { ErrorNoEncontrado } from '../../utils/errores.js'
import { obtenerOCrearConfiguracion, calcularNivel, resolverAudiencia } from './comun.js'

const MS_POR_DIA = 24 * 60 * 60 * 1000

// Filtros combinables comunes a dashboard/reporte individual/plan de
// refuerzo (sección 12 del encargo del módulo): fecha, dependencia (=área),
// cargo, componente, tema y resultado — todos sobre los campos ya
// denormalizados de RespuestaSig, sin $lookup.
function construirFiltroRespuestas({ desde, hasta, dependencia, cargo, componenteSig, tema, resultado } = {}) {
  const filtro = {}
  if (desde && hasta) filtro.fechaProgramada = rangoDeDias(desde, hasta)
  if (dependencia) filtro.dependenciaSnapshot = dependencia
  if (cargo) filtro.cargoSnapshot = cargo
  if (componenteSig) filtro.componenteSigSnapshot = componenteSig
  if (tema) filtro.temaSnapshot = tema
  if (resultado === 'correcta') filtro.esCorrecta = true
  if (resultado === 'incorrecta') filtro.esCorrecta = false
  return filtro
}

// Participación de HOY específicamente (independiente de cualquier filtro de
// fecha del resto del dashboard): cuántos de los elegibles de la(s)
// publicación(es) de hoy ya respondieron. Es el indicador operativo del día
// a día ("¿quién falta por responder hoy?"), separado de las estadísticas
// históricas filtrables de abajo.
export async function obtenerResumenHoy() {
  const inicioHoy = hoy()
  const finHoy = new Date(inicioHoy.getTime() + MS_POR_DIA)

  const programacionesHoy = await ProgramacionSig.find({
    estado: 'publicada',
    fechaProgramada: { $gte: inicioHoy, $lt: finHoy },
  }).select('audiencia')

  if (!programacionesHoy.length) return { hayPreguntaHoy: false }

  const idsElegibles = new Set()
  for (const p of programacionesHoy) {
    for (const id of await resolverAudiencia(p.audiencia)) idsElegibles.add(String(id))
  }

  const idsProgramaciones = programacionesHoy.map((p) => p._id)
  const [respondieronIds, correctas, incorrectas] = await Promise.all([
    RespuestaSig.distinct('usuario', { programacion: { $in: idsProgramaciones } }),
    RespuestaSig.countDocuments({ programacion: { $in: idsProgramaciones }, esCorrecta: true }),
    RespuestaSig.countDocuments({ programacion: { $in: idsProgramaciones }, esCorrecta: false }),
  ])
  const respondieronSet = new Set(respondieronIds.map(String))
  const totalElegibles = idsElegibles.size
  const totalRespondieron = [...idsElegibles].filter((id) => respondieronSet.has(id)).length

  return {
    hayPreguntaHoy: true,
    totalElegibles,
    trabajadoresRespondieron: totalRespondieron,
    trabajadoresPendientes: Math.max(0, totalElegibles - totalRespondieron),
    correctas,
    incorrectas,
    porcentajeParticipacion: totalElegibles ? Math.round((totalRespondieron / totalElegibles) * 100) : 0,
  }
}

export async function obtenerDashboard(filtros = {}) {
  const matchBase = construirFiltroRespuestas(filtros)
  const config = await obtenerOCrearConfiguracion()

  const [
    resumenHoy,
    [resumenGlobal],
    participacionDiariaRaw,
    porComponenteRaw,
    porTrabajadorRaw,
    totalTrabajadoresActivos,
    totalPublicadas,
  ] = await Promise.all([
    obtenerResumenHoy(),
    RespuestaSig.aggregate([
      { $match: matchBase },
      { $group: { _id: null, total: { $sum: 1 }, correctas: { $sum: { $cond: ['$esCorrecta', 1, 0] } } } },
    ]),
    RespuestaSig.aggregate([
      { $match: matchBase },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$fechaProgramada', timezone: 'America/Bogota' } },
          total: { $sum: 1 },
          correctas: { $sum: { $cond: ['$esCorrecta', 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    RespuestaSig.aggregate([
      { $match: matchBase },
      { $group: { _id: '$componenteSigSnapshot', total: { $sum: 1 }, correctas: { $sum: { $cond: ['$esCorrecta', 1, 0] } } } },
      { $sort: { _id: 1 } },
    ]),
    RespuestaSig.aggregate([
      { $match: matchBase },
      { $group: { _id: '$usuario', total: { $sum: 1 }, correctas: { $sum: { $cond: ['$esCorrecta', 1, 0] } } } },
    ]),
    Usuario.countDocuments({ estado: 'activo' }),
    ProgramacionSig.countDocuments({
      estado: 'publicada',
      ...(filtros.desde && filtros.hasta ? { fechaProgramada: rangoDeDias(filtros.desde, filtros.hasta) } : {}),
    }),
  ])

  const totalRespuestas = resumenGlobal?.total || 0
  const totalCorrectas = resumenGlobal?.correctas || 0

  const distribucionNivel = Object.fromEntries(config.nivelesDesempeno.map((n) => [n.clave, 0]))
  for (const t of porTrabajadorRaw) {
    const porcentaje = t.total ? Math.round((t.correctas / t.total) * 100) : 0
    const nivel = calcularNivel(porcentaje, config.nivelesDesempeno)
    if (nivel) distribucionNivel[nivel.clave] = (distribucionNivel[nivel.clave] || 0) + 1
  }

  return {
    resumenHoy,
    indicadores: {
      totalTrabajadores: totalTrabajadoresActivos,
      trabajadoresParticiparon: porTrabajadorRaw.length,
      totalPreguntasPublicadas: totalPublicadas,
      totalRespuestas,
      correctas: totalCorrectas,
      incorrectas: totalRespuestas - totalCorrectas,
      porcentajeAciertoGlobal: totalRespuestas ? Math.round((totalCorrectas / totalRespuestas) * 100) : 0,
      porcentajeParticipacion: totalTrabajadoresActivos
        ? Math.round((porTrabajadorRaw.length / totalTrabajadoresActivos) * 100)
        : 0,
    },
    participacionDiaria: participacionDiariaRaw.map((d) => ({
      fecha: d._id,
      total: d.total,
      correctas: d.correctas,
      incorrectas: d.total - d.correctas,
    })),
    porComponente: porComponenteRaw.map((c) => ({
      componenteSig: c._id,
      total: c.total,
      correctas: c.correctas,
      incorrectas: c.total - c.correctas,
    })),
    distribucionNivel: config.nivelesDesempeno.map((n) => ({
      clave: n.clave,
      nombre: n.nombre,
      color: n.color,
      total: distribucionNivel[n.clave] || 0,
    })),
  }
}

// Lista de trabajadores que ya respondieron al menos una vez — el selector
// de "Reporte individual" se arma a partir de aquí en vez de reusar
// GET /usuarios/buscar (soloAdmin, ver usuarios.routes.js): SIG/HSEQ tiene su
// propio permiso de reportes y no debería necesitar además usuarios:gestionar
// solo para elegir a quién le va a ver el reporte.
export async function listarTrabajadoresParticipantes() {
  const ids = await RespuestaSig.distinct('usuario')
  return Usuario.find({ _id: { $in: ids } }).select('nombre nombre_usuario dependencia cargo').sort({ nombre: 1 })
}

export async function reporteTrabajador(usuarioId, filtros = {}) {
  const usuario = await Usuario.findById(usuarioId).select('nombre nombre_usuario cargo dependencia estado')
  if (!usuario) throw new ErrorNoEncontrado('Trabajador no encontrado')

  const matchBase = { ...construirFiltroRespuestas(filtros), usuario: usuario._id }
  const config = await obtenerOCrearConfiguracion()

  const respuestas = await RespuestaSig.find(matchBase)
    .select('esCorrecta componenteSigSnapshot temaSnapshot fechaProgramada')
    .sort({ fechaProgramada: -1 })
    .populate({ path: 'programacion', select: 'snapshotPregunta' })

  const total = respuestas.length
  const correctas = respuestas.filter((r) => r.esCorrecta).length
  const porcentaje = total ? Math.round((correctas / total) * 100) : 0

  const porComponenteMap = new Map()
  const erroresPorTema = new Map()
  for (const r of respuestas) {
    const acc = porComponenteMap.get(r.componenteSigSnapshot) || { total: 0, correctas: 0 }
    acc.total += 1
    if (r.esCorrecta) acc.correctas += 1
    porComponenteMap.set(r.componenteSigSnapshot, acc)

    if (!r.esCorrecta && r.temaSnapshot) {
      erroresPorTema.set(r.temaSnapshot, (erroresPorTema.get(r.temaSnapshot) || 0) + 1)
    }
  }

  return {
    trabajador: usuario,
    total,
    correctas,
    incorrectas: total - correctas,
    porcentaje,
    nivel: calcularNivel(porcentaje, config.nivelesDesempeno),
    porComponente: [...porComponenteMap.entries()].map(([componenteSig, v]) => ({
      componenteSig,
      total: v.total,
      correctas: v.correctas,
      porcentaje: Math.round((v.correctas / v.total) * 100),
    })),
    temasConMasErrores: [...erroresPorTema.entries()]
      .map(([tema, errores]) => ({ tema, errores }))
      .sort((a, b) => b.errores - a.errores)
      .slice(0, 10),
    historial: respuestas,
  }
}

// Recalcula qué combinaciones trabajador+componente están en los 2 niveles
// más bajos configurados (normalmente 'bajo'/'critico', pero se toman los 2
// últimos por umbral para no depender de que el admin no haya renombrado las
// claves) dentro del filtro dado, y hace upsert en PlanRefuerzoSig sin pisar
// un plan que ya esté 'en_progreso'/'completado'/'descartado' a mano.
// Devuelve la lista vigente (no descartada) con el trabajador poblado.
export async function recalcularYObtenerPlanRefuerzo(filtros = {}) {
  const config = await obtenerOCrearConfiguracion()
  const matchBase = construirFiltroRespuestas(filtros)

  const agregados = await RespuestaSig.aggregate([
    { $match: matchBase },
    {
      $group: {
        _id: { usuario: '$usuario', componenteSig: '$componenteSigSnapshot' },
        total: { $sum: 1 },
        correctas: { $sum: { $cond: ['$esCorrecta', 1, 0] } },
      },
    },
  ])

  const nivelesOrdenados = [...config.nivelesDesempeno].sort((a, b) => b.umbralMinimo - a.umbralMinimo)
  const clavesRefuerzo = new Set(nivelesOrdenados.slice(-2).map((n) => n.clave))

  const candidatos = agregados
    .map((a) => {
      const porcentaje = a.total ? Math.round((a.correctas / a.total) * 100) : 0
      return { usuario: a._id.usuario, componenteSig: a._id.componenteSig, porcentaje, nivel: calcularNivel(porcentaje, config.nivelesDesempeno) }
    })
    .filter((c) => c.componenteSig && clavesRefuerzo.has(c.nivel?.clave))

  for (const c of candidatos) {
    const [peorTema] = await RespuestaSig.aggregate([
      { $match: { ...matchBase, usuario: c.usuario, componenteSigSnapshot: c.componenteSig, esCorrecta: false } },
      { $group: { _id: '$temaSnapshot', errores: { $sum: 1 } } },
      { $sort: { errores: -1 } },
      { $limit: 1 },
    ])

    await PlanRefuerzoSig.findOneAndUpdate(
      { usuario: c.usuario, componenteSig: c.componenteSig, estado: { $in: ['pendiente', 'en_progreso'] } },
      {
        $set: {
          nivelDetectado: c.nivel.clave,
          porcentajeAcierto: c.porcentaje,
          fechaDeteccion: new Date(),
          tema: peorTema?._id || '',
        },
      },
      { upsert: true }
    )
  }

  return PlanRefuerzoSig.find({ estado: { $ne: 'descartado' } })
    .sort({ porcentajeAcierto: 1 })
    .populate('usuario', 'nombre nombre_usuario cargo dependencia')
}
