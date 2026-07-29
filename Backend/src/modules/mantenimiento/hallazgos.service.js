import Hallazgo from '../../models/mantenimiento/Hallazgo.js'
import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import ConfiguracionSLA from '../../models/mantenimiento/ConfiguracionSLA.js'
import { SLA_MANTENIMIENTO } from '../../seedData/slaMantenimiento.data.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { notificarUsuarios } from '../../utils/sendPush.js'
import { obtenerOT, requiereSerParticipante, usuariosConPermiso } from './comun.js'

// Módulo de Hallazgos (CMMS Fase 3): registrado siempre dentro del contexto
// de una Orden de Trabajo, con ciclo de vida propio y la posibilidad de
// convertirse en una nueva OT con un clic. El Centro de Hallazgos
// transversal (agrupar/priorizar/analizar recurrencia entre TODAS las OT) es
// Fase 4, todavía no implementado — aquí solo vive el registro y su flujo
// básico de estado.

const CRITICIDADES = ['baja', 'media', 'alta', 'critica']

function auditarHallazgo(usuarioActor, accion, hallazgo, descripcion) {
  return registrarAuditoria({
    usuario: usuarioActor,
    accion,
    modulo: 'mantenimiento',
    entidad: 'Hallazgo',
    entidadId: hallazgo._id,
    descripcion,
  })
}

async function calcularSLA(prioridad) {
  const config = await ConfiguracionSLA.findOne({ prioridad })
  const horas = config || SLA_MANTENIMIENTO.find((s) => s.prioridad === prioridad) || SLA_MANTENIMIENTO.find((s) => s.prioridad === 'media')
  const ahora = Date.now()
  return {
    fecha_limite_respuesta: new Date(ahora + horas.horas_respuesta * 3600_000),
    fecha_limite_solucion: new Date(ahora + horas.horas_solucion * 3600_000),
    cumplido_respuesta: null,
    cumplido_solucion: null,
  }
}

export async function registrarHallazgo(otId, datos, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (!['en_progreso', 'en_espera'].includes(ot.estado)) {
    throw new ErrorConflicto(`No se pueden registrar hallazgos con la orden en estado "${ot.estado}"`)
  }
  requiereSerParticipante(ot, usuarioActor)

  const { categoria, tipo, criticidad, riesgo, descripcion, recomendacion, accion_correctiva, accion_preventiva, responsableId, fecha_limite } = datos
  if (!descripcion?.trim()) throw new ErrorValidacion('La descripción del hallazgo es obligatoria')
  if (!CRITICIDADES.includes(criticidad)) throw new ErrorValidacion(`criticidad debe ser una de: ${CRITICIDADES.join(', ')}`)
  if (criticidad === 'critica' && !fecha_limite) {
    throw new ErrorValidacion('Un hallazgo de criticidad crítica exige fecha límite')
  }

  const hallazgo = await Hallazgo.create({
    ordenTrabajo: ot._id,
    categoria: categoria?.trim(),
    tipo: tipo?.trim(),
    criticidad,
    riesgo: riesgo?.trim(),
    descripcion: descripcion.trim(),
    recomendacion: recomendacion?.trim(),
    accion_correctiva: accion_correctiva?.trim(),
    accion_preventiva: accion_preventiva?.trim(),
    responsable: responsableId || null,
    fecha_limite: fecha_limite ? new Date(fecha_limite) : undefined,
    registradoPor: usuarioActor.id_usuario,
  })

  await auditarHallazgo(usuarioActor, 'registrar', hallazgo, `Hallazgo (${criticidad}) registrado sobre OT ${ot._id}`)

  if (['alta', 'critica'].includes(criticidad)) {
    const supervisores = await usuariosConPermiso('mantenimiento:asignar')
    await notificarUsuarios(supervisores, {
      titulo: `Hallazgo ${criticidad} registrado`,
      cuerpo: descripcion.trim().slice(0, 120),
    })
  }

  return hallazgo
}

export async function listarHallazgosDeOrden(otId, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  const puedeVerTodas = usuarioActor.esSuperAdmin || usuarioActor.permisos?.has('mantenimiento:ver_todas')
  if (!puedeVerTodas) requiereSerParticipante(ot, usuarioActor)

  return Hallazgo.find({ ordenTrabajo: ot._id }).populate('responsable', 'nombre nombre_usuario').sort({ creado_en: -1 })
}

async function obtenerHallazgo(id) {
  const hallazgo = await Hallazgo.findById(id).populate('ordenTrabajo')
  if (!hallazgo) throw new ErrorNoEncontrado('Hallazgo no encontrado')
  return hallazgo
}

export async function agregarEvidenciaHallazgo(id, { comentario }, archivo, usuarioActor) {
  const hallazgo = await obtenerHallazgo(id)
  if (!archivo) throw new ErrorValidacion('El archivo es obligatorio')

  hallazgo.evidencias.push({ archivo: archivo.filename, comentario: comentario?.trim() })
  await hallazgo.save()

  await auditarHallazgo(usuarioActor, 'adjuntar_evidencia', hallazgo, 'Evidencia adjuntada al hallazgo')
  return hallazgo
}

export async function marcarSeguimiento(id, usuarioActor) {
  const hallazgo = await obtenerHallazgo(id)
  if (hallazgo.estado !== 'abierto') throw new ErrorConflicto(`No se puede poner en seguimiento un hallazgo en estado "${hallazgo.estado}"`)

  hallazgo.estado = 'en_seguimiento'
  await hallazgo.save()

  await auditarHallazgo(usuarioActor, 'marcar_seguimiento', hallazgo, 'Hallazgo puesto en seguimiento')
  return hallazgo
}

export async function marcarResuelto(id, usuarioActor) {
  const hallazgo = await obtenerHallazgo(id)
  if (!['abierto', 'en_seguimiento'].includes(hallazgo.estado)) {
    throw new ErrorConflicto(`No se puede resolver un hallazgo en estado "${hallazgo.estado}"`)
  }

  hallazgo.estado = 'resuelto'
  await hallazgo.save()

  await auditarHallazgo(usuarioActor, 'marcar_resuelto', hallazgo, 'Hallazgo resuelto')
  return hallazgo
}

// Requiere permiso de asignación (nivel supervisor): aceptar un riesgo sin
// convertirlo en OT es una decisión de negocio, no una acción de ejecución.
export async function aceptarRiesgo(id, { justificacion, reevaluarEn }, usuarioActor) {
  const hallazgo = await obtenerHallazgo(id)
  if (!['abierto', 'en_seguimiento'].includes(hallazgo.estado)) {
    throw new ErrorConflicto(`No se puede aceptar el riesgo de un hallazgo en estado "${hallazgo.estado}"`)
  }
  if (!justificacion?.trim()) throw new ErrorValidacion('La justificación es obligatoria para aceptar un riesgo')
  if (!reevaluarEn) throw new ErrorValidacion('Debes indicar una fecha de reevaluación')

  hallazgo.riesgoAceptado = {
    aceptado: true,
    justificacion: justificacion.trim(),
    aceptadoPor: usuarioActor.id_usuario,
    aceptadoEn: new Date(),
    reevaluarEn: new Date(reevaluarEn),
  }
  await hallazgo.save()

  await auditarHallazgo(usuarioActor, 'aceptar_riesgo', hallazgo, `Riesgo aceptado: ${justificacion.trim()}`)
  return hallazgo
}

// Convierte el hallazgo en una nueva OT con origen:'hallazgo' — un clic,
// según el diseño de Fase 3. La criticidad del hallazgo se traduce 1:1 a la
// prioridad de la nueva orden (mismos 4 valores).
export async function convertirEnOT(id, usuarioActor) {
  const hallazgo = await obtenerHallazgo(id)
  if (hallazgo.estado === 'convertido_en_ot') throw new ErrorConflicto('Este hallazgo ya fue convertido en una orden de trabajo')

  const otOrigen = hallazgo.ordenTrabajo
  const prioridad = hallazgo.criticidad
  const sla = await calcularSLA(prioridad)

  const nuevaOT = await Mantenimiento.create({
    equipo: otOrigen.equipo,
    fecha: new Date(),
    tipo: 'Correctivo',
    descripcion: `[Hallazgo] ${hallazgo.descripcion}`,
    estado: 'reportado',
    origen: 'hallazgo',
    prioridad,
    sla,
  })

  hallazgo.estado = 'convertido_en_ot'
  hallazgo.ordenTrabajoGenerada = nuevaOT._id
  await hallazgo.save()

  await auditarHallazgo(usuarioActor, 'convertir_en_ot', hallazgo, `Hallazgo convertido en OT ${nuevaOT._id}`)

  const supervisores = await usuariosConPermiso('mantenimiento:asignar')
  await notificarUsuarios(supervisores, {
    titulo: 'Nueva OT generada desde un hallazgo',
    cuerpo: hallazgo.descripcion.slice(0, 120),
  })

  return { hallazgo, ordenTrabajo: nuevaOT }
}
