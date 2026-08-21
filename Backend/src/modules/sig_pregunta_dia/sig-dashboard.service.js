import RespuestaSig from '../../models/RespuestaSig.js'
import ProgramacionSig from '../../models/ProgramacionSig.js'
import PlanRefuerzoSig from '../../models/PlanRefuerzoSig.js'
import Usuario from '../../models/Usuario.js'
import { hoy, rangoDeDias } from '../../utils/fechas.js'
import { ErrorNoEncontrado, ErrorValidacion } from '../../utils/errores.js'
import { obtenerConfiguracionCacheada, calcularNivel, resolverAudiencia, auditar } from './comun.js'

const ESTADOS_PLAN_REFUERZO = ['pendiente', 'en_progreso', 'completado', 'descartado']

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

  // Antes: `resolverAudiencia` (que hace su propio Usuario.find) se esperaba
  // en serie por cada publicación de hoy. Normalmente son pocas, pero no hay
  // motivo para no resolverlas todas en paralelo.
  const idsElegibles = new Set()
  const audienciasDeHoy = await Promise.all(programacionesHoy.map((p) => resolverAudiencia(p.audiencia)))
  for (const ids of audienciasDeHoy) {
    for (const id of ids) idsElegibles.add(String(id))
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
  const config = await obtenerConfiguracionCacheada()

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
    Usuario.countDocuments({ estado: 'activo', esPrueba: false }),
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

// Lista de trabajadores que ya respondieron al menos una vez, CON su
// desempeño resumido — es la tabla que abre "Reporte individual": se ve de una
// quiénes participaron y cómo van, sin tener que abrir uno por uno para
// enterarse. Al hacer clic en una fila se pide el reporte detallado de esa
// persona (reporteTrabajador, abajo).
//
// Acepta los mismos filtros combinables que el dashboard, así que el resumen
// de cada fila corresponde al rango/área/componente filtrado y no al histórico
// completo — si no, la tabla y el detalle mostrarían números distintos.
//
// Se arma a partir de RespuestaSig y no de GET /usuarios/buscar (soloAdmin,
// ver usuarios.routes.js): SIG/HSEQ tiene su propio permiso de reportes y no
// debería necesitar además usuarios:gestionar solo para ver a quién reportar.
export async function listarTrabajadoresParticipantes(filtros = {}) {
  const matchBase = construirFiltroRespuestas(filtros)
  const config = await obtenerConfiguracionCacheada()

  const agregados = await RespuestaSig.aggregate([
    { $match: matchBase },
    // El $sort previo hace que $last sea determinista: el área y el cargo que
    // tenía la persona en su respuesta MÁS RECIENTE, no una cualquiera.
    { $sort: { respondidaEn: 1 } },
    {
      $group: {
        _id: '$usuario',
        total: { $sum: 1 },
        correctas: { $sum: { $cond: ['$esCorrecta', 1, 0] } },
        ultimaRespuesta: { $last: '$respondidaEn' },
        dependenciaSnapshot: { $last: '$dependenciaSnapshot' },
        cargoSnapshot: { $last: '$cargoSnapshot' },
      },
    },
  ])

  const idsRespondieron = agregados.map((a) => a._id)
  // Se traen con y sin filtro de esPrueba: `idsExistentes` dice si el
  // usuario todavía existe en Mongo (para distinguir "borrado" de "de
  // prueba"), y `usuarios` (solo esPrueba:false) es lo que realmente se
  // muestra en la tabla.
  const [usuarios, idsExistentes] = await Promise.all([
    Usuario.find({ _id: { $in: idsRespondieron }, esPrueba: false })
      .select('nombre nombre_usuario dependencia cargo estado')
      .lean(),
    Usuario.find({ _id: { $in: idsRespondieron } }).select('_id').lean(),
  ])
  const porId = new Map(usuarios.map((u) => [String(u._id), u]))
  const idsExistentesSet = new Set(idsExistentes.map((u) => String(u._id)))

  return agregados
    // Un usuario de prueba existe pero no entra a `porId` (esPrueba:true se
    // excluyó arriba): esa fila se descarta. Un usuario real ya borrado no
    // entra a `idsExistentesSet` tampoco, así que esa sí se conserva con el
    // snapshot histórico de la respuesta.
    .filter((a) => !idsExistentesSet.has(String(a._id)) || porId.has(String(a._id)))
    .map((a) => {
      const usuario = porId.get(String(a._id))
      const porcentaje = a.total ? Math.round((a.correctas / a.total) * 100) : 0
      return {
        _id: a._id,
        nombre: usuario?.nombre || usuario?.nombre_usuario || '(usuario eliminado)',
        nombre_usuario: usuario?.nombre_usuario || '',
        dependencia: usuario?.dependencia || a.dependenciaSnapshot || '',
        cargo: usuario?.cargo || a.cargoSnapshot || '',
        activo: usuario ? usuario.estado === 'activo' : false,
        total: a.total,
        correctas: a.correctas,
        incorrectas: a.total - a.correctas,
        porcentaje,
        nivel: calcularNivel(porcentaje, config.nivelesDesempeno),
        ultimaRespuesta: a.ultimaRespuesta,
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export async function reporteTrabajador(usuarioId, filtros = {}) {
  const usuario = await Usuario.findById(usuarioId).select('nombre nombre_usuario cargo dependencia estado').lean()
  if (!usuario) throw new ErrorNoEncontrado('Trabajador no encontrado')

  const matchBase = { ...construirFiltroRespuestas(filtros), usuario: usuario._id }
  const config = await obtenerConfiguracionCacheada()

  // Sin .limit(): el porcentaje/temasConMasErrores se calculan agregando TODO
  // el historial filtrado en memoria (abajo) — truncarlo aquí daría
  // estadísticas incorrectas. .lean() sí es seguro (solo lectura, nunca se
  // guarda un documento de este array).
  const respuestas = await RespuestaSig.find(matchBase)
    .select('esCorrecta componenteSigSnapshot temaSnapshot fechaProgramada')
    .sort({ fechaProgramada: -1 })
    .populate({ path: 'programacion', select: 'snapshotPregunta' })
    .lean()

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
  const config = await obtenerConfiguracionCacheada()
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

  if (candidatos.length > 0) {
    // Antes: 2 round-trips secuenciales a Mongo POR candidato (aggregate +
    // findOneAndUpdate dentro de un `for`) — con N candidatos, 2N queries en
    // serie en una sola petición HTTP. Ahora: una única agregación agrupada
    // resuelve "el tema con más errores" para TODOS los candidatos a la vez
    // (mismo criterio que antes: por candidato, se agrupa por tema, se ordena
    // por errores descendente y se toma el primero — un empate se resuelve
    // igual de no-determinista que el `$limit: 1` original), seguida de un
    // solo bulkWrite con los upserts.
    const condicionesCandidatos = candidatos.map((c) => ({ usuario: c.usuario, componenteSigSnapshot: c.componenteSig }))

    const peoresTemas = await RespuestaSig.aggregate([
      { $match: { ...matchBase, esCorrecta: false, $or: condicionesCandidatos } },
      {
        $group: {
          _id: { usuario: '$usuario', componenteSig: '$componenteSigSnapshot', tema: '$temaSnapshot' },
          errores: { $sum: 1 },
        },
      },
      { $sort: { errores: -1 } },
      {
        $group: {
          _id: { usuario: '$_id.usuario', componenteSig: '$_id.componenteSig' },
          tema: { $first: '$_id.tema' },
        },
      },
    ])
    const temaPorCandidato = new Map(
      peoresTemas.map((p) => [`${p._id.usuario}::${p._id.componenteSig}`, p.tema])
    )

    const ahora = new Date()
    await PlanRefuerzoSig.bulkWrite(
      candidatos.map((c) => ({
        updateOne: {
          filter: { usuario: c.usuario, componenteSig: c.componenteSig, estado: { $in: ['pendiente', 'en_progreso'] } },
          update: {
            $set: {
              nivelDetectado: c.nivel.clave,
              porcentajeAcierto: c.porcentaje,
              fechaDeteccion: ahora,
              tema: temaPorCandidato.get(`${c.usuario}::${c.componenteSig}`) || '',
            },
          },
          upsert: true,
        },
      }))
    )
  }

  return PlanRefuerzoSig.find({ estado: { $ne: 'descartado' } })
    .sort({ porcentajeAcierto: 1 })
    .populate('usuario', 'nombre nombre_usuario cargo dependencia')
    .populate('responsable', 'nombre nombre_usuario')
    .lean()
}

// Gestión manual sobre un plan ya detectado: acción de capacitación,
// fecha programada, observaciones y estado. Quien edita queda como
// responsable — el módulo no tiene un selector de encargado aparte, así que
// "responsable" es simplemente quien tomó la acción más reciente.
export async function actualizarPlanRefuerzo(id, datos, usuarioActor) {
  const plan = await PlanRefuerzoSig.findById(id)
  if (!plan) throw new ErrorNoEncontrado('Plan de refuerzo no encontrado')
  const antes = plan.toObject()

  if (datos.estado !== undefined) {
    if (!ESTADOS_PLAN_REFUERZO.includes(datos.estado)) throw new ErrorValidacion('Estado inválido')
    plan.estado = datos.estado
  }
  if (datos.accionCapacitacion !== undefined) plan.accionCapacitacion = String(datos.accionCapacitacion).trim()
  if (datos.observaciones !== undefined) plan.observaciones = String(datos.observaciones).trim()
  if (datos.fechaProgramada !== undefined) {
    plan.fechaProgramada = datos.fechaProgramada ? new Date(datos.fechaProgramada) : null
  }
  plan.responsable = usuarioActor.id_usuario

  await plan.save()
  await auditar(usuarioActor, 'gestionar_plan_refuerzo', 'PlanRefuerzoSig', plan._id, 'Actualizó un plan de refuerzo', {
    antes,
    despues: plan.toObject(),
  })

  return plan.populate([
    { path: 'usuario', select: 'nombre nombre_usuario cargo dependencia' },
    { path: 'responsable', select: 'nombre nombre_usuario' },
  ])
}
