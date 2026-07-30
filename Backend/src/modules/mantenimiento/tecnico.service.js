import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { notificarUsuarios as _notificarUsuarios } from '../../utils/sendPush.js'

// Categoría fija para todo este módulo (ver notificaciones.catalogo.js):
// respeta la preferencia de canal/categoría del usuario en vez del envío
// solo-push incondicional de antes.
const notificarUsuarios = (userIds, payload) => _notificarUsuarios(userIds, payload, 'mantenimiento')
import {
  ESTADOS_ACTIVOS, obtenerOT, idDe, esParticipante, requiereSerTecnicoAsignado,
  requiereSerParticipante, usuariosConPermiso, validarTecnico, auditar,
} from './comun.js'

// Ejecución técnica de una Orden de Trabajo (CMMS Fase 3): registro de
// llegada/inspección/diagnóstico/materiales/herramientas/horas/evidencias, y
// los dos sub-flujos con ciclo de vida propio (repuestos y apoyo entre
// técnicos). Se apoya en comun.js para no repetir las reglas de acceso ya
// establecidas en ordenes.service.js (Fase 1).

const TIPOS_EVIDENCIA = ['foto', 'video', 'pdf', 'excel', 'word', 'audio']
const MOMENTOS_EVIDENCIA = ['antes', 'durante', 'despues', 'general']
const NIVELES_AFECTACION = ['bajo', 'medio', 'alto', 'critico']

function requiereEnProgreso(ot) {
  if (ot.estado !== 'en_progreso') {
    throw new ErrorConflicto(`Esta acción solo está disponible con la orden en progreso (estado actual: "${ot.estado}")`)
  }
}

// ── Registro de llegada / inspección / diagnóstico ──────────────────────────

export async function registrarLlegada(id, { ubicacion, lat, lng, comentario, foto }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  requiereEnProgreso(ot)
  requiereSerParticipante(ot, usuarioActor)

  ot.llegada = {
    hora: new Date(),
    ubicacion: ubicacion?.trim(),
    lat: typeof lat === 'number' ? lat : undefined,
    lng: typeof lng === 'number' ? lng : undefined,
    comentario: comentario?.trim(),
    foto,
  }
  if (!ot.pasoOperativo) ot.pasoOperativo = 'inspeccion'
  await ot.save()

  await auditar(usuarioActor, 'registrar_llegada', ot, `Técnico registró llegada${ubicacion ? `: ${ubicacion.trim()}` : ''}`, {
    antes: null,
    despues: { ubicacion: ot.llegada.ubicacion },
  })

  return ot
}

export async function iniciarInspeccion(id, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  requiereEnProgreso(ot)
  requiereSerParticipante(ot, usuarioActor)

  ot.pasoOperativo = 'diagnostico'
  await ot.save()

  await auditar(usuarioActor, 'iniciar_inspeccion', ot, 'Técnico inició inspección', {
    antes: null,
    despues: { pasoOperativo: 'diagnostico' },
  })

  return ot
}

export async function registrarDiagnostico(id, { diagnostico, causa_raiz, nivel_afectacion, recomendaciones }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  requiereEnProgreso(ot)
  requiereSerParticipante(ot, usuarioActor)
  if (!diagnostico?.trim() || !causa_raiz?.trim()) {
    throw new ErrorValidacion('diagnóstico y causa raíz son obligatorios')
  }
  if (nivel_afectacion && !NIVELES_AFECTACION.includes(nivel_afectacion)) {
    throw new ErrorValidacion(`nivel_afectacion debe ser uno de: ${NIVELES_AFECTACION.join(', ')}`)
  }

  ot.diagnostico = diagnostico.trim()
  ot.causa_raiz = causa_raiz.trim()
  ot.nivel_afectacion = nivel_afectacion || ot.nivel_afectacion
  ot.recomendaciones = recomendaciones?.trim()
  // Si el técnico registra diagnóstico sin haber marcado "iniciar inspección"
  // antes, se avanza implícitamente en vez de bloquear (ver diseño Fase 3).
  if (!ot.pasoOperativo || ot.pasoOperativo === 'llegada') ot.pasoOperativo = 'diagnostico'
  await ot.save()

  await auditar(usuarioActor, 'registrar_diagnostico', ot, `Diagnóstico registrado: ${diagnostico.trim().slice(0, 120)}`, {
    antes: null,
    despues: { nivel_afectacion: ot.nivel_afectacion },
  })

  if (ot.nivel_afectacion === 'critico') {
    const supervisores = await usuariosConPermiso('mantenimiento:asignar')
    await notificarUsuarios(supervisores, {
      titulo: 'Diagnóstico de afectación crítica',
      cuerpo: diagnostico.trim().slice(0, 120),
    })
  }

  return ot
}

// ── Materiales / herramientas / horas ───────────────────────────────────────

export async function registrarMaterial(id, { material, cantidad, costo_unitario, proveedor, observaciones }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  requiereEnProgreso(ot)
  requiereSerParticipante(ot, usuarioActor)
  if (!material?.trim() || !(Number(cantidad) > 0)) {
    throw new ErrorValidacion('material y una cantidad mayor a 0 son obligatorios')
  }
  const costoUnitario = Number(costo_unitario) || 0
  if (costoUnitario < 0) throw new ErrorValidacion('El costo unitario no puede ser negativo')

  ot.materiales.push({
    material: material.trim(),
    cantidad: Number(cantidad),
    costo_unitario: costoUnitario,
    proveedor: proveedor?.trim(),
    observaciones: observaciones?.trim(),
    registradoPor: usuarioActor.id_usuario,
  })
  ot.costo_materiales = ot.materiales.reduce((acc, m) => acc + m.cantidad * m.costo_unitario, 0)
  await ot.save()

  await auditar(usuarioActor, 'registrar_material', ot, `Material registrado: ${material.trim()} x${cantidad}`, {
    antes: null,
    despues: { costo_materiales: ot.costo_materiales },
  })

  return ot
}

export async function registrarHerramienta(id, { herramienta, tiempo_uso_minutos, observaciones }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  requiereEnProgreso(ot)
  requiereSerParticipante(ot, usuarioActor)
  if (!herramienta?.trim()) throw new ErrorValidacion('herramienta es obligatoria')

  ot.herramientas.push({
    herramienta: herramienta.trim(),
    tiempo_uso_minutos: tiempo_uso_minutos ? Number(tiempo_uso_minutos) : undefined,
    observaciones: observaciones?.trim(),
    registradoPor: usuarioActor.id_usuario,
  })
  await ot.save()

  await auditar(usuarioActor, 'registrar_herramienta', ot, `Herramienta registrada: ${herramienta.trim()}`, { antes: null, despues: null })

  return ot
}

export async function registrarHoras(id, { inicio, fin, pausas_minutos, tiempo_improductivo_minutos, motivo_improductivo, es_extra }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  requiereEnProgreso(ot)
  requiereSerParticipante(ot, usuarioActor)

  const fechaInicio = new Date(inicio)
  const fechaFin = new Date(fin)
  if (Number.isNaN(fechaInicio.getTime()) || Number.isNaN(fechaFin.getTime()) || fechaFin <= fechaInicio) {
    throw new ErrorValidacion('inicio y fin deben ser fechas válidas, con fin posterior a inicio')
  }

  const pausas = Math.max(0, Number(pausas_minutos) || 0)
  const improductivo = Math.max(0, Number(tiempo_improductivo_minutos) || 0)
  const totalMinutos = Math.round((fechaFin.getTime() - fechaInicio.getTime()) / 60000)
  const tiempoEfectivo = Math.max(0, totalMinutos - pausas - improductivo)

  ot.horas.push({
    tecnico: usuarioActor.id_usuario,
    inicio: fechaInicio,
    fin: fechaFin,
    pausas_minutos: pausas,
    tiempo_improductivo_minutos: improductivo,
    motivo_improductivo: motivo_improductivo?.trim(),
    es_extra: Boolean(es_extra),
    tiempo_efectivo_minutos: tiempoEfectivo,
  })
  await ot.save()

  await auditar(usuarioActor, 'registrar_horas', ot, `Técnico registró ${tiempoEfectivo} min efectivos`, { antes: null, despues: { tiempo_efectivo_minutos: tiempoEfectivo } })

  return ot
}

// ── Evidencias ───────────────────────────────────────────────────────────

export async function agregarEvidencia(id, { tipo, momento, comentario }, archivo, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (!ESTADOS_ACTIVOS.includes(ot.estado)) {
    throw new ErrorConflicto(`No se pueden adjuntar evidencias a una orden en estado "${ot.estado}"`)
  }
  requiereSerParticipante(ot, usuarioActor)
  if (!archivo) throw new ErrorValidacion('El archivo es obligatorio')
  if (!TIPOS_EVIDENCIA.includes(tipo)) throw new ErrorValidacion(`tipo debe ser uno de: ${TIPOS_EVIDENCIA.join(', ')}`)
  const momentoFinal = MOMENTOS_EVIDENCIA.includes(momento) ? momento : 'general'

  ot.evidencias.push({
    tipo,
    momento: momentoFinal,
    archivo: archivo.filename,
    comentario: comentario?.trim(),
    subidoPor: usuarioActor.id_usuario,
  })
  await ot.save()

  await auditar(usuarioActor, 'adjuntar_evidencia', ot, `Evidencia adjuntada (${tipo}, ${momentoFinal})`, { antes: null, despues: null })

  return ot
}

// ── Solicitar repuestos (sub-flujo con ciclo de vida propio) ───────────────

export async function solicitarRepuestos(id, { items, justificacion, urgencia }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  requiereEnProgreso(ot)
  requiereSerTecnicoAsignado(ot, usuarioActor)
  const itemsValidos = (items || []).filter((it) => it?.nombre?.trim() && Number(it.cantidad) > 0)
  if (itemsValidos.length === 0) throw new ErrorValidacion('Debes indicar al menos un ítem con nombre y cantidad')

  ot.solicitudesRepuestos.push({
    items: itemsValidos.map((it) => ({ nombre: it.nombre.trim(), cantidad: Number(it.cantidad) })),
    justificacion: justificacion?.trim(),
    urgencia: ['baja', 'media', 'alta'].includes(urgencia) ? urgencia : 'media',
    solicitadoPor: usuarioActor.id_usuario,
    estado: 'solicitado',
  })
  ot.estado = 'en_espera'
  ot.motivo_espera = 'repuestos'
  await ot.save()

  await auditar(usuarioActor, 'solicitar_repuestos', ot, 'Técnico solicitó repuestos', {
    antes: { estado: 'en_progreso' },
    despues: { estado: 'en_espera', motivo_espera: 'repuestos' },
  })

  const aprobadores = await usuariosConPermiso('mantenimiento:aprobar_repuestos')
  await notificarUsuarios(aprobadores, {
    titulo: 'Solicitud de repuestos',
    cuerpo: itemsValidos.map((it) => `${it.nombre} x${it.cantidad}`).join(', '),
  })

  return ot
}

function obtenerSolicitud(ot, solicitudId) {
  const solicitud = ot.solicitudesRepuestos.id(solicitudId)
  if (!solicitud) throw new ErrorNoEncontrado('Solicitud de repuestos no encontrada')
  return solicitud
}

export async function aprobarRepuestos(id, solicitudId, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  const solicitud = obtenerSolicitud(ot, solicitudId)
  if (solicitud.estado !== 'solicitado') throw new ErrorConflicto(`No se puede aprobar una solicitud en estado "${solicitud.estado}"`)

  solicitud.estado = 'en_alistamiento'
  solicitud.resueltoPor = usuarioActor.id_usuario
  await ot.save()

  await auditar(usuarioActor, 'aprobar_repuestos', ot, 'Solicitud de repuestos aprobada', { antes: null, despues: { estado: solicitud.estado } })
  if (ot.tecnico_asignado) {
    await notificarUsuarios([idDe(ot.tecnico_asignado)], { titulo: 'Repuestos aprobados', cuerpo: 'Tu solicitud de repuestos fue aprobada.' })
  }
  return ot
}

export async function rechazarRepuestos(id, solicitudId, { motivo }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  const solicitud = obtenerSolicitud(ot, solicitudId)
  if (solicitud.estado !== 'solicitado') throw new ErrorConflicto(`No se puede rechazar una solicitud en estado "${solicitud.estado}"`)
  if (!motivo?.trim()) throw new ErrorValidacion('El motivo de rechazo es obligatorio')

  solicitud.estado = 'rechazado'
  solicitud.resueltoPor = usuarioActor.id_usuario
  solicitud.motivoRechazo = motivo.trim()
  // La OT vuelve a manos del técnico: sin el repuesto no puede seguir en espera indefinida.
  if (ot.estado === 'en_espera' && ot.motivo_espera === 'repuestos') {
    ot.estado = 'en_progreso'
    ot.motivo_espera = null
  }
  await ot.save()

  await auditar(usuarioActor, 'rechazar_repuestos', ot, `Solicitud de repuestos rechazada: ${motivo.trim()}`, { antes: null, despues: { estado: solicitud.estado } })
  if (ot.tecnico_asignado) {
    await notificarUsuarios([idDe(ot.tecnico_asignado)], { titulo: 'Repuestos rechazados', cuerpo: motivo.trim() })
  }
  return ot
}

export async function entregarRepuestos(id, solicitudId, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  const solicitud = obtenerSolicitud(ot, solicitudId)
  if (solicitud.estado !== 'en_alistamiento') throw new ErrorConflicto(`No se puede entregar una solicitud en estado "${solicitud.estado}"`)

  solicitud.estado = 'entregado'
  solicitud.entregadoEn = new Date()
  await ot.save()

  await auditar(usuarioActor, 'entregar_repuestos', ot, 'Repuestos entregados', { antes: null, despues: { estado: solicitud.estado } })
  if (ot.tecnico_asignado) {
    await notificarUsuarios([idDe(ot.tecnico_asignado)], { titulo: 'Repuestos entregados', cuerpo: 'Ya puedes recogerlos / continuar la reparación.' })
  }
  return ot
}

export async function instalarRepuestos(id, solicitudId, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  requiereSerTecnicoAsignado(ot, usuarioActor)
  const solicitud = obtenerSolicitud(ot, solicitudId)
  if (solicitud.estado !== 'entregado') throw new ErrorConflicto(`No se puede instalar una solicitud en estado "${solicitud.estado}"`)

  solicitud.estado = 'instalado'
  solicitud.instaladoEn = new Date()
  for (const item of solicitud.items) {
    ot.materiales.push({
      material: item.nombre,
      cantidad: item.cantidad,
      costo_unitario: 0,
      observaciones: 'Instalado desde solicitud de repuestos',
      registradoPor: usuarioActor.id_usuario,
    })
  }
  // Reanuda automáticamente (transición 9 de la Fase 1): el motivo de espera ya se resolvió.
  if (ot.estado === 'en_espera' && ot.motivo_espera === 'repuestos') {
    ot.estado = 'en_progreso'
    ot.motivo_espera = null
  }
  await ot.save()

  await auditar(usuarioActor, 'instalar_repuestos', ot, 'Técnico confirmó instalación de repuestos', {
    antes: { estado: 'en_espera' },
    despues: { estado: ot.estado },
  })

  return ot
}

// ── Solicitar apoyo de otro técnico ─────────────────────────────────────────

export async function invitarApoyo(id, { tecnicoId, motivo }, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (!ESTADOS_ACTIVOS.includes(ot.estado)) throw new ErrorConflicto(`No se puede invitar apoyo en una orden en estado "${ot.estado}"`)
  requiereSerTecnicoAsignado(ot, usuarioActor)
  if (String(tecnicoId) === String(usuarioActor.id_usuario)) throw new ErrorValidacion('No puedes invitarte a ti mismo')

  const tecnicoIdValido = await validarTecnico(tecnicoId)
  const yaInvitado = ot.invitacionesApoyo.some((inv) => String(idDe(inv.tecnico)) === String(tecnicoIdValido) && inv.estado === 'pendiente')
  if (yaInvitado) throw new ErrorConflicto('Ese técnico ya tiene una invitación pendiente en esta orden')

  ot.invitacionesApoyo.push({ tecnico: tecnicoIdValido, motivo: motivo?.trim(), invitadoPor: usuarioActor.id_usuario })
  await ot.save()

  await auditar(usuarioActor, 'invitar_apoyo', ot, 'Técnico solicitó apoyo de un compañero', { antes: null, despues: null })
  await notificarUsuarios([tecnicoIdValido], { titulo: 'Invitación de apoyo', cuerpo: motivo?.trim() || 'Te invitaron a apoyar una orden de trabajo.' })

  return ot
}

function obtenerInvitacion(ot, invitacionId) {
  const invitacion = ot.invitacionesApoyo.id(invitacionId)
  if (!invitacion) throw new ErrorNoEncontrado('Invitación no encontrada')
  return invitacion
}

export async function aceptarApoyo(id, invitacionId, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  const invitacion = obtenerInvitacion(ot, invitacionId)
  if (String(idDe(invitacion.tecnico)) !== String(usuarioActor.id_usuario)) {
    throw new ErrorConflicto('Solo el técnico invitado puede responder esta invitación')
  }
  if (invitacion.estado !== 'pendiente') throw new ErrorConflicto('Esta invitación ya fue respondida')

  invitacion.estado = 'aceptada'
  invitacion.respondidoEn = new Date()
  if (!ot.tecnicos_apoyo.some((t) => String(idDe(t)) === String(usuarioActor.id_usuario))) {
    ot.tecnicos_apoyo.push(usuarioActor.id_usuario)
  }
  await ot.save()

  await auditar(usuarioActor, 'aceptar_apoyo', ot, `${usuarioActor.nombre_usuario} aceptó apoyar la orden`, { antes: null, despues: null })
  if (ot.tecnico_asignado) {
    await notificarUsuarios([idDe(ot.tecnico_asignado)], { titulo: 'Apoyo aceptado', cuerpo: `${usuarioActor.nombre_usuario} aceptó apoyar la orden.` })
  }

  return ot
}

export async function rechazarApoyo(id, invitacionId, usuarioActor) {
  const ot = await obtenerOT(id)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  const invitacion = obtenerInvitacion(ot, invitacionId)
  if (String(idDe(invitacion.tecnico)) !== String(usuarioActor.id_usuario)) {
    throw new ErrorConflicto('Solo el técnico invitado puede responder esta invitación')
  }
  if (invitacion.estado !== 'pendiente') throw new ErrorConflicto('Esta invitación ya fue respondida')

  invitacion.estado = 'rechazada'
  invitacion.respondidoEn = new Date()
  await ot.save()

  await auditar(usuarioActor, 'rechazar_apoyo', ot, `${usuarioActor.nombre_usuario} rechazó apoyar la orden`, { antes: null, despues: null })
  if (ot.tecnico_asignado) {
    await notificarUsuarios([idDe(ot.tecnico_asignado)], { titulo: 'Apoyo rechazado', cuerpo: `${usuarioActor.nombre_usuario} no puede apoyar la orden.` })
  }

  return ot
}
