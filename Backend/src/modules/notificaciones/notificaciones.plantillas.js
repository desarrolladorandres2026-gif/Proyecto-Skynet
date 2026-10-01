import { env } from '../../config/env.js'
import { esUrlPublica } from '../../utils/urlPublica.js'
import { documentoCorreo, documentoTexto, paginaSimple, parrafo, nota, enlace, esc, sinEmoji } from '../../utils/emailDiseno.js'
import { CATEGORIAS_NOTIFICACION } from './notificaciones.catalogo.js'
import { firmarTokenBaja } from './notificaciones.token.js'

// Correo de TODAS las notificaciones (lo arma notificaciones.service.js#
// enviarEmail). El diseño vive en utils/emailDiseno.js; aquí solo se decide
// qué decir según la categoría del aviso: el nombre del módulo, qué hace el
// botón y por qué le llega el correo a esta persona. Los datos propios de cada
// asunto llegan ya armados en `detalles` desde el módulo que notifica.

const NOMBRE_CATEGORIA = new Map(CATEGORIAS_NOTIFICACION.map((c) => [c.key, c.nombre]))

// Solo aplica cuando el aviso trae la ruta de una pantalla concreta: sin ella
// el botón lleva al inicio, y "Ver el requerimiento" prometería algo que no
// hace.
const ACCION_POR_CATEGORIA = {
  mantenimiento: 'Abrir en Mantenimiento',
  danos: 'Ver el reporte',
  requerimientos: 'Ver el requerimiento',
  ausencias: 'Ver la solicitud',
  sig_pregunta_dia: 'Responder la pregunta',
  plataforma: 'Abrir la plataforma',
}

function nombreCategoria(categoria) {
  return NOMBRE_CATEGORIA.get(categoria) || 'Aviso del sistema'
}

// `url` la fija cada módulo llamador (hoy siempre `/modulo/${ObjectId}`, ver
// requerimientos.service.js), pero notificar() es un servicio genérico —
// nada obliga a que siga siendo así en el futuro. Se valida la forma (ruta
// relativa, sin "//" que reinterprete el host); el escape para el atributo
// href lo hace utils/emailDiseno.js.
function sanitizarUrlRelativa(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return null
  return url
}

// Un enlace a http://localhost:5173 dentro de un correo está ROTO para
// cualquier destinatario: "localhost" resuelve a la máquina de quien abre el
// correo, no a este servidor. Además es de las señales más fuertes que usan
// los filtros antispam (dominio inexistente + http sin TLS + puerto raro +
// token largo en la query), y es la razón por la que los correos de prueba
// desde un entorno local caen en spam por más que el remitente y las
// cabeceras estén bien.
//
// En ese caso el correo se envía igual —el sistema debe poder probarse en
// local— pero sin botón hacia una URL inservible: la ruta se menciona como
// texto. Con FRONTEND_URL/API_PUBLIC_URL apuntando a un dominio público real
// (producción), esto no se activa y el correo lleva sus enlaces normales.
function accionDe({ url, categoria }) {
  const ruta = sanitizarUrlRelativa(url)
  const etiqueta = ruta && ruta !== '/' ? ACCION_POR_CATEGORIA[categoria] || 'Abrir en la plataforma' : 'Abrir la plataforma'
  if (!esUrlPublica(env.FRONTEND_URL)) return { etiqueta, url: null, ruta }
  return { etiqueta, url: `${env.FRONTEND_URL}${ruta || ''}` }
}

function avisoSinEnlace(ruta) {
  return `Ingresa a la plataforma para ver el detalle${ruta && ruta !== '/' ? ` (${ruta})` : ''}.`
}

function enlaceBajaDe(usuarioId) {
  return `${env.API_PUBLIC_URL}/notificaciones/baja?token=${encodeURIComponent(firmarTokenBaja(usuarioId))}`
}

// Por qué le llega este correo a esta persona y cómo dejar de recibirlo: sin
// esa explicación, un aviso automático se confunde con correo masivo.
function motivoRecepcion({ transaccional, categoria, usuarioId }) {
  if (transaccional) {
    return { texto: 'Es un aviso de servicio o de seguridad: te llega aunque hayas desactivado los correos.' }
  }
  const texto = `Recibes este correo porque tienes activos los avisos de ${nombreCategoria(categoria)}.`
  if (!esUrlPublica(env.API_PUBLIC_URL)) {
    return { texto: `${texto} Puedes cambiarlo en Preferencias de notificaciones.` }
  }
  return { texto, baja: { etiqueta: 'Dejar de recibir correos no críticos', url: enlaceBajaDe(usuarioId) } }
}

export function plantillaNotificacion({ titulo, cuerpo, url, usuarioId, transaccional, categoria, fecha, detalles }) {
  const accion = accionDe({ url, categoria })
  const motivo = motivoRecepcion({ transaccional, categoria, usuarioId })
  return documentoCorreo({
    titulo: sinEmoji(titulo),
    preheader: cuerpo,
    categoria: nombreCategoria(categoria),
    fecha,
    cuerpoHtml: parrafo(cuerpo),
    detalles,
    accion: accion.url ? accion : null,
    despuesHtml: accion.url ? null : nota(avisoSinEnlace(accion.ruta)),
    pieHtml: esc(motivo.texto) + (motivo.baja ? `<br>${enlace(motivo.baja.url, motivo.baja.etiqueta)}` : ''),
  })
}

// Un correo que es SOLO HTML (sin parte text/plain) es en sí mismo una señal
// que los filtros antispam pesan en contra — la mayoría de clientes
// legítimos generan ambas partes. Misma información y orden que la versión
// HTML, escrita para leerse como texto de verdad.
export function plantillaNotificacionTexto({ titulo, cuerpo, url, usuarioId, transaccional, categoria, fecha, detalles }) {
  const accion = accionDe({ url, categoria })
  const motivo = motivoRecepcion({ transaccional, categoria, usuarioId })
  return documentoTexto({
    titulo: sinEmoji(titulo),
    categoria: nombreCategoria(categoria),
    fecha,
    parrafos: [cuerpo],
    detalles,
    accion: accion.url ? accion : { etiqueta: avisoSinEnlace(accion.ruta) },
    pie: motivo.baja ? `${motivo.texto}\n${motivo.baja.etiqueta}: ${motivo.baja.url}` : motivo.texto,
  })
}

// Cabeceras List-Unsubscribe / List-Unsubscribe-Post (RFC 8058): sin ellas,
// Gmail/Outlook no ofrecen su botón nativo de "Cancelar suscripción" junto
// al remitente, y ese botón nativo pesa a favor de la reputación del
// remitente de una forma que el enlace dentro del cuerpo del correo no
// logra por sí solo. El valor exacto 'List-Unsubscribe=One-Click' le dice al
// cliente que puede hacer un POST directo sin abrir el enlace ni pedir
// confirmación — por eso notificaciones.routes.js expone /baja también por
// POST, no solo por GET.
export function headersListaBaja({ transaccional, usuarioId }) {
  // Sin API pública, la cabecera apuntaría a un localhost inalcanzable: el
  // cliente de correo mostraría un botón de baja que falla al pulsarlo, peor
  // que no ofrecerlo.
  if (transaccional || !esUrlPublica(env.API_PUBLIC_URL)) return undefined
  return {
    'List-Unsubscribe': `<${enlaceBajaDe(usuarioId)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

export function paginaConfirmacionBaja() {
  return paginaSimple({
    titulo: 'Preferencia actualizada',
    mensajeHtml: esc(
      'Ya no recibirás correos no críticos. Puedes volver a activarlos cuando quieras desde tu perfil, en Preferencias de notificaciones.'
    ),
  })
}
