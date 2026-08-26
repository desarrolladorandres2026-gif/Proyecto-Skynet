import Ausencia, { TIPOS_AUSENCIA, MOTIVOS_PERMISO_REMUNERADO } from '../../models/Ausencia.js'
import Usuario from '../../models/Usuario.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { inicioDelDia, contarDias, restarMeses, hoy as hoyEnElTerminal } from '../../utils/fechas.js'
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

// El usuario elige un DÍA en el formulario, no un instante. `inicioDelDia` lo
// ancla a la medianoche del Terminal (ver utils/fechas.js).
//
// Antes esto era un `aDia()` local que hacía `new Date(valor)` (que parsea
// "2026-08-20" como medianoche UTC) seguido de `setHours(0,0,0,0)` (que opera
// en la zona del PROCESO Node). El resultado dependía de la variable TZ del
// servidor: con TZ=America/Bogota, pedir el 20 de agosto guardaba el 19, y
// aun con el servidor en UTC el navegador colombiano pintaba el día anterior.
// Ver tests/fechas.test.js y scripts/verificar-fechas-tz.js.
const aDia = inicioDelDia

// contarDias vive ahora en utils/fechas.js. Se reexporta porque las pruebas y
// el frontend lo importan desde aquí. Cuenta días naturales, ambos extremos
// incluidos: el Terminal opera 24/7 (hay turnos todos los días, incluidos
// sábados, domingos y festivos), así que "día hábil" en el sentido clásico
// lunes-viernes no describe la operación real — un sábado ausente cuesta un
// día de trabajo igual que un martes.
export { contarDias }

// "HH:mm" en 24 horas, con ceros a la izquierda — lo que produce un <input
// type="time">.
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/

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
  const { tipo, fechaInicio, fechaFin, motivo, motivoLicencia, soporte, horaInicio, horaFin } = datos || {}

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
  if (tipo === 'incapacidad' && !soporte?.archivo && !soporte?.url?.trim()) {
    throw new ErrorValidacion('Una incapacidad requiere adjuntar el soporte médico')
  }
  // Segunda barrera además de que el controller nunca copie `soporte` del
  // body sin pasar por la subida de archivos: si algo cambia ahí, esto sigue impidiendo
  // guardar una URL arbitraria (p. ej. javascript:) que luego se renderiza
  // como enlace clicable en la bandeja de quien aprueba.
  if (soporte?.url && !soporte?.archivo && !/^https:\/\/res\.cloudinary\.com\//.test(soporte.url) && !/^\/api\/ausencias\//.test(soporte.url)) {
    throw new ErrorValidacion('El soporte debe ser un archivo subido, no una URL externa')
  }

  // Rango horario: opcional, y solo tiene sentido dentro de un único día —
  // "de 8:00 a 10:00" no significa nada sobre un rango de varios días.
  const horaInicioLimpia = horaInicio ? String(horaInicio).trim() : ''
  const horaFinLimpia = horaFin ? String(horaFin).trim() : ''
  if (horaInicioLimpia || horaFinLimpia) {
    if (inicio.getTime() !== fin.getTime()) {
      throw new ErrorValidacion('El horario solo aplica cuando la ausencia es de un único día')
    }
    if (!horaInicioLimpia || !horaFinLimpia) {
      throw new ErrorValidacion('Si indicas horario, se necesita tanto la hora de inicio como la de fin')
    }
    if (!HORA_RE.test(horaInicioLimpia) || !HORA_RE.test(horaFinLimpia)) {
      throw new ErrorValidacion('El horario debe tener formato HH:mm')
    }
    if (horaFinLimpia <= horaInicioLimpia) {
      throw new ErrorValidacion('La hora de fin debe ser posterior a la hora de inicio')
    }
  }

  const diasHabiles = contarDias(inicio, fin)

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
    horaInicio: horaInicioLimpia,
    horaFin: horaFinLimpia,
    diasHabiles,
    motivo: motivo ? String(motivo).trim() : '',
    soporte: (soporte?.archivo || soporte?.url) ? soporte : undefined,
    cargoSolicitante: solicitante?.cargo || '',
    dependenciaSolicitante: solicitante?.dependencia || '',
    estado: 'pendiente',
  })

  const horarioTexto = horaInicioLimpia ? ` de ${horaInicioLimpia} a ${horaFinLimpia}` : ''
  await auditar(usuarioActor, 'crear', doc, `Solicitó ${tipo} por ${diasHabiles} día(s)${horarioTexto}`)

  const aprobadores = await usuariosConPermiso('ausencias:aprobar')
  notificarUsuarios(aprobadores, {
    title: 'Nueva solicitud de ausencia',
    body: `${solicitante?.nombre || usuarioActor.nombre_usuario} solicitó ${tipo} (${diasHabiles} día(s)${horarioTexto})`,
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
  await auditar(usuarioActor, 'aprobar', doc, `Aprobó ${doc.tipo} de ${doc.diasHabiles} día(s)`)

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
  const inicio = aDia(desde) || hoyEnElTerminal()
  // Por defecto, los 3 meses siguientes. restarMeses con un valor negativo
  // suma, y de paso evita el desbordamiento de setMonth (31 de mayo + 3 meses
  // no debe saltar de mes) — antes esto usaba el constructor local
  // `new Date(año, mes+3, 0)`, que depende de la TZ del proceso igual que el
  // resto de BUG-003.
  const fin = aDia(hasta) || restarMeses(inicio, -3)
  return Ausencia.find({
    estado: 'aprobada',
    fechaInicio: { $lte: fin },
    fechaFin: { $gte: inicio },
  })
    // Proyección deliberada: a diferencia de listarTodas(), a /calendario
    // también entra quien solo tiene 'ausencias:aprobar' (sin 'ver_todas',
    // ver ausencias.routes.js) — nunca debe traer motivo, motivoLicencia ni
    // soporte (el certificado médico de una incapacidad es dato sensible).
    .select('tipo fechaInicio fechaFin horaInicio horaFin diasHabiles cargoSolicitante dependenciaSolicitante estado solicitante')
    .populate('solicitante', 'nombre nombre_usuario cargo dependencia')
    .sort({ fechaInicio: 1 })
}
