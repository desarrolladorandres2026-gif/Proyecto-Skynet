import { esUrlPublica } from '../utils/urlPublica.js'

// Nombre de la base de producción, el mismo que documenta
// .env.production.example. .env.development.example pide "Skynet_dev" en
// desarrollo precisamente para no coincidir con este.
const BD_PRODUCCION = 'Skynet'

// Los workers (cola de correo/push, purga de auditoría, publicación de
// cuestionarios, transiciones de mantenimiento, lotes del copiloto) trabajan
// sobre TODA la base, no sobre la petición de alguien: cualquier proceso que
// los corra contra la base de producción compite con el VPS por el mismo
// trabajo, y la cola de notificaciones ni siquiera tiene claim atómico (ver
// notificaciones.service.js#procesarPendientes). Así, un backend local con
// MONGO_URI apuntando a "Skynet" enviaba notificaciones reales desde el SMTP
// de SU .env — la cuenta personal de Gmail de desarrollo —, con el nombre de
// la institución delante de una dirección @gmail.com y sin enlaces
// (FRONTEND_URL=localhost): el patrón exacto que Gmail y Outlook mandan a
// spam. Pasó el 2026-09-10 con el aviso de fin de mantenimiento, enviado a
// todos los usuarios.
//
// Se exigen las TRES señales de "máquina de desarrollo" a la vez, a
// propósito: el error caro es el contrario — apagar los workers del VPS por
// una variable mal puesta deja a todo el Terminal sin notificaciones —, así
// que basta con que UNA diga "servidor real" para que corran.
//
// Devuelve el motivo (para el log de arranque) o null si pueden correr.
export function motivoParaNoCorrerWorkers({ nodeEnv, nombreBd, frontendUrl }) {
  if (nodeEnv === 'production') return null
  if (nombreBd !== BD_PRODUCCION) return null
  if (esUrlPublica(frontendUrl)) return null
  return (
    `Workers en segundo plano DESACTIVADOS: este backend de desarrollo está conectado a la base de ` +
    `producción ("${BD_PRODUCCION}"). Si corrieran, enviarían notificaciones reales desde el SMTP de este ` +
    `.env y competirían con el servidor por la misma cola. Para probarlos en local, apunta MONGO_URI a ` +
    `"${BD_PRODUCCION}_dev" (ver .env.development.example).`
  )
}
