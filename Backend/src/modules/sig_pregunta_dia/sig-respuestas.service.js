import ProgramacionSig from '../../models/ProgramacionSig.js'
import RespuestaSig from '../../models/RespuestaSig.js'
import PreguntaSig from '../../models/PreguntaSig.js'
import Usuario from '../../models/Usuario.js'
import { hoy } from '../../utils/fechas.js'
import { ErrorNoEncontrado, ErrorConflicto, ErrorValidacion } from '../../utils/errores.js'
import { auditar, obtenerOCrearConfiguracion, calcularNivel } from './comun.js'

const MS_POR_DIA = 24 * 60 * 60 * 1000

function aClaveDia(fecha) {
  return new Date(fecha).toISOString().slice(0, 10)
}

// audiencia.todos, o coincidencia por dependencia/cargo del trabajador (ver
// resolverAudiencia en comun.js para la dirección inversa: de audiencia a
// lista de destinatarios, usada por el worker al notificar).
function coincideAudiencia(audiencia, usuario) {
  if (!audiencia || audiencia.todos) return true
  const enDependencia = usuario.dependencia && audiencia.dependencias?.includes(usuario.dependencia)
  const enCargo = usuario.cargo && audiencia.cargos?.includes(usuario.cargo)
  return Boolean(enDependencia || enCargo)
}

// ── Preguntas del día ───────────────────────────────────────────────────

// Arma la tarjeta que ve el trabajador a partir del snapshot congelado, ya
// resuelta contra su respuesta (si existe). La respuesta correcta nunca viaja
// al frontend antes de responder — solo se revela una vez que ya existe una
// RespuestaSig de esta persona para esta programación.
function aTarjeta(programacion, respuesta) {
  return {
    _id: programacion._id,
    fechaProgramada: programacion.fechaProgramada,
    componenteSig: programacion.snapshotPregunta.componenteSig,
    tema: programacion.snapshotPregunta.tema,
    enunciado: programacion.snapshotPregunta.enunciado,
    opciones: programacion.snapshotPregunta.opciones.map((o) => ({
      texto: o.texto,
      ...(respuesta ? { esCorrecta: o.esCorrecta } : {}),
    })),
    yaRespondida: Boolean(respuesta),
    miRespuesta: respuesta
      ? {
          opcionIndice: respuesta.opcionIndice,
          esCorrecta: respuesta.esCorrecta,
          retroalimentacion: respuesta.esCorrecta
            ? programacion.pregunta?.retroalimentacion?.correcta
            : programacion.pregunta?.retroalimentacion?.incorrecta,
        }
      : null,
  }
}

// Devuelve TODAS las preguntas publicadas hoy que le corresponden a este
// trabajador, en el orden en que se publicaron. Antes se devolvía solo una
// (la más reciente): desde que la programación individual admite varias
// preguntas para el mismo día, quedarse con una sola escondería el resto del
// cuestionario del día.
//
// Los campos `programacion`, `yaRespondida` y `miRespuesta` se conservan
// apuntando a la PRIMERA pregunta sin responder (o a la última del día si ya
// las respondió todas), para que cualquier cliente que aún lea la forma
// singular siga mostrando algo correcto.
export async function obtenerPreguntaDelDia(usuarioActor) {
  const usuario = await Usuario.findById(usuarioActor.id_usuario).select('dependencia cargo')
  const inicioHoy = hoy()
  const finHoy = new Date(inicioHoy.getTime() + MS_POR_DIA)

  const candidatas = await ProgramacionSig.find({
    estado: 'publicada',
    fechaProgramada: { $gte: inicioHoy, $lt: finHoy },
  })
    .sort({ fechaHoraPublicacion: 1 })
    .populate('pregunta', 'retroalimentacion')

  const mias = candidatas.filter((p) => coincideAudiencia(p.audiencia, usuario))
  if (!mias.length) return { disponible: false, preguntas: [], totalPendientes: 0 }

  // Una sola consulta para todas las respuestas del día en vez de una por
  // pregunta: con 5 preguntas programadas serían 5 viajes a Mongo por cada
  // carga de la pantalla principal del trabajador.
  const respuestas = await RespuestaSig.find({
    programacion: { $in: mias.map((p) => p._id) },
    usuario: usuarioActor.id_usuario,
  })
  const respuestaPorProgramacion = new Map(respuestas.map((r) => [String(r.programacion), r]))

  const preguntas = mias.map((p) => aTarjeta(p, respuestaPorProgramacion.get(String(p._id))))
  const pendientes = preguntas.filter((p) => !p.yaRespondida)
  const foco = pendientes[0] || preguntas[preguntas.length - 1]

  return {
    disponible: true,
    preguntas,
    total: preguntas.length,
    totalPendientes: pendientes.length,
    totalRespondidas: preguntas.length - pendientes.length,
    // Forma singular heredada (ver comentario de arriba).
    programacion: foco,
    yaRespondida: foco.yaRespondida,
    miRespuesta: foco.miRespuesta,
  }
}

// ── Responder ────────────────────────────────────────────────────────────
export async function responder(programacionId, opcionIndice, usuarioActor) {
  if (typeof opcionIndice !== 'number' || opcionIndice < 0) {
    throw new ErrorValidacion('Debes seleccionar una opción')
  }

  const programacion = await ProgramacionSig.findById(programacionId)
  if (!programacion) throw new ErrorNoEncontrado('Programación no encontrada')
  if (programacion.estado !== 'publicada') {
    throw new ErrorConflicto('Esta pregunta no está disponible para responder')
  }

  const opcion = programacion.snapshotPregunta.opciones[opcionIndice]
  if (!opcion) throw new ErrorValidacion('La opción seleccionada no existe')

  const usuario = await Usuario.findById(usuarioActor.id_usuario).select('dependencia cargo')

  let respuesta
  try {
    respuesta = await RespuestaSig.create({
      programacion: programacion._id,
      usuario: usuarioActor.id_usuario,
      opcionIndice,
      esCorrecta: opcion.esCorrecta,
      dependenciaSnapshot: usuario?.dependencia || '',
      cargoSnapshot: usuario?.cargo || '',
      componenteSigSnapshot: programacion.snapshotPregunta.componenteSig,
      temaSnapshot: programacion.snapshotPregunta.tema,
      fechaProgramada: programacion.fechaProgramada,
    })
  } catch (err) {
    // El índice único {programacion, usuario} es la defensa real contra
    // responder dos veces (ver RespuestaSig.js) — esto solo traduce el
    // choque a un mensaje claro. GET /pregunta-del-dia ya evita que el
    // frontend muestre el botón si yaRespondida es true; esto cubre doble
    // pestaña/doble tap.
    if (err.code === 11000) throw new ErrorConflicto('Ya respondiste esta pregunta')
    throw err
  }

  await auditar(
    usuarioActor,
    'responder',
    'RespuestaSig',
    respuesta._id,
    `Respondió el Cuestionario Programado del ${aClaveDia(programacion.fechaProgramada)}`
  )

  const pregunta = await PreguntaSig.findById(programacion.pregunta).select('retroalimentacion')

  return {
    esCorrecta: opcion.esCorrecta,
    retroalimentacion: opcion.esCorrecta
      ? pregunta?.retroalimentacion?.correcta
      : pregunta?.retroalimentacion?.incorrecta,
  }
}

// ── Mi historial / mi progreso ──────────────────────────────────────────
export async function misHistorial(usuarioActor, { page = 1, limit = 20 } = {}) {
  const filtro = { usuario: usuarioActor.id_usuario }
  const total = await RespuestaSig.countDocuments(filtro)
  const respuestas = await RespuestaSig.find(filtro)
    .sort({ fechaProgramada: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate({ path: 'programacion', select: 'snapshotPregunta' })

  return { respuestas, total, page, pages: Math.max(1, Math.ceil(total / limit)) }
}

export async function miProgreso(usuarioActor) {
  const config = await obtenerOCrearConfiguracion()

  const filtro = { usuario: usuarioActor.id_usuario }
  if (config.ventanaDesempenoDias) {
    filtro.fechaProgramada = { $gte: new Date(Date.now() - config.ventanaDesempenoDias * MS_POR_DIA) }
  }

  const respuestas = await RespuestaSig.find(filtro)
    .select('esCorrecta componenteSigSnapshot fechaProgramada')
    .sort({ fechaProgramada: -1 })

  const total = respuestas.length
  const correctas = respuestas.filter((r) => r.esCorrecta).length
  const porcentajeAcierto = total ? Math.round((correctas / total) * 100) : 0

  const porComponenteMap = new Map()
  for (const r of respuestas) {
    const acc = porComponenteMap.get(r.componenteSigSnapshot) || { total: 0, correctas: 0 }
    acc.total += 1
    if (r.esCorrecta) acc.correctas += 1
    porComponenteMap.set(r.componenteSigSnapshot, acc)
  }
  const porComponente = [...porComponenteMap.entries()].map(([componenteSig, v]) => ({
    componenteSig,
    total: v.total,
    correctas: v.correctas,
    porcentaje: Math.round((v.correctas / v.total) * 100),
  }))

  // Racha: días consecutivos hacia atrás desde hoy con al menos una
  // respuesta registrada (mismo criterio de "día" que fechaProgramada,
  // siempre anclado a America/Bogota vía fechas.js).
  const diasConRespuesta = new Set(respuestas.map((r) => aClaveDia(r.fechaProgramada)))
  let racha = 0
  let cursor = hoy()
  while (diasConRespuesta.has(aClaveDia(cursor))) {
    racha += 1
    cursor = new Date(cursor.getTime() - MS_POR_DIA)
  }

  return {
    total,
    correctas,
    incorrectas: total - correctas,
    porcentajeAcierto,
    nivel: calcularNivel(porcentajeAcierto, config.nivelesDesempeno),
    racha,
    porComponente,
    ultimaRespuesta: respuestas[0]?.fechaProgramada || null,
  }
}
