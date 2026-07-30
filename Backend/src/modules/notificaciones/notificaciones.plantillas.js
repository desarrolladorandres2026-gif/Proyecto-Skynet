import { env } from '../../config/env.js'
import { firmarTokenBaja } from './notificaciones.token.js'

// HTML basado en tablas (no flexbox/grid): es lo único que renderiza de
// forma predecible en clientes de correo (Outlook de escritorio usa el motor
// de Word para el HTML, no un navegador real). Nada de backdrop-filter,
// position:absolute ni fuente custom vía @font-face (los clientes de correo
// la descartan casi siempre) — mono/sans son pilas de fuentes de sistema,
// igual que 'JetBrains Mono' cae a ui-monospace en panel.css.
//
// Segunda vuelta de este diseño: la primera versión (badge-pill + tarjeta +
// botón redondeado) era el mismo patrón genérico de cualquier notificación
// SaaS con los colores de Skynet encima. Esta traduce literalmente la seña
// visual del panel — las corner brackets de .panel-bracket en panel.css —
// usando una tabla 3×3 con bordes reales en las 4 esquinas (position:absolute
// no es fiable en email, pero bordes de celda sí), y trata el cuerpo como una
// línea de bitácora/terminal en vez de una tarjeta de SaaS.
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace"
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

// Un acento de color por categoría (ver notificaciones.catalogo.js): el
// mismo principio que Badge en components/ui.jsx, adaptado a los 5 valores
// de este sistema — aquí gobierna el color de las brackets y de la etiqueta
// de módulo, no un pill.
const CATEGORIA_INFO = {
  mantenimiento: { etiqueta: 'MANTENIMIENTO', color: '#a78bfa' },
  danos: { etiqueta: 'REPORTES DE DAÑOS', color: '#fb7185' },
  requerimientos: { etiqueta: 'REQUERIMIENTOS', color: '#fbbf24' },
  sistema: { etiqueta: 'SEGURIDAD', color: '#f87171' },
}

function fmtFechaCorta(fecha) {
  const d = fecha ? new Date(fecha) : new Date()
  return d
    .toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    .toUpperCase()
    .replace('.', '')
}

// Celda de 12×12 con borde en dos lados: una esquina de .panel-bracket
// resuelta con una celda de tabla real (nunca renderiza mal en un cliente de
// correo, a diferencia de position:absolute).
function esquina(color, lados) {
  const bordes = {
    tl: `border-top:1.5px solid ${color};border-left:1.5px solid ${color};`,
    tr: `border-top:1.5px solid ${color};border-right:1.5px solid ${color};`,
    bl: `border-bottom:1.5px solid ${color};border-left:1.5px solid ${color};`,
    br: `border-bottom:1.5px solid ${color};border-right:1.5px solid ${color};`,
  }[lados]
  return `<td width="12" height="12" style="${bordes}line-height:1px;font-size:1px;">&nbsp;</td>`
}

// `url` la fija cada módulo llamador (hoy siempre `/modulo/${ObjectId}`, ver
// requerimientos.service.js), pero notificar() es un servicio genérico —
// nada obliga a que siga siendo así en el futuro. Se valida la forma
// (ruta relativa, sin "//" que reinterprete el host) y se escapa para
// contexto de atributo HTML antes de interpolarla en href="...": sin esto,
// un valor con una comilla doble rompería el atributo e inyectaría HTML en
// el correo (XSS por inyección de atributo).
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
// local— pero sin <a href> hacia una URL inservible: la ruta se muestra como
// texto. Con FRONTEND_URL/API_PUBLIC_URL apuntando a un dominio público real
// (producción), esto no se activa y el correo lleva sus enlaces normales.
function esUrlPublica(base) {
  if (typeof base !== 'string') return false
  try {
    const { protocol, hostname } = new URL(base)
    if (protocol !== 'https:' && protocol !== 'http:') return false
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) return false
    // IPs privadas (10.x, 192.168.x, 172.16-31.x): tampoco resuelven fuera
    // de la red local de quien envía.
    if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false
    return hostname.includes('.')
  } catch {
    return false
  }
}

export function plantillaNotificacion({ titulo, cuerpo, url, usuarioId, transaccional, categoria, fecha }) {
  const urlSegura = sanitizarUrlRelativa(url)
  const frontendPublico = esUrlPublica(env.FRONTEND_URL)
  const apiPublica = esUrlPublica(env.API_PUBLIC_URL)

  const enlaceAccion = escaparHtml(urlSegura ? `${env.FRONTEND_URL}${urlSegura}` : env.FRONTEND_URL)
  const enlaceBaja =
    transaccional || !apiPublica
      ? null
      : escaparHtml(`${env.API_PUBLIC_URL}/notificaciones/baja?token=${encodeURIComponent(firmarTokenBaja(usuarioId))}`)
  const info = CATEGORIA_INFO[categoria] || { etiqueta: escaparHtml((categoria || 'SISTEMA').toUpperCase()), color: '#00e5ff' }

  // Con URL pública: botón real. Sin ella (entorno local): la misma caja
  // visual pero como texto, sin href hacia una dirección que no existiría
  // para quien recibe el correo.
  const bloqueAccion = frontendPublico
    ? `<a href="${enlaceAccion}" style="display:inline-block;font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:1px;color:${info.color};text-decoration:none;padding:10px 18px;">
         VER EN SKYNET →
       </a>`
    : `<span style="display:inline-block;font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:1px;color:${info.color};padding:10px 18px;">
         VER EN SKYNET${urlSegura ? ` · ${escaparHtml(urlSegura)}` : ''}
       </span>`

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#05070a;font-family:${SANS};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#05070a;padding:36px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;">

            <!-- Marca -->
            <tr>
              <td style="padding:0 2px 18px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:8px;" valign="middle">
                      <div style="width:6px;height:6px;background-color:#00e5ff;font-size:0;line-height:0;">&nbsp;</div>
                    </td>
                    <td valign="middle">
                      <span style="font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:5px;color:#e2e8f0;">SKYNET</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Marco con corner brackets (tabla 3×3) -->
            <tr>
              <td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

                  <tr>
                    ${esquina(info.color, 'tl')}
                    <td style="border-top:1px solid rgba(0,229,255,0.14);"></td>
                    ${esquina(info.color, 'tr')}
                  </tr>

                  <tr>
                    <td style="border-left:1px solid rgba(0,229,255,0.14);background-color:#080b10;width:12px;">&nbsp;</td>
                    <td style="background-color:#080b10;">

                      <!-- Línea de cabecera: módulo · fecha, como un log -->
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:20px 22px 0;">
                        <tr>
                          <td style="padding:0 0 0 22px;">
                            <span style="font-family:${MONO};font-size:11px;font-weight:700;letter-spacing:2px;color:${info.color};">[${info.etiqueta}]</span>
                          </td>
                          <td align="right" style="padding:0 22px 0 0;">
                            <span style="font-family:${MONO};font-size:11px;letter-spacing:0.5px;color:#4b5d70;">${fmtFechaCorta(fecha)}</span>
                          </td>
                        </tr>
                      </table>

                      <!-- Separador -->
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:12px 22px 0;">
                        <tr><td style="border-top:1px solid rgba(0,229,255,0.12);font-size:0;line-height:0;">&nbsp;</td></tr>
                      </table>

                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding:18px 22px 0;">
                            <h1 style="margin:0;font-size:19px;line-height:1.4;color:#f8fafc;font-weight:600;">${escaparHtml(titulo)}</h1>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:12px 22px 0;">
                            <table role="presentation" cellpadding="0" cellspacing="0">
                              <tr>
                                <td valign="top" style="padding-right:8px;">
                                  <span style="font-family:${MONO};font-size:13px;color:${info.color};">›</span>
                                </td>
                                <td>
                                  <p style="margin:0;font-family:${MONO};font-size:13px;line-height:1.75;color:#b8c4d1;">${escaparHtml(cuerpo)}</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:24px 22px 20px;">
                            <table role="presentation" cellpadding="0" cellspacing="0">
                              <tr>
                                <td style="border:1px solid ${info.color};">
                                  ${bloqueAccion}
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                    </td>
                    <td style="border-right:1px solid rgba(0,229,255,0.14);background-color:#080b10;width:12px;">&nbsp;</td>
                  </tr>

                  <tr>
                    ${esquina(info.color, 'bl')}
                    <td style="border-bottom:1px solid rgba(0,229,255,0.14);"></td>
                    ${esquina(info.color, 'br')}
                  </tr>

                </table>
              </td>
            </tr>

            <!-- Pie -->
            <tr>
              <td style="padding:18px 4px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td>
                      ${
                        enlaceBaja
                          ? `<a href="${enlaceBaja}" style="font-family:${MONO};font-size:10px;letter-spacing:0.5px;color:#4b5d70;text-decoration:underline;">DARSE DE BAJA DE CORREOS NO CRÍTICOS</a>`
                          : transaccional
                            ? `<span style="font-family:${MONO};font-size:10px;letter-spacing:0.5px;color:#3d4c5c;">CORREO DE SEGURIDAD — NO SE PUEDE DESACTIVAR</span>`
                            : `<span style="font-family:${MONO};font-size:10px;letter-spacing:0.5px;color:#3d4c5c;">GESTIONA TUS AVISOS EN SKYNET › PREFERENCIAS DE NOTIFICACIONES</span>`
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function enlaceBajaDe(usuarioId) {
  return `${env.API_PUBLIC_URL}/notificaciones/baja?token=${encodeURIComponent(firmarTokenBaja(usuarioId))}`
}

// Un correo que es SOLO HTML (sin parte text/plain) es en sí mismo una señal
// que los filtros antispam pesan en contra — la mayoría de clientes
// legítimos generan ambas partes. No es una traducción automática del HTML:
// se arma aparte para que quede legible como texto plano de verdad, no como
// una tabla de HTML despojada de sus tags.
export function plantillaNotificacionTexto({ titulo, cuerpo, url, usuarioId, transaccional, categoria, fecha }) {
  const urlSegura = sanitizarUrlRelativa(url)
  const etiqueta = CATEGORIA_INFO[categoria]?.etiqueta || (categoria || 'SISTEMA').toUpperCase()

  const lineas = [
    `SKYNET · ${etiqueta} · ${fmtFechaCorta(fecha)}`,
    '',
    titulo,
    cuerpo,
    '',
  ]

  // Mismo criterio que la versión HTML: sin URL pública no se imprime una
  // dirección que el destinatario no podría abrir.
  if (esUrlPublica(env.FRONTEND_URL)) {
    lineas.push(`Ver en Skynet: ${urlSegura ? `${env.FRONTEND_URL}${urlSegura}` : env.FRONTEND_URL}`)
  } else {
    lineas.push(`Ver en Skynet${urlSegura ? ` · ${urlSegura}` : ''}`)
  }

  if (transaccional) {
    lineas.push('', 'Correo de seguridad — no se puede desactivar desde preferencias.')
  } else if (esUrlPublica(env.API_PUBLIC_URL)) {
    lineas.push('', `Darte de baja de correos no críticos: ${enlaceBajaDe(usuarioId)}`)
  } else {
    lineas.push('', 'Gestiona tus avisos en Skynet › Preferencias de notificaciones.')
  }
  return lineas.join('\n')
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
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#05070a;font-family:${SANS};display:flex;align-items:center;justify-content:center;min-height:100vh;">
    <div style="max-width:420px;padding:32px;text-align:center;color:#e2e8f0;">
      <span style="font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:4px;color:#00e5ff;">SKYNET</span>
      <h1 style="font-size:18px;color:#f1f5f9;margin:16px 0 12px;font-weight:600;">Preferencia actualizada</h1>
      <p style="font-size:14px;line-height:1.6;color:#94a3b8;">Ya no recibirás correos no críticos de Skynet. Puedes reactivarlos cuando quieras desde tu perfil, en «Preferencias de notificaciones».</p>
    </div>
  </body>
</html>`
}
