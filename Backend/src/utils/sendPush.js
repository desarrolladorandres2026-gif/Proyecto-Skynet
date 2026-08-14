import { notificar } from '../modules/notificaciones/notificaciones.service.js'
import { avisarIA } from '../modules/ia/ia.service.js'

// Compatibilidad hacia atrás: firma histórica usada por varios módulos
// (mantenimiento, daños) desde antes de que existiera el motor
// centralizado en modules/notificaciones/notificaciones.service.js. Por
// dentro ahora encola en EnvioNotificacion (con reintento, registro y
// limpieza automática de suscripciones vencidas) en vez de llamar a webpush
// directo — ningún call-site existente necesita cambiar.
//
// Los call-sites usan dos formas de payload (legado: {titulo, cuerpo};
// alternativa: {title, body, url, tag}); se normalizan aquí para que el
// Service Worker (frontend/src/sw.js) pueda asumir siempre la misma forma.
//
// `categoria` es nueva y opcional: sin ella, el envío es solo-push (el
// comportamiento EXACTO de antes — nunca manda correo). Pasarla activa el
// comportamiento completo del sistema de notificaciones: el evento respeta
// la preferencia de canal (push/email) y de categoría del usuario. Los
// wrappers en cada módulo (ver p. ej. modules/danos/danos.service.js) la
// fijan una sola vez por archivo.
// Cada llamador de esta función ya completó la operación de negocio real
// (guardó el reporte, la asignación, el hallazgo...) ANTES de notificar — ver
// p. ej. danos.service.js:aplicarAsignacionAutomatica, que hace `await
// reporte.save()` y solo después llama aquí. Notificar es un efecto
// secundario del éxito, no parte de él: que Mongo tenga un blip al escribir
// EnvioNotificacion, o que llegue una categoría mal formada, no debe
// convertir una escritura que YA se guardó en un 500 para quien la pidió —
// esa persona vería "error" en pantalla sobre algo que en realidad sí quedó
// hecho, y podría reintentar y duplicar la operación real pensando que la
// primera vez falló. avisarIA() ya se protege así por su cuenta (ver
// ia.service.js); notificar() no lo hacía. Ver BUG-011 en la auditoría
// 2026-08-13.
export async function notificarUsuarios(userIds, payload, categoria = null) {
  const idsUnicos = [...new Set((userIds || []).map(String))].filter(Boolean)
  if (!idsUnicos.length) return

  try {
    await notificar({
      usuarios: idsUnicos,
      categoria: categoria || 'sistema',
      tipo: payload.tag || categoria || 'sistema',
      titulo: payload.title || payload.titulo,
      cuerpo: payload.body || payload.cuerpo,
      url: payload.url,
      incluirEmail: Boolean(categoria),
      incluirPush: true,
      // Sin categoría (llamador legado): no hay preferencia que consultar
      // (categoria:'sistema' no está en el catálogo), así que se trata como
      // transaccional para saltarse esa validación — preserva el
      // comportamiento EXACTO de antes de este cambio (push incondicional).
      transaccional: !categoria,
    })
  } catch (err) {
    console.error('No se pudo notificar a los usuarios:', err.message)
  }

  // Mismo evento, canal aparte: si `categoria` es una de verdad (no el
  // legado sin categoría), además se encola como aviso proactivo para el
  // chat del copiloto.
  if (categoria) {
    await avisarIA({
      usuarios: idsUnicos,
      categoria,
      titulo: payload.title || payload.titulo,
      cuerpo: payload.body || payload.cuerpo,
      url: payload.url,
    })
  }
}
