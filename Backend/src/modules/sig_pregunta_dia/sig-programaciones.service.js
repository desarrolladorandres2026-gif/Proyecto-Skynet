import ProgramacionSig from '../../models/ProgramacionSig.js'
import PreguntaSig from '../../models/PreguntaSig.js'
import CampanaSig from '../../models/CampanaSig.js'
import Usuario from '../../models/Usuario.js'
import { inicioDelDia, instanteLocal, rangoDeDias } from '../../utils/fechas.js'
import { ErrorNoEncontrado, ErrorConflicto, ErrorValidacion } from '../../utils/errores.js'
import { notificarUsuarios as _notificarUsuarios } from '../../utils/sendPush.js'
import { auditar, obtenerOCrearConfiguracion, resolverAudiencia, normalizarAudiencia } from './comun.js'

const notificarUsuarios = (userIds, payload) => _notificarUsuarios(userIds, payload, 'sig_pregunta_dia')

// ── Programación individual ─────────────────────────────────────────────
export async function crearProgramacionIndividual(datos, usuarioActor) {
  const { preguntaId, fecha, hora, audiencia } = datos

  const pregunta = await PreguntaSig.findById(preguntaId)
  if (!pregunta) throw new ErrorNoEncontrado('Pregunta no encontrada')
  if (pregunta.estado !== 'activa') throw new ErrorValidacion('Solo se pueden programar preguntas activas')

  if (!fecha) throw new ErrorValidacion('Debes indicar la fecha de publicación')
  const config = await obtenerOCrearConfiguracion()
  const horaFinal = hora?.trim() || config.horaPublicacionDefecto

  const fechaProgramada = inicioDelDia(fecha)
  const fechaHoraPublicacion = instanteLocal(`${fecha}T${horaFinal}`)
  if (!fechaProgramada || !fechaHoraPublicacion) throw new ErrorValidacion('La fecha o la hora no son válidas')
  if (fechaHoraPublicacion.getTime() < Date.now() - 60_000) {
    throw new ErrorValidacion('La fecha y hora de publicación deben ser futuras')
  }

  const doc = await ProgramacionSig.create({
    pregunta: pregunta._id,
    fechaProgramada,
    fechaHoraPublicacion,
    audiencia: normalizarAudiencia(audiencia),
    creadoPor: usuarioActor.id_usuario,
  })

  await auditar(
    usuarioActor,
    'programar',
    'ProgramacionSig',
    doc._id,
    `Programó la pregunta "${pregunta.enunciado.slice(0, 60)}" para el ${fecha} a las ${horaFinal}`
  )

  return doc.populate('pregunta', 'enunciado componenteSig')
}

export async function listarProgramacionesIndividuales({ desde, hasta, estado } = {}) {
  const filtro = { campana: null }
  if (estado) filtro.estado = estado
  if (desde && hasta) filtro.fechaProgramada = rangoDeDias(desde, hasta)

  return ProgramacionSig.find(filtro)
    .sort({ fechaHoraPublicacion: 1 })
    .populate('pregunta', 'enunciado componenteSig')
}

// Para la vista calendario (sección 39 del encargo): TODAS las
// programaciones del rango, individuales o de campaña, con el nombre de la
// campaña si aplica — a diferencia de listarProgramacionesIndividuales() de
// arriba, que a propósito excluye las de campaña (esa es la bandeja de
// "programación individual").
export async function listarProgramacionesCalendario({ desde, hasta }) {
  const filtro = { fechaProgramada: rangoDeDias(desde, hasta) }
  return ProgramacionSig.find(filtro)
    .sort({ fechaHoraPublicacion: 1 })
    .populate('pregunta', 'enunciado componenteSig')
    .populate('campana', 'nombre')
}

export async function cancelarProgramacionIndividual(id, motivo, usuarioActor) {
  const doc = await ProgramacionSig.findById(id)
  if (!doc) throw new ErrorNoEncontrado('Programación no encontrada')
  if (doc.estado !== 'programada') {
    throw new ErrorConflicto('Solo se puede cancelar una programación que aún no se ha publicado')
  }

  doc.estado = 'cancelada'
  doc.cancelacion = { canceladaPor: usuarioActor.id_usuario, motivo: motivo?.trim() || '', fecha: new Date() }
  await doc.save()

  await auditar(usuarioActor, 'cancelar_programacion', 'ProgramacionSig', doc._id, 'Canceló una programación antes de publicarse')
  return doc
}

// ── Motor de publicación automática (usado por sig.worker.js) ──────────────

// El worker no tiene un "actor sistema": RegistroAuditoria.usuario es un ref
// obligatorio a un Usuario real. Se atribuye la publicación automática a
// quien programó la pregunta/campaña — sí originó la acción, el sistema solo
// ejecutó el "cuándo".
async function actorDesdeCreador(creadoPorId) {
  const creador = await Usuario.findById(creadoPorId).select('nombre_usuario rol').populate('rol', 'slug')
  return {
    id_usuario: creadoPorId,
    nombre_usuario: creador?.nombre_usuario || 'usuario eliminado',
    rol: { slug: creador?.rol?.slug },
  }
}

async function avisarPublicacion(doc) {
  const config = await obtenerOCrearConfiguracion()
  if (!config.notificarAlPublicar) return

  const destinatarios = await resolverAudiencia(doc.audiencia)
  if (!destinatarios.length) return

  await notificarUsuarios(destinatarios, {
    title: '🧠 Nuevo Cuestionario Programado',
    body: `Ya está disponible tu pregunta de capacitación de hoy. Componente: ${doc.snapshotPregunta.componenteSig}`,
    url: '/sig/pregunta-del-dia',
  })
}

// Publica cada ProgramacionSig cuya fechaHoraPublicacion ya llegó. El
// findOneAndUpdate con filtro {_id, estado:'programada'} es un
// compare-and-swap atómico a nivel de Mongo: si dos ticks (o dos instancias
// del proceso) compiten por la misma candidata, solo uno obtiene un
// resultado no-null y solo ese notifica/audita — un tick duplicado nunca
// publica ni notifica dos veces.
export async function publicarPendientes(lote = 200) {
  const ahora = new Date()
  const candidatas = await ProgramacionSig.find({ estado: 'programada', fechaHoraPublicacion: { $lte: ahora } })
    .limit(lote)
    .select('_id pregunta audiencia creadoPor campana')

  let publicadas = 0
  for (const candidata of candidatas) {
    // Una programación que pertenece a una campaña PAUSADA o CANCELADA se
    // salta sin tocarla (sigue en 'programada'): si la campaña se reanuda
    // más adelante, el siguiente tick la publica normalmente. Cancelar la
    // campaña sí marca sus programaciones futuras como 'cancelada' de una
    // vez (ver sig-campanas.service.js#cancelarCampana), así que en la
    // práctica este chequeo solo importa para el caso "pausada".
    if (candidata.campana) {
      const campana = await CampanaSig.findById(candidata.campana).select('estado')
      if (!campana || campana.estado !== 'activa') continue
    }

    const pregunta = await PreguntaSig.findById(candidata.pregunta)
    // Defensivo: sig-banco.service.js impide borrar una pregunta ya usada en
    // una programación, así que esto no debería pasar en operación normal.
    if (!pregunta) continue

    const snapshotPregunta = {
      enunciado: pregunta.enunciado,
      opciones: pregunta.opciones.map((o) => ({ texto: o.texto, esCorrecta: o.esCorrecta })),
      componenteSig: pregunta.componenteSig,
      tema: pregunta.tema,
    }

    const publicada = await ProgramacionSig.findOneAndUpdate(
      { _id: candidata._id, estado: 'programada' },
      { $set: { estado: 'publicada', publicadaEn: new Date(), snapshotPregunta } },
      { new: true }
    )
    if (!publicada) continue // otro tick/instancia ya ganó la carrera

    publicadas++

    const actor = await actorDesdeCreador(publicada.creadoPor)
    await auditar(
      actor,
      'publicar_automatico',
      'ProgramacionSig',
      publicada._id,
      `Publicación automática a la hora programada: "${snapshotPregunta.enunciado.slice(0, 60)}"`
    )
    await avisarPublicacion(publicada)
  }

  return publicadas
}
