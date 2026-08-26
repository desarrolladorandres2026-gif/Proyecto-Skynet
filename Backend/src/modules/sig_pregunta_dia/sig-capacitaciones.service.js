import CapacitacionTemaSig from '../../models/CapacitacionTemaSig.js'
import { ErrorNoEncontrado, ErrorValidacion } from '../../utils/errores.js'
import { auditar, resolverAudiencia, normalizarAudiencia } from './comun.js'

const POBLAR_LISTA = [
  { path: 'responsable', select: 'nombre nombre_usuario' },
]
const POBLAR_DETALLE = [
  ...POBLAR_LISTA,
  { path: 'participantes.usuario', select: 'nombre nombre_usuario cargo dependencia' },
]

function resumenDe(capacitacion) {
  const total = capacitacion.participantes.length
  const completados = capacitacion.participantes.filter((p) => p.completado).length
  return {
    total,
    completados,
    pendientes: total - completados,
    porcentaje: total ? Math.round((completados / total) * 100) : 0,
  }
}

// Arma la lista de participantes a partir de la audiencia (misma resolución
// que usan ProgramacionSig/CampanaSig): un snapshot fijo tomado al crear, no
// una consulta en vivo — así la capacitación no se mueve sola si alguien
// cambia de área después.
export async function crearCapacitacion(datos, usuarioActor) {
  const tema = String(datos.tema || '').trim()
  if (!tema) throw new ErrorValidacion('El tema es obligatorio')
  if (!datos.fechaProgramada) throw new ErrorValidacion('La fecha programada es obligatoria')

  const audiencia = normalizarAudiencia(datos.audiencia)
  const idsUsuarios = await resolverAudiencia(audiencia)
  if (idsUsuarios.length === 0) throw new ErrorValidacion('No hay trabajadores activos que coincidan con la audiencia elegida')

  let componenteSig = String(datos.componenteSig || '').trim()
  if (componenteSig.toUpperCase() === 'SARLAF') componenteSig = 'SARLAFT'

  const capacitacion = await CapacitacionTemaSig.create({
    tema,
    componenteSig,
    descripcion: String(datos.descripcion || '').trim(),
    fechaProgramada: new Date(datos.fechaProgramada),
    responsable: usuarioActor.id_usuario,
    audiencia,
    participantes: idsUsuarios.map((usuario) => ({ usuario, completado: false, fechaCompletado: null })),
  })

  await auditar(usuarioActor, 'crear_capacitacion_tema', 'CapacitacionTemaSig', capacitacion._id, `Programó una capacitación sobre "${tema}"`, {
    despues: capacitacion.toObject(),
  })

  await capacitacion.populate(POBLAR_DETALLE)
  return { ...capacitacion.toObject(), resumen: resumenDe(capacitacion) }
}

export async function listarCapacitaciones({ estado } = {}) {
  const filtro = {}
  if (estado) filtro.estado = estado

  const capacitaciones = await CapacitacionTemaSig.find(filtro)
    .sort({ fechaProgramada: -1 })
    .populate(POBLAR_LISTA)
    .lean()

  return capacitaciones.map((c) => ({ ...c, resumen: resumenDe(c) }))
}

export async function obtenerCapacitacion(id) {
  const capacitacion = await CapacitacionTemaSig.findById(id).populate(POBLAR_DETALLE).lean()
  if (!capacitacion) throw new ErrorNoEncontrado('Capacitación no encontrada')
  return { ...capacitacion, resumen: resumenDe(capacitacion) }
}

const ESTADOS_CAPACITACION = ['programada', 'realizada', 'cancelada']

export async function actualizarCapacitacion(id, datos, usuarioActor) {
  const capacitacion = await CapacitacionTemaSig.findById(id)
  if (!capacitacion) throw new ErrorNoEncontrado('Capacitación no encontrada')
  const antes = capacitacion.toObject()

  if (datos.estado !== undefined) {
    if (!ESTADOS_CAPACITACION.includes(datos.estado)) throw new ErrorValidacion('Estado inválido')
    capacitacion.estado = datos.estado
  }
  if (datos.descripcion !== undefined) capacitacion.descripcion = String(datos.descripcion).trim()
  if (datos.fechaProgramada !== undefined) capacitacion.fechaProgramada = new Date(datos.fechaProgramada)

  await capacitacion.save()
  await auditar(usuarioActor, 'actualizar_capacitacion_tema', 'CapacitacionTemaSig', capacitacion._id, 'Actualizó una capacitación', {
    antes,
    despues: capacitacion.toObject(),
  })

  await capacitacion.populate(POBLAR_DETALLE)
  return { ...capacitacion.toObject(), resumen: resumenDe(capacitacion) }
}

// Marca (o desmarca) a un participante puntual como que ya reforzó el tema.
// Es el registro manual que alimenta el resumen — no hay evaluación
// automática detrás, así que queda a criterio de quien gestiona la
// capacitación (asistencia, evidencia, etc.).
export async function marcarParticipante(id, usuarioId, completado, usuarioActor) {
  const capacitacion = await CapacitacionTemaSig.findById(id)
  if (!capacitacion) throw new ErrorNoEncontrado('Capacitación no encontrada')

  const participante = capacitacion.participantes.find((p) => String(p.usuario) === String(usuarioId))
  if (!participante) throw new ErrorNoEncontrado('Ese trabajador no está en la lista de participantes de esta capacitación')

  participante.completado = Boolean(completado)
  participante.fechaCompletado = participante.completado ? new Date() : null

  await capacitacion.save()
  await auditar(
    usuarioActor,
    'marcar_participante_capacitacion',
    'CapacitacionTemaSig',
    capacitacion._id,
    `${participante.completado ? 'Marcó' : 'Desmarcó'} a un trabajador como reforzado en el tema "${capacitacion.tema}"`,
    { usuarioId, completado: participante.completado }
  )

  await capacitacion.populate(POBLAR_DETALLE)
  return { ...capacitacion.toObject(), resumen: resumenDe(capacitacion) }
}
