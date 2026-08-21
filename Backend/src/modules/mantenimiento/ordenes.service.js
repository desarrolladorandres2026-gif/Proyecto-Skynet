import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import Equipo from '../../models/mantenimiento/Equipo.js'
import ConfiguracionSLA from '../../models/mantenimiento/ConfiguracionSLA.js'
import Usuario from '../../models/Usuario.js'
import Rol from '../../models/Rol.js'
import Permiso from '../../models/Permiso.js'
import { SLA_MANTENIMIENTO } from '../../seedData/slaMantenimiento.data.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { notificarUsuarios as _notificarUsuarios } from '../../utils/sendPush.js'

// Categoría fija para todo este módulo (ver notificaciones.catalogo.js):
// respeta la preferencia de canal/categoría del usuario en vez del envío
// solo-push incondicional de antes.
const notificarUsuarios = (userIds, payload) => _notificarUsuarios(userIds, payload, 'mantenimiento')
import {
  ESTADOS_ACTIVOS, obtenerOT, idDe, esParticipante, requiereSerTecnicoAsignado,
  usuariosConPermiso, validarTecnico, auditar,
} from './comun.js'

// Único punto de verdad de la máquina de estados de la Orden de Trabajo
// (Fase 1, ya aprobada): cada función exportada valida su propia transición,
// guarda, audita y notifica. Ningún controlador ni ruta debe mutar `estado`
// directamente por fuera de este archivo.

const PRIORIDADES = ['baja', 'media', 'alta', 'critica']
const MOTIVOS_ESPERA = ['repuestos', 'aprobacion', 'informacion', 'apoyo']

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

// Upsert-only (nunca pisa una fila ya existente): un valor de SLA ajustado a
// mano por un administrador sobrevive a reinicios del servidor.
export async function sincronizarConfiguracionSLA() {
  try {
    for (const s of SLA_MANTENIMIENTO) {
      await ConfiguracionSLA.updateOne({ prioridad: s.prioridad }, { $setOnInsert: s }, { upsert: true })
    }
  } catch (err) {
    console.error('No se pudo sincronizar la configuración de SLA de mantenimiento:', err.message)
  }
}

// ── Consulta ─────────────────────────────────────────────────────────────

export async function listarOrdenes(usuarioActor, { estado, page = 1 } = {}) {
  const limit = 30
  const puedeVerTodas = usuarioActor.esSuperAdmin || usuarioActor.permisos?.has('mantenimiento:ver_todas')

  const filtro = {}
  if (estado) filtro.estado = estado
  if (!puedeVerTodas) {
    filtro.$or = [{ tecnico_asignado: usuarioActor.id_usuario }, { tecnicos_apoyo: usuarioActor.id_usuario }]
  }

  const [ordenes, total] = await Promise.all([
    Mantenimiento.find(filtro)
      .populate('equipo')
      .populate('tecnico_asignado', 'nombre nombre_usuario')
      .sort({ fecha: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Mantenimiento.countDocuments(filtro),
  ])

  return { ordenes, total, pages: Math.ceil(total / limit), page }
}

// Para el selector de técnico del modal de asignación en el frontend.
export async function listarTecnicos() {
  const permiso = await Permiso.findOne({ codigo: 'mantenimiento:ejecutar' }).select('_id')
  if (!permiso) return []
  const roles = await Rol.find({ permisos: permiso._id }).select('_id')
  if (!roles.length) return []
  return Usuario.find({ rol: { $in: roles.map((r) => r._id) }, estado: 'activo', esPrueba: false }).select('nombre nombre_usuario email')
}

export async function obtenerOrdenDetalle(id, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')

  const puedeVerTodas = usuarioActor.esSuperAdmin || usuarioActor.permisos?.has('mantenimiento:ver_todas')
  if (!puedeVerTodas && !esParticipante(ot, usuarioActor)) {
    throw new ErrorConflicto('No tienes acceso a esta orden de trabajo')
  }
  return ot
}

// ── Creación ─────────────────────────────────────────────────────────────

// Universal: cualquier usuario autenticado puede reportar un problema, igual
// que "Reportar daño" en modules/danos — no exige ningún permiso RBAC.
export async function reportarProblema({ equipoId, descripcion, prioridad, tipo }, usuarioActor) {
  if (!equipoId || !descripcion?.trim()) throw new ErrorValidacion('equipo y descripción son obligatorios')

  const equipo = await Equipo.findById(equipoId)
  if (!equipo) throw new ErrorNoEncontrado('Equipo no encontrado')

  const prioridadFinal = PRIORIDADES.includes(prioridad) ? prioridad : 'media'
  const sla = await calcularSLA(prioridadFinal)

  const ot = await Mantenimiento.create({
    equipo: equipo._id,
    fecha: new Date(),
    tipo: tipo?.trim() || 'Correctivo',
    descripcion: descripcion.trim(),
    estado: 'reportado',
    origen: 'correctivo',
    prioridad: prioridadFinal,
    reportadoPor: usuarioActor.id_usuario,
    sla,
  })

  await auditar(usuarioActor, 'reportar', ot, `Problema reportado sobre ${equipo.numero_inventario}`, {
    antes: null,
    despues: { estado: ot.estado, prioridad: ot.prioridad },
  })

  const supervisores = await usuariosConPermiso('mantenimiento:asignar')
  await notificarUsuarios(supervisores, {
    titulo: 'Nuevo problema de mantenimiento reportado',
    cuerpo: `${equipo.numero_inventario}: ${descripcion.trim().slice(0, 120)}`,
  })

  return ot
}

export async function programarPreventivo({ equipoId, fecha, tipo, tecnicoId, descripcion }, usuarioActor) {
  if (!equipoId || !fecha) throw new ErrorValidacion('equipo y fecha son obligatorios')

  const equipo = await Equipo.findById(equipoId)
  if (!equipo) throw new ErrorNoEncontrado('Equipo no encontrado')

  const fechaProgramada = new Date(fecha)
  if (Number.isNaN(fechaProgramada.getTime())) throw new ErrorValidacion('fecha inválida')

  const tecnico_asignado = tecnicoId ? await validarTecnico(tecnicoId) : null

  const ot = await Mantenimiento.create({
    equipo: equipo._id,
    fecha: fechaProgramada,
    tipo: tipo?.trim() || 'Preventivo',
    descripcion: descripcion?.trim() || 'Mantenimiento preventivo programado.',
    estado: 'programada',
    origen: 'preventivo',
    tecnico_asignado,
  })

  await auditar(usuarioActor, 'programar', ot, `Preventivo programado sobre ${equipo.numero_inventario}`, {
    antes: null,
    despues: { estado: ot.estado, fecha: ot.fecha },
  })

  if (tecnico_asignado) {
    await notificarUsuarios([tecnico_asignado], {
      titulo: 'Preventivo programado',
      cuerpo: `Se te asignó un preventivo para el ${fechaProgramada.toLocaleDateString('es-CO')}.`,
    })
  }

  return ot
}

// ── Transiciones ─────────────────────────────────────────────────────────

export async function asignarTecnico(id, { tecnicoId }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (ot.estado !== 'reportado') throw new ErrorConflicto(`No se puede asignar una orden en estado "${ot.estado}"`)
  if (!tecnicoId) throw new ErrorValidacion('tecnicoId es obligatorio')

  const tecnicoIdValido = await validarTecnico(tecnicoId)

  const advertencias = []
  const otrasActivas = await Mantenimiento.countDocuments({
    equipo: idDe(ot.equipo),
    _id: { $ne: ot._id },
    estado: { $in: ESTADOS_ACTIVOS },
  })
  if (otrasActivas > 0) advertencias.push(`Este equipo ya tiene ${otrasActivas} orden(es) de trabajo activa(s).`)

  const estadoAnterior = ot.estado
  ot.tecnico_asignado = tecnicoIdValido
  ot.estado = 'asignada'
  await ot.save()

  await auditar(usuarioActor, 'asignar', ot, 'Técnico asignado', {
    antes: { estado: estadoAnterior, tecnico_asignado: null },
    despues: { estado: ot.estado, tecnico_asignado: tecnicoIdValido },
  })

  await notificarUsuarios([tecnicoIdValido], {
    titulo: 'Nueva orden de trabajo asignada',
    cuerpo: `Prioridad ${ot.prioridad}: ${ot.descripcion.slice(0, 120)}`,
  })

  return { ot, advertencias }
}

export async function aceptarOrden(id, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (ot.estado !== 'asignada') throw new ErrorConflicto(`No se puede aceptar una orden en estado "${ot.estado}"`)
  requiereSerTecnicoAsignado(ot, usuarioActor)

  ot.estado = 'en_progreso'
  ot.fecha_aceptacion = new Date()
  if (ot.sla?.fecha_limite_respuesta) {
    ot.sla.cumplido_respuesta = new Date() <= ot.sla.fecha_limite_respuesta
  }
  await ot.save()

  await auditar(usuarioActor, 'aceptar', ot, 'Técnico aceptó la orden', {
    antes: { estado: 'asignada' },
    despues: { estado: 'en_progreso' },
  })

  const supervisores = await usuariosConPermiso('mantenimiento:asignar')
  await notificarUsuarios(supervisores, {
    titulo: 'Orden aceptada',
    cuerpo: `${usuarioActor.nombre_usuario} aceptó una orden de trabajo.`,
  })

  return ot
}

export async function rechazarAsignacion(id, { motivo }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (ot.estado !== 'asignada') throw new ErrorConflicto(`No se puede rechazar una orden en estado "${ot.estado}"`)
  requiereSerTecnicoAsignado(ot, usuarioActor)
  if (!motivo?.trim()) throw new ErrorValidacion('El motivo de rechazo es obligatorio')

  ot.estado = 'reportado'
  ot.tecnico_asignado = null
  ot.rechazos += 1
  if (ot.rechazos >= 2) ot.escalado = true
  await ot.save()

  await auditar(usuarioActor, 'rechazar_asignacion', ot, `Asignación rechazada: ${motivo.trim()}`, {
    antes: { estado: 'asignada' },
    despues: { estado: 'reportado', rechazos: ot.rechazos },
  })

  const supervisores = await usuariosConPermiso('mantenimiento:asignar')
  await notificarUsuarios(supervisores, { titulo: 'Asignación rechazada', cuerpo: motivo.trim() })

  return ot
}

export async function pausarOrden(id, { motivo_espera }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (ot.estado !== 'en_progreso') throw new ErrorConflicto(`No se puede pausar una orden en estado "${ot.estado}"`)
  if (!esParticipante(ot, usuarioActor)) throw new ErrorConflicto('No tienes acceso a esta orden de trabajo')
  if (!MOTIVOS_ESPERA.includes(motivo_espera)) {
    throw new ErrorValidacion(`motivo_espera debe ser uno de: ${MOTIVOS_ESPERA.join(', ')}`)
  }

  ot.estado = 'en_espera'
  ot.motivo_espera = motivo_espera
  await ot.save()

  await auditar(usuarioActor, 'pausar', ot, `Orden en espera (${motivo_espera})`, {
    antes: { estado: 'en_progreso' },
    despues: { estado: 'en_espera', motivo_espera },
  })

  return ot
}

export async function reanudarOrden(id, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (ot.estado !== 'en_espera') throw new ErrorConflicto(`No se puede reanudar una orden en estado "${ot.estado}"`)
  if (!esParticipante(ot, usuarioActor)) throw new ErrorConflicto('No tienes acceso a esta orden de trabajo')

  const motivoAnterior = ot.motivo_espera
  ot.estado = 'en_progreso'
  ot.motivo_espera = null
  await ot.save()

  await auditar(usuarioActor, 'reanudar', ot, `Orden reanudada (esperaba: ${motivoAnterior})`, {
    antes: { estado: 'en_espera', motivo_espera: motivoAnterior },
    despues: { estado: 'en_progreso' },
  })

  return ot
}

export async function resolverOrden(id, { descripcion_solucion }, usuarioActor, foto) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (ot.estado !== 'en_progreso') throw new ErrorConflicto(`No se puede resolver una orden en estado "${ot.estado}"`)
  requiereSerTecnicoAsignado(ot, usuarioActor)
  if (!descripcion_solucion?.trim()) {
    // El checklist de completitud completo (diagnóstico, horas, evidencia) se
    // conecta cuando se implemente la Fase 3; aquí solo se exige lo mínimo ya
    // definido en la Fase 1.
    throw new ErrorValidacion('La descripción de la solución es obligatoria')
  }

  ot.descripcion_solucion = descripcion_solucion.trim()
  // La foto es opcional a propósito: esta OT también cubre equipos donde una
  // foto no aplica (p. ej. una falla de software). Si el técnico la adjunta,
  // queda en el mismo arreglo de evidencias que usa el resto de la Fase 3.
  if (foto) {
    ot.evidencias.push({
      tipo: 'foto',
      momento: 'despues',
      archivo: foto.filename,
      comentario: 'Evidencia de la solución',
      subidoPor: usuarioActor.id_usuario,
    })
  }

  // Evaluación automática (Fase 1, transición 11): por prioridad. El criterio
  // de costo se conecta cuando exista el registro de materiales (Fase 3).
  const requiereAprobacion = ['alta', 'critica'].includes(ot.prioridad)
  ot.estado = requiereAprobacion ? 'pendiente_aprobacion' : 'cerrada'
  if (requiereAprobacion) {
    ot.aprobacion.requerida = true
  } else {
    ot.fecha_cierre = new Date()
    if (ot.sla?.fecha_limite_solucion) {
      ot.sla.cumplido_solucion = new Date() <= ot.sla.fecha_limite_solucion
    }
  }
  await ot.save()

  await auditar(usuarioActor, 'resolver', ot, 'Técnico marcó la orden como solucionada', {
    antes: { estado: 'en_progreso' },
    despues: { estado: ot.estado },
  })

  if (requiereAprobacion) {
    const aprobadores = await usuariosConPermiso('mantenimiento:aprobar_cerrar')
    await notificarUsuarios(aprobadores, {
      titulo: 'Orden pendiente de aprobación',
      cuerpo: `Prioridad ${ot.prioridad}, requiere tu aprobación para cerrar.`,
    })
  }

  return ot
}

export async function aprobarCierre(id, { comentario }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (ot.estado !== 'pendiente_aprobacion') throw new ErrorConflicto(`No se puede aprobar una orden en estado "${ot.estado}"`)

  ot.estado = 'cerrada'
  ot.fecha_cierre = new Date()
  ot.aprobacion.aprobadoPor = usuarioActor.id_usuario
  ot.aprobacion.aprobadoEn = new Date()
  ot.aprobacion.comentario = comentario?.trim()
  if (ot.sla?.fecha_limite_solucion) {
    ot.sla.cumplido_solucion = new Date() <= ot.sla.fecha_limite_solucion
  }
  await ot.save()

  await auditar(usuarioActor, 'aprobar_cierre', ot, 'Supervisor aprobó y cerró la orden', {
    antes: { estado: 'pendiente_aprobacion' },
    despues: { estado: 'cerrada' },
  })

  if (ot.tecnico_asignado) {
    await notificarUsuarios([idDe(ot.tecnico_asignado)], { titulo: 'Orden aprobada y cerrada', cuerpo: 'Tu orden fue aprobada y cerrada.' })
  }

  return ot
}

export async function rechazarCierre(id, { comentario }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (ot.estado !== 'pendiente_aprobacion') throw new ErrorConflicto(`No se puede rechazar el cierre de una orden en estado "${ot.estado}"`)
  if (!comentario?.trim()) throw new ErrorValidacion('El comentario es obligatorio para rechazar el cierre')

  ot.estado = 'en_progreso'
  ot.aprobacion.comentario = comentario.trim()
  await ot.save()

  await auditar(usuarioActor, 'rechazar_cierre', ot, `Cierre rechazado: ${comentario.trim()}`, {
    antes: { estado: 'pendiente_aprobacion' },
    despues: { estado: 'en_progreso' },
  })

  if (ot.tecnico_asignado) {
    await notificarUsuarios([idDe(ot.tecnico_asignado)], { titulo: 'Cierre rechazado', cuerpo: comentario.trim() })
  }

  return ot
}

export async function reabrirOrden(id, { motivo }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (ot.estado !== 'cerrada') throw new ErrorConflicto('Solo se puede reabrir una orden cerrada')
  if (!motivo?.trim()) throw new ErrorValidacion('El motivo de reapertura es obligatorio')
  if (ot.reaperturas >= 1 && motivo.trim().length < 20) {
    throw new ErrorValidacion('A partir de la segunda reapertura se exige una justificación de al menos 20 caracteres')
  }

  ot.estado = 'asignada'
  ot.reaperturas += 1
  await ot.save()

  await auditar(usuarioActor, 'reabrir', ot, `Orden reabierta (reapertura ${ot.reaperturas}): ${motivo.trim()}`, {
    antes: { estado: 'cerrada' },
    despues: { estado: 'asignada', reaperturas: ot.reaperturas },
  })

  const destinatarios = []
  if (ot.tecnico_asignado) destinatarios.push(idDe(ot.tecnico_asignado))
  if (ot.reaperturas > 3) destinatarios.push(...(await usuariosConPermiso('mantenimiento:asignar')))
  await notificarUsuarios(destinatarios, {
    titulo: `Orden reabierta (reapertura ${ot.reaperturas})`,
    cuerpo: motivo.trim(),
  })

  return ot
}

export async function cancelarOrden(id, { motivo }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (!ESTADOS_ACTIVOS.includes(ot.estado)) throw new ErrorConflicto(`No se puede cancelar una orden en estado "${ot.estado}"`)
  if (!motivo?.trim()) throw new ErrorValidacion('El motivo de cancelación es obligatorio')

  const estadoAnterior = ot.estado
  ot.estado = 'cancelada'
  await ot.save()

  await auditar(usuarioActor, 'cancelar', ot, `Orden cancelada: ${motivo.trim()}`, {
    antes: { estado: estadoAnterior },
    despues: { estado: 'cancelada' },
  })

  if (ot.tecnico_asignado) {
    await notificarUsuarios([idDe(ot.tecnico_asignado)], { titulo: 'Orden cancelada', cuerpo: motivo.trim() })
  }

  return ot
}

export async function escalarOrden(id, { motivo, destino }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (!ESTADOS_ACTIVOS.includes(ot.estado)) throw new ErrorConflicto(`No se puede escalar una orden en estado "${ot.estado}"`)
  if (!motivo?.trim()) throw new ErrorValidacion('El motivo de escalamiento es obligatorio')

  const puedeEscalar = usuarioActor.esSuperAdmin
    || usuarioActor.permisos?.has('mantenimiento:escalar')
    || esParticipante(ot, usuarioActor)
  if (!puedeEscalar) throw new ErrorConflicto('No tienes acceso a esta orden de trabajo')

  ot.escalado = true
  ot.escaladoA = destino?.trim() || 'supervisor'
  ot.escaladoEn = new Date()
  ot.escaladoMotivo = motivo.trim()
  await ot.save()

  await auditar(usuarioActor, 'escalar', ot, `Orden escalada a ${ot.escaladoA}: ${motivo.trim()}`, {
    antes: { escalado: false },
    despues: { escalado: true, escaladoA: ot.escaladoA },
  })

  const supervisores = await usuariosConPermiso('mantenimiento:asignar')
  await notificarUsuarios(supervisores, { titulo: 'Orden de trabajo escalada', cuerpo: `${motivo.trim()} (destino: ${ot.escaladoA})` })

  return ot
}
