import Ausencia, { TIPOS_AUSENCIA, MOTIVOS_PERMISO_REMUNERADO } from '../../models/Ausencia.js'
import Usuario from '../../models/Usuario.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { usuariosConPermiso } from '../mantenimiento/comun.js'
import { notificarUsuarios as _notificarUsuarios } from '../../utils/sendPush.js'

const POPULATE_AUSENCIA = [
  { path: 'solicitante', select: 'nombre nombre_usuario email cargo dependencia' },
  { path: 'decision.revisadoPor', select: 'nombre nombre_usuario' },
]

const notificarUsuarios = (userIds, payload) => _notificarUsuarios(userIds, payload, 'ausencias')

function auditar(usuarioActor, accion, doc, descripcion, cambios) {
  return registrarAuditoria({
    usuario: usuarioActor,
    accion,
    modulo: 'ausencias',
    entidad: 'Ausencia',
    entidadId: doc._id,
    descripcion,
    cambios,
  })
}

// Normaliza a medianoche local: el usuario elige un DÍA en el formulario, no
// un instante. Sin esto, dos solicitudes del mismo día podrían no detectarse
// como solapadas por diferencia de horas.
function aDia(valor) {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return null
  fecha.setHours(0, 0, 0, 0)
  return fecha
}

// Cuenta días de lunes a viernes, ambos extremos incluidos.
//
// LIMITACIÓN CONOCIDA: no descuenta festivos colombianos. Hacerlo bien exige
// un calendario de festivos (Ley 51 de 1983, con traslado al lunes siguiente)
// que hoy no existe en el sistema. Mientras tanto el conteo puede sobrestimar
// los días consumidos en semanas con festivo, y quien apruebe debe ajustarlo
// a mano. Se documenta aquí en vez de fingir exactitud.
export function contarDiasHabiles(inicio, fin) {
  let dias = 0
  const cursor = new Date(inicio)
  while (cursor <= fin) {
    const dia = cursor.getDay()
    if (dia !== 0 && dia !== 6) dias += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return dias
}

// Dos ausencias de la misma persona no pueden traslaparse, sin importar el
// tipo: nadie puede estar de vacaciones e incapacitado el mismo día. Solo
// bloquean las vivas (pendiente/aprobada) — una rechazada o cancelada libera
// sus fechas.
async function haySolapamiento(usuarioId, inicio, fin, excluirId = null) {
  const filtro = {
    solicitante: usuarioId,
    estado: { $in: ['pendiente', 'aprobada'] },
    fechaInicio: { $lte: fin },
    fechaFin: { $gte: inicio },
  }
  if (excluirId) filtro._id = { $ne: excluirId }
  return Ausencia.exists(filtro)
}

export async function crearAusencia(datos, usuarioActor) {
  const { tipo, fechaInicio, fechaFin, motivo, motivoLicencia, soporte } = datos || {}

  if (!TIPOS_AUSENCIA.includes(tipo)) {
    throw new ErrorValidacion(`tipo debe ser uno de: ${TIPOS_AUSENCIA.join(', ')}`)
  }
  // El motivo legal solo tiene sentido (y solo se exige) para el remunerado:
  // es lo que le da a Talento Humano el respaldo del art. 57 CST para pagarlo.
  if (tipo === 'permiso_remunerado' && !MOTIVOS_PERMISO_REMUNERADO.includes(motivoLicencia)) {
    throw new ErrorValidacion(`Un permiso remunerado exige motivoLicencia, uno de: ${MOTIVOS_PERMISO_REMUNERADO.join(', ')}`)
  }

  const inicio = aDia(fechaInicio)
  const fin = aDia(fechaFin)
  if (!inicio || !fin) {
    throw new ErrorValidacion('Las fechas de inicio y fin son obligatorias y deben ser válidas')
  }
  if (fin < inicio) {
    throw new ErrorValidacion('La fecha de fin no puede ser anterior a la de inicio')
  }

  const hoy = aDia(new Date())
  // La incapacidad se reporta DESPUÉS de ocurrida (uno no programa enfermarse);
  // vacaciones y permisos se piden por anticipado.
  if (tipo !== 'incapacidad' && inicio < hoy) {
    throw new ErrorValidacion('No se pueden solicitar vacaciones ni permisos sobre fechas ya pasadas')
  }
  if (tipo === 'incapacidad' && !soporte?.url?.trim()) {
    throw new ErrorValidacion('Una incapacidad requiere adjuntar el soporte médico')
  }
  // Segunda barrera además de que el controller nunca copie `soporte` del
  // body sin pasar por Cloudinary: si algo cambia ahí, esto sigue impidiendo
  // guardar una URL arbitraria (p. ej. javascript:) que luego se renderiza
  // como enlace clicable en la bandeja de quien aprueba.
  if (soporte?.url && !/^https:\/\/res\.cloudinary\.com\//.test(soporte.url)) {
    throw new ErrorValidacion('El soporte debe ser un archivo subido, no una URL externa')
  }

  const diasHabiles = contarDiasHabiles(inicio, fin)
  if (diasHabiles < 1) {
    throw new ErrorValidacion('El rango solicitado no incluye ningún día hábil')
  }

  if (await haySolapamiento(usuarioActor.id_usuario, inicio, fin)) {
    throw new ErrorConflicto('Ya tienes una ausencia registrada que se cruza con esas fechas')
  }

  const solicitante = await Usuario.findById(usuarioActor.id_usuario).select('nombre cargo dependencia')

  const doc = await Ausencia.create({
    solicitante: usuarioActor.id_usuario,
    tipo,
    // Solo se guarda cuando aplica: dejarlo undefined en los demás tipos
    // evita disparar el enum de Mongoose sobre documentos que no lo usan.
    motivoLicencia: tipo === 'permiso_remunerado' ? motivoLicencia : undefined,
    fechaInicio: inicio,
    fechaFin: fin,
    diasHabiles,
    motivo: motivo ? String(motivo).trim() : '',
    soporte: soporte?.url ? soporte : undefined,
    cargoSolicitante: solicitante?.cargo || '',
    dependenciaSolicitante: solicitante?.dependencia || '',
    estado: 'pendiente',
  })

  await auditar(usuarioActor, 'crear', doc, `Solicitó ${tipo} por ${diasHabiles} día(s) hábil(es)`)

  const aprobadores = await usuariosConPermiso('ausencias:aprobar')
  notificarUsuarios(aprobadores, {
    title: 'Nueva solicitud de ausencia',
    body: `${solicitante?.nombre || usuarioActor.nombre_usuario} solicitó ${tipo} (${diasHabiles} día(s) hábil(es))`,
    url: `/ausencias/bandeja`,
  }).catch((err) => console.error('Error notificando nueva ausencia:', err.message))

  return obtener(doc._id)
}

function obtener(id) {
  return Ausencia.findById(id).populate(POPULATE_AUSENCIA)
}

async function obtenerParaMutar(id) {
  const doc = await Ausencia.findById(id)
  if (!doc) throw new ErrorNoEncontrado('Ausencia no encontrada')
  return doc
}

async function registrarDecision(doc, usuarioActor) {
  const revisor = await Usuario.findById(usuarioActor.id_usuario).select('nombre cargo')
  doc.decision.revisadoPor = usuarioActor.id_usuario
  doc.decision.nombreRevisor = revisor?.nombre || usuarioActor.nombre_usuario
  doc.decision.cargoRevisor = revisor?.cargo || ''
  doc.decision.fecha = new Date()
}

export async function aprobarAusencia(id, { observacion } = {}, usuarioActor) {
  const doc = await obtenerParaMutar(id)
  if (doc.estado !== 'pendiente') {
    throw new ErrorConflicto(`No se puede aprobar una ausencia en estado "${doc.estado}"`)
  }
  // Nadie aprueba su propia ausencia, ni siquiera el Super Administrador:
  // es la regla de control interno que da sentido a todo el flujo.
  if (String(doc.solicitante) === String(usuarioActor.id_usuario)) {
    throw new ErrorConflicto('No puedes aprobar tu propia solicitud de ausencia')
  }

  // Se revalida el solapamiento en el momento de aprobar, no solo al crear:
  // entre la solicitud y la decisión pudo aprobarse otra que ya ocupa esas
  // fechas (dos solicitudes cruzadas pueden coexistir como "pendiente").
  if (await haySolapamiento(doc.solicitante, doc.fechaInicio, doc.fechaFin, doc._id)) {
    throw new ErrorConflicto('Esta persona ya tiene otra ausencia aprobada que se cruza con esas fechas')
  }

  doc.estado = 'aprobada'
  doc.decision.motivoRechazo = ''
  if (observacion !== undefined) doc.decision.observacion = String(observacion).trim()
  await registrarDecision(doc, usuarioActor)

  await doc.save()
  await auditar(usuarioActor, 'aprobar', doc, `Aprobó ${doc.tipo} de ${doc.diasHabiles} día(s) hábil(es)`)

  notificarUsuarios([doc.solicitante], {
    title: 'Tu solicitud de ausencia fue aprobada',
    body: doc.decision.observacion || `${doc.tipo} aprobada por ${doc.decision.nombreRevisor}`,
    url: `/ausencias/mias`,
  }).catch((err) => console.error('Error notificando aprobación de ausencia:', err.message))

  return obtener(doc._id)
}

export async function rechazarAusencia(id, { motivoRechazo } = {}, usuarioActor) {
  const doc = await obtenerParaMutar(id)
  if (doc.estado !== 'pendiente') {
    throw new ErrorConflicto(`No se puede rechazar una ausencia en estado "${doc.estado}"`)
  }
  if (!motivoRechazo?.trim()) {
    throw new ErrorValidacion('El motivo de rechazo es obligatorio')
  }

  doc.estado = 'rechazada'
  doc.decision.motivoRechazo = motivoRechazo.trim()
  await registrarDecision(doc, usuarioActor)

  await doc.save()
  await auditar(usuarioActor, 'rechazar', doc, `Rechazó ${doc.tipo}`, { motivoRechazo: doc.decision.motivoRechazo })

  notificarUsuarios([doc.solicitante], {
    title: 'Tu solicitud de ausencia fue rechazada',
    body: doc.decision.motivoRechazo,
    url: `/ausencias/mias`,
  }).catch((err) => console.error('Error notificando rechazo de ausencia:', err.message))

  return obtener(doc._id)
}

// Cancelar la pide el dueño, no quien aprueba: es retirar la solicitud, no
// negarla. Solo mientras siga pendiente — una ausencia ya aprobada la debe
// revertir quien la aprobó, con su propio rastro.
export async function cancelarAusencia(id, usuarioActor) {
  const doc = await obtenerParaMutar(id)
  if (String(doc.solicitante) !== String(usuarioActor.id_usuario)) {
    throw new ErrorConflicto('Solo quien solicitó la ausencia puede cancelarla')
  }
  if (doc.estado !== 'pendiente') {
    throw new ErrorConflicto(`Solo se puede cancelar una ausencia pendiente (esta está "${doc.estado}")`)
  }

  doc.estado = 'cancelada'
  doc.canceladaEn = new Date()
  await doc.save()
  await auditar(usuarioActor, 'cancelar', doc, 'Canceló su solicitud de ausencia')

  return obtener(doc._id)
}

export function puedeVer(doc, usuarioActor) {
  if (usuarioActor.esSuperAdmin) return true
  if (usuarioActor.permisos?.has('ausencias:ver_todas')) return true
  if (usuarioActor.permisos?.has('ausencias:aprobar')) return true
  const solicitanteId = doc.solicitante?._id || doc.solicitante
  return String(solicitanteId) === String(usuarioActor.id_usuario)
}

export async function obtenerDetalle(id, usuarioActor) {
  const doc = await obtener(id)
  if (!doc) throw new ErrorNoEncontrado('Ausencia no encontrada')
  if (!puedeVer(doc, usuarioActor)) {
    throw new ErrorConflicto('No tienes acceso a esta solicitud de ausencia')
  }
  return doc
}

export function listarMias(usuarioActor) {
  return Ausencia.find({ solicitante: usuarioActor.id_usuario })
    .populate('decision.revisadoPor', 'nombre nombre_usuario')
    .sort({ fechaInicio: -1 })
}

export function listarBandeja() {
  return Ausencia.find({ estado: 'pendiente' })
    .populate('solicitante', 'nombre nombre_usuario cargo dependencia')
    .sort({ fechaInicio: 1 })
}

export function listarTodas({ estado, tipo } = {}) {
  const filtro = {}
  if (estado) filtro.estado = estado
  if (tipo) filtro.tipo = tipo
  return Ausencia.find(filtro).populate(POPULATE_AUSENCIA).sort({ fechaInicio: -1 })
}

// Quién está (o estará) fuera en un rango. Solo aprobadas: el calendario
// muestra ausencias en firme, no intenciones pendientes de decidir.
export function calendario({ desde, hasta } = {}) {
  const inicio = aDia(desde) || aDia(new Date())
  const fin = aDia(hasta) || new Date(inicio.getFullYear(), inicio.getMonth() + 3, 0)
  return Ausencia.find({
    estado: 'aprobada',
    fechaInicio: { $lte: fin },
    fechaFin: { $gte: inicio },
  })
    .populate('solicitante', 'nombre nombre_usuario cargo dependencia')
    .sort({ fechaInicio: 1 })
}
