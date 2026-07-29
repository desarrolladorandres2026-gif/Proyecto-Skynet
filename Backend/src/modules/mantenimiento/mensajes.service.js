import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { notificarUsuarios } from '../../utils/sendPush.js'
import { ESTADOS_ACTIVOS, obtenerOT, esParticipante, idDe } from './comun.js'

// Comunicación Interna (Fase 3.1): dos canales separados a nivel de dato —
// 'interno' (técnico(s)/supervisor) y 'solicitante' (además el reportante
// original). La separación se valida aquí, nunca solo en la interfaz.

function puedeVerCanal(ot, usuarioActor, canal) {
  const tieneAccesoOT = usuarioActor.esSuperAdmin || usuarioActor.permisos?.has('mantenimiento:ver_todas') || esParticipante(ot, usuarioActor)
  if (canal === 'interno') return tieneAccesoOT
  // 'solicitante': lo anterior, o ser quien reportó el problema.
  return tieneAccesoOT || String(idDe(ot.reportadoPor)) === String(usuarioActor.id_usuario)
}

export async function enviarMensaje(otId, { canal, texto, respuestaA }, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (!ESTADOS_ACTIVOS.includes(ot.estado)) throw new ErrorConflicto(`No se pueden enviar mensajes en una orden en estado "${ot.estado}"`)
  if (!['interno', 'solicitante'].includes(canal)) throw new ErrorValidacion('canal debe ser "interno" o "solicitante"')
  if (!texto?.trim()) throw new ErrorValidacion('El mensaje no puede estar vacío')
  if (!puedeVerCanal(ot, usuarioActor, canal)) throw new ErrorConflicto('No tienes acceso a este canal')

  ot.mensajes.push({
    canal,
    texto: texto.trim(),
    autor: usuarioActor.id_usuario,
    autorNombre: usuarioActor.nombre_usuario,
    respuestaA: respuestaA || undefined,
  })
  await ot.save()

  const destinatarios = new Set()
  if (canal === 'interno') {
    if (ot.tecnico_asignado) destinatarios.add(String(idDe(ot.tecnico_asignado)))
    for (const t of ot.tecnicos_apoyo || []) destinatarios.add(String(idDe(t)))
  } else if (ot.reportadoPor) {
    destinatarios.add(String(idDe(ot.reportadoPor)))
    if (ot.tecnico_asignado) destinatarios.add(String(idDe(ot.tecnico_asignado)))
  }
  destinatarios.delete(String(usuarioActor.id_usuario))
  if (destinatarios.size) {
    await notificarUsuarios([...destinatarios], { titulo: `Nuevo mensaje de ${usuarioActor.nombre_usuario}`, cuerpo: texto.trim().slice(0, 120) })
  }

  return ot
}

export async function listarMensajes(otId, canal, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (!['interno', 'solicitante'].includes(canal)) throw new ErrorValidacion('canal debe ser "interno" o "solicitante"')
  if (!puedeVerCanal(ot, usuarioActor, canal)) throw new ErrorConflicto('No tienes acceso a este canal')

  return ot.mensajes.filter((m) => m.canal === canal)
}
