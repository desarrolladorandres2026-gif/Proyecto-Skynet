import Usuario from '../../models/Usuario.js'
import { notificar } from '../notificaciones/notificaciones.service.js'

// Todo el sistema de avisos de plataforma se apoya en el NotificationService
// existente (cola en EnvioNotificacion + worker que despacha push/email +
// registro interno para la campana). No hay ni un canal nuevo aquí: este
// archivo solo decide AUDIENCIA, TEXTO y si el aviso es interrumpible.

// Audiencia = todo el personal activo. A propósito NO se filtra por
// `esPrueba`: igual que en la resolución de destinatarios de daños y
// requerimientos (ver el comentario en models/Usuario.js), varias cuentas
// marcadas como prueba son las que usa gente real del Terminal a diario, y
// dejarlas fuera de "la plataforma se cae en 15 minutos" es exactamente el
// tipo de silencio que este módulo existe para evitar.
async function audiencia() {
  const usuarios = await Usuario.find({ estado: 'activo' }).select('_id')
  return usuarios.map((u) => u._id)
}

function formatearFechaHora(fecha) {
  if (!fecha) return ''
  // Zona del Terminal explícita: el proceso Node puede correr en UTC (es lo
  // normal en el VPS) y sin esto el aviso diría una hora que no coincide con
  // ningún reloj que la persona esté mirando.
  return new Date(fecha).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'long',
    timeStyle: 'short',
  })
}

// `transaccional` gobierna si el aviso respeta las preferencias del usuario.
// El criterio: los avisos PLANIFICABLES (se programó / falta poco) son
// informativos y se pueden silenciar desde Preferencias; los avisos de
// DISPONIBILIDAD REAL (se cayó / ya volvió) no, porque no son "una novedad
// del módulo X" sino el estado de la herramienta con la que la persona
// trabaja — el mismo criterio con el que las alertas de seguridad ignoran
// preferencias en notificaciones.service.js.

export async function avisarProgramado(estado) {
  const usuarios = await audiencia()
  const fin = estado.scheduledEnd ? ` a ${formatearFechaHora(estado.scheduledEnd)}` : ''
  return notificar({
    usuarios,
    categoria: 'plataforma',
    tipo: 'plataforma_programado',
    titulo: 'Mantenimiento programado de Skynet',
    cuerpo:
      estado.message ||
      `Skynet realizará mantenimiento programado el ${formatearFechaHora(estado.scheduledStart)}${fin}.` +
        (estado.reason ? ` Motivo: ${estado.reason}.` : ''),
    url: '/',
  })
}

export async function avisarInicioProximo(estado, minutos) {
  const usuarios = await audiencia()
  return notificar({
    usuarios,
    categoria: 'plataforma',
    tipo: 'plataforma_inicio_proximo',
    titulo: `Skynet entra en mantenimiento en ${minutos} minutos`,
    cuerpo:
      `El mantenimiento comienza a las ${formatearFechaHora(estado.scheduledStart)}. ` +
      'Guarda tu trabajo: la plataforma dejará de estar disponible durante la ventana.',
    url: '/',
  })
}

export async function avisarInicio(estado) {
  const usuarios = await audiencia()
  const fin = estado.scheduledEnd
    ? `Hora estimada de finalización: ${formatearFechaHora(estado.scheduledEnd)}.`
    : 'Te avisaremos en cuanto vuelva a estar disponible.'
  return notificar({
    usuarios,
    categoria: 'plataforma',
    tipo: 'plataforma_iniciado',
    titulo: 'Skynet está en mantenimiento',
    cuerpo: `${estado.message || 'La plataforma no está disponible temporalmente.'} ${fin}`,
    url: '/',
    transaccional: true,
  })
}

// La notificación que cierra el ciclo. Su unicidad NO se garantiza aquí sino
// en el CAS que la precede (ver finalizar()/evaluarTransiciones() en
// plataforma.service.js): este archivo se limita a mandar lo que le pidan.
export async function avisarDisponible() {
  const usuarios = await audiencia()
  return notificar({
    usuarios,
    categoria: 'plataforma',
    tipo: 'plataforma_disponible',
    titulo: 'Skynet ya está disponible',
    cuerpo:
      'El mantenimiento de Skynet ha finalizado correctamente. ' +
      'La plataforma ya se encuentra disponible y puedes volver a ingresar.',
    url: '/',
    transaccional: true,
  })
}
