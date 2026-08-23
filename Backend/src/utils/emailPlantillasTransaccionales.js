// Plantillas HTML para correos transaccionales enviados por utils/email.js.
// Basado en tablas (no flexbox/grid): es lo único que renderiza de forma
// predecible en clientes de correo (Outlook de escritorio usa el motor de
// Word para el HTML). Mismo lenguaje visual que
// notificaciones/notificaciones.plantillas.js (corner brackets tipo HUD,
// mono/sans de sistema, acento cian) para que cualquier correo que Skynet
// manda se sienta de la misma familia.
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace"
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

// Todo dato que puede venir de fuera (nombre, IP, user-agent) se interpola en
// HTML: sin escapar, un User-Agent o nombre con `<`/`"` fabricado a mano
// podría inyectar marcado (o reescribir el propio botón "Aprobar"/"Denegar")
// dentro de un correo que existe justamente para ser una fuente confiable de
// verdad fuera de banda.
function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function esquina(color, lados) {
  const bordes = {
    tl: `border-top:1.5px solid ${color};border-left:1.5px solid ${color};`,
    tr: `border-top:1.5px solid ${color};border-right:1.5px solid ${color};`,
    bl: `border-bottom:1.5px solid ${color};border-left:1.5px solid ${color};`,
    br: `border-bottom:1.5px solid ${color};border-right:1.5px solid ${color};`,
  }[lados]
  return `<td width="12" height="12" style="${bordes}line-height:1px;font-size:1px;">&nbsp;</td>`
}

function fmtFecha(fecha) {
  return new Date(fecha)
    .toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .toUpperCase()
    .replace('.', '')
}

// Botón de ancho completo (100%), no inline-table de ancho fijo: en pantallas
// angostas (~320-375px, iPhone SE/Mail app) dos botones lado a lado con
// padding fijo desbordaban el contenedor y forzaban scroll horizontal /
// zoom para poder tocarlos. Full-width + apilados en filas separadas es la
// única forma que no depende de que el cliente de correo soporte
// @media (Outlook de escritorio lo ignora, pero esto no necesita media
// queries para verse bien en cualquier ancho).
function boton(href, etiqueta, { color, colorTexto = '#04141a' }) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:10px;">
      <tr>
        <td align="center" style="border-radius:6px;background:${color};">
          <a href="${esc(href)}" style="display:block;width:100%;box-sizing:border-box;padding:13px 22px;font-family:${SANS};font-size:14px;font-weight:700;letter-spacing:0.02em;color:${colorTexto};text-decoration:none;border-radius:6px;text-align:center;">
            ${etiqueta}
          </a>
        </td>
      </tr>
    </table>`
}

// dato = [{ etiqueta, valor }]
function filaDato({ etiqueta, valor }) {
  return `
    <tr>
      <td style="padding:6px 0;font-family:${MONO};font-size:11px;letter-spacing:0.08em;color:#64748b;white-space:nowrap;vertical-align:top;">${esc(etiqueta)}</td>
      <td style="padding:6px 0 6px 16px;font-family:${SANS};font-size:13px;color:#cbd5e1;word-break:break-word;">${esc(valor)}</td>
    </tr>`
}

// Alerta de seguridad para el intento de conexión de una cuenta de correo
// (Gmail hoy, cualquier proveedor futuro): brackets en rojo/ámbar en vez del
// cian habitual de Skynet — mismo código de color que CATEGORIA_INFO.sistema
// en notificaciones.plantillas.js ("SEGURIDAD" = #f87171) — para que el ojo
// distinga de inmediato un correo sensible de una notificación normal.
export function correoConexionCuenta({
  nombreUsuario,
  proveedor,
  aprobarLink,
  denegarLink,
  ip,
  userAgent,
  fecha = new Date(),
  ttlMinutos = 15,
  scopeDescripcion,
}) {
  const color = '#f87171'
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <style>
      /* Encoge el margen exterior y el padding de la tarjeta en pantallas
         angostas (iPhone SE ≈320px, la mayoría de apps de correo móviles):
         sin esto, 32px+22px de padding fijo por lado le comían ~100px de
         los ~320-375px disponibles, dejando el contenido apretado. Los
         botones ya son 100% de ancho (ver boton()) y no necesitan regla
         propia acá — Outlook de escritorio ignora este bloque sin romper
         nada, cae al padding de escritorio de las reglas inline. */
      @media only screen and (max-width: 480px) {
        .sk-wrap { padding: 20px 10px !important; }
        .sk-card { padding: 20px 16px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#05070a;font-family:${SANS};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#05070a;">
      <tr>
        <td class="sk-wrap" align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
            <tr>
              <td style="padding-bottom:20px;">
                <span style="font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:4px;color:#00e5ff;">SKYNET</span>
              </td>
            </tr>

            <tr>
              ${esquina(color, 'tl')}
              <td style="border-top:1.5px solid ${color};"></td>
              ${esquina(color, 'tr')}
            </tr>
            <tr>
              <td style="border-left:1.5px solid ${color};padding:0;" width="12"></td>
              <td class="sk-card" style="padding:24px 22px;">
                <span style="display:inline-block;font-family:${MONO};font-size:10px;font-weight:700;letter-spacing:0.14em;color:${color};border:1px solid ${color}55;border-radius:3px;padding:3px 8px;">⚠ SEGURIDAD</span>
                <h1 style="margin:14px 0 4px;font-family:${SANS};font-size:18px;font-weight:700;color:#f1f5f9;">Intento de conexión de correo</h1>
                <p style="margin:0 0 18px;font-family:${SANS};font-size:14px;line-height:1.6;color:#94a3b8;">
                  Hola ${esc(nombreUsuario)}, alguien con acceso a tu cuenta de Skynet intentó conectar una cuenta de
                  <strong style="color:#e2e8f0;">${esc(proveedor)}</strong> al módulo Email. No se conectó nada todavía:
                  hace falta tu aprobación, desde este correo.
                </p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f14;border:1px solid #1e293b;border-radius:8px;padding:14px 16px;margin-bottom:18px;">
                  ${filaDato({ etiqueta: 'CUÁNDO', valor: fmtFecha(fecha) })}
                  ${filaDato({ etiqueta: 'IP', valor: ip || 'desconocida' })}
                  ${filaDato({ etiqueta: 'DISPOSITIVO', valor: userAgent || 'desconocido' })}
                  ${filaDato({ etiqueta: 'PERMITIRÍA', valor: scopeDescripcion })}
                </table>

                ${boton(aprobarLink, 'Aprobar y continuar', { color: '#00e5ff' })}
                ${boton(denegarLink, 'Denegar', { color: '#1e293b', colorTexto: '#cbd5e1' })}

                <p style="margin:20px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:#64748b;">
                  Este enlace vence en ${ttlMinutos} minutos. Si no fuiste tú, denégalo y cambia tu contraseña de
                  Skynet cuanto antes — alguien más tiene sesión iniciada en tu cuenta.
                </p>
              </td>
              <td style="border-right:1.5px solid ${color};padding:0;" width="12"></td>
            </tr>
            <tr>
              ${esquina(color, 'bl')}
              <td style="border-bottom:1.5px solid ${color};"></td>
              ${esquina(color, 'br')}
            </tr>

            <tr>
              <td style="padding-top:20px;font-family:${MONO};font-size:10px;letter-spacing:0.08em;color:#334155;">
                SKYNET · TERMINAL DE TRANSPORTE NEIVA — correo automático, no respondas a este mensaje.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// ── Protocolo de despliegue (ver copiloto.despliegue.js) ────────────────────
// Acento cian (no el rojo ⚠ SEGURIDAD de correoConexionCuenta arriba): ninguno
// de los dos correos de abajo es una alerta — uno es una verificación
// rutinaria pedida por el propio Super Admin, el otro es el anuncio de
// lanzamiento. Mismo shell de tarjeta con esquinas tipo HUD para que se
// sientan de la misma familia visual que el resto de correos de Skynet.
const COLOR_DESPLIEGUE = '#00e5ff'

function shellDespliegue({ badge, titulo, cuerpoHtml }) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <style>
      @media only screen and (max-width: 480px) {
        .sk-wrap { padding: 20px 10px !important; }
        .sk-card { padding: 20px 16px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#05070a;font-family:${SANS};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#05070a;">
      <tr>
        <td class="sk-wrap" align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
            <tr>
              <td style="padding-bottom:20px;">
                <span style="font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:4px;color:${COLOR_DESPLIEGUE};">SKYNET</span>
              </td>
            </tr>
            <tr>
              ${esquina(COLOR_DESPLIEGUE, 'tl')}
              <td style="border-top:1.5px solid ${COLOR_DESPLIEGUE};"></td>
              ${esquina(COLOR_DESPLIEGUE, 'tr')}
            </tr>
            <tr>
              <td style="border-left:1.5px solid ${COLOR_DESPLIEGUE};padding:0;" width="12"></td>
              <td class="sk-card" style="padding:24px 22px;">
                <span style="display:inline-block;font-family:${MONO};font-size:10px;font-weight:700;letter-spacing:0.14em;color:${COLOR_DESPLIEGUE};border:1px solid ${COLOR_DESPLIEGUE}55;border-radius:3px;padding:3px 8px;">${badge}</span>
                <h1 style="margin:14px 0 4px;font-family:${SANS};font-size:18px;font-weight:700;color:#f1f5f9;">${titulo}</h1>
                ${cuerpoHtml}
              </td>
              <td style="border-right:1.5px solid ${COLOR_DESPLIEGUE};padding:0;" width="12"></td>
            </tr>
            <tr>
              ${esquina(COLOR_DESPLIEGUE, 'bl')}
              <td style="border-bottom:1.5px solid ${COLOR_DESPLIEGUE};"></td>
              ${esquina(COLOR_DESPLIEGUE, 'br')}
            </tr>
            <tr>
              <td style="padding-top:20px;font-family:${MONO};font-size:10px;letter-spacing:0.08em;color:#334155;">
                SKYNET · TERMINAL DE TRANSPORTE NEIVA — correo automático, no respondas a este mensaje.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function parrafo(texto, { destacado = false } = {}) {
  const color = destacado ? '#e2e8f0' : '#94a3b8'
  const peso = destacado ? '600' : '400'
  return `<p style="margin:0 0 10px;font-family:${SANS};font-size:14px;line-height:1.6;color:${color};font-weight:${peso};">${esc(texto)}</p>`
}

// Contenido 100% estático (sin datos que vengan de fuera), a propósito: es un
// envío de verificación, no debe depender de nada que pueda fallar al
// interpolarse.
export function correoPruebaComunicaciones() {
  const cuerpoHtml = [
    parrafo('Esta es únicamente una prueba de funcionamiento del sistema de comunicaciones de Skynet.'),
    parrafo('Estamos verificando que el sistema pueda enviar correctamente los mensajes a los usuarios registrados antes del lanzamiento oficial.'),
    parrafo('No es necesario realizar ninguna acción.'),
    parrafo('Si recibiste este mensaje, la prueba de comunicaciones funcionó correctamente.', { destacado: true }),
  ].join('\n')
  return shellDespliegue({ badge: '🧪 PRUEBA', titulo: 'Verificación de comunicaciones', cuerpoHtml })
}

export function correoPruebaComunicacionesTexto() {
  return [
    'Esta es únicamente una prueba de funcionamiento del sistema de comunicaciones de Skynet.',
    'Estamos verificando que el sistema pueda enviar correctamente los mensajes a los usuarios registrados antes del lanzamiento oficial.',
    'No es necesario realizar ninguna acción.',
    'Si recibiste este mensaje, la prueba de comunicaciones funcionó correctamente.',
    '',
    '— Equipo Skynet',
  ].join('\n')
}

// `loginUrl` sí es dinámico (env.FRONTEND_URL + '/login', armado por quien
// llama — ver copiloto.despliegue.js), pero boton() ya escapa el href con
// esc() internamente, así que no hace falta repetirlo aquí.
export function correoDespliegueOficial({ loginUrl }) {
  const cuerpoHtml = [
    parrafo('Hoy damos un nuevo paso en la forma en que gestionamos nuestra operación.'),
    parrafo('Skynet ya está disponible. Tu acceso a la plataforma está habilitado.'),
    boton(loginUrl, 'ACCEDER A SKYNET', { color: COLOR_DESPLIEGUE }),
    parrafo('Te recomendamos ingresar con tus credenciales y realizar tu primer acceso.'),
    parrafo('Si es tu primer ingreso, durante la capacitación te acompañaremos paso a paso para que conozcas las principales funciones de la plataforma.'),
    parrafo('Bienvenido a Skynet. Un solo sistema. Una operación más conectada.', { destacado: true }),
  ].join('\n')
  return shellDespliegue({ badge: '🚀 LANZAMIENTO', titulo: 'El sistema está listo.', cuerpoHtml })
}

export function correoDespliegueOficialTexto({ loginUrl }) {
  return [
    'SKYNET',
    '',
    'El sistema está listo.',
    'Hoy damos un nuevo paso en la forma en que gestionamos nuestra operación.',
    'Skynet ya está disponible. Tu acceso a la plataforma está habilitado.',
    '',
    `Accede aquí: ${loginUrl}`,
    '',
    'Te recomendamos ingresar con tus credenciales y realizar tu primer acceso.',
    'Si es tu primer ingreso, durante la capacitación te acompañaremos paso a paso para que conozcas las principales funciones de la plataforma.',
    '',
    'Bienvenido a Skynet. Un solo sistema. Una operación más conectada.',
    '',
    '— Equipo Skynet',
  ].join('\n')
}
