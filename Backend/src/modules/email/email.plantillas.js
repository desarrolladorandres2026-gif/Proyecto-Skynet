// Páginas HTML mínimas servidas por los enlaces públicos de
// aprobar/denegar (clic desde el cliente de correo, sin sesión de Skynet
// abierta) — mismo estilo que notificaciones.plantillas.js#paginaConfirmacionBaja.
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
const MONO = "'JetBrains Mono', monospace"

// callbackGmail es público: `error` puede venir directo de un query string
// armado a mano (?error=<script>...), no solo de Google. Escapar antes de
// interpolar evita XSS reflejado en esta página sin sesión.
function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function pagina(titulo, mensaje, { autocerrar = false } = {}) {
  // autocerrar: el clic en "Aprobar"/"Denegar" del correo casi siempre abre
  // una pestaña NUEVA, distinta de la pestaña de Skynet que ya estaba
  // abierta (ver EmailConfiguracionPage.jsx, que detecta la conexión sola
  // por polling/foco, sin necesitar que esta pestaña la redirija a ningún
  // lado). window.close() solo funciona en pestañas abiertas por script,
  // así que en el resto de casos queda el botón/instrucción como fallback.
  const script = autocerrar
    ? `<script>setTimeout(function () { window.close() }, 2500)</script>`
    : ''
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#05070a;font-family:${SANS};display:flex;align-items:center;justify-content:center;min-height:100vh;">
    <div style="max-width:420px;padding:32px;text-align:center;color:#e2e8f0;">
      <span style="font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:4px;color:#00e5ff;">SKYNET</span>
      <h1 style="font-size:18px;color:#f1f5f9;margin:16px 0 12px;font-weight:600;">${titulo}</h1>
      <p style="font-size:14px;line-height:1.6;color:#94a3b8;">${mensaje}</p>
    </div>
    ${script}
  </body>
</html>`
}

export function paginaConexionExitosa(correo) {
  return pagina(
    'Cuenta conectada',
    `Conectamos <strong style="color:#e2e8f0;">${esc(correo)}</strong> a Skynet. Puedes cerrar esta pestaña — la pantalla de Email en Skynet se actualiza sola.`,
    { autocerrar: true }
  )
}

export function paginaConexionDenegada() {
  return pagina(
    'Conexión denegada',
    'No se conectó ninguna cuenta de Gmail. Si no fuiste tú quien intentó esto, te recomendamos cambiar tu contraseña de Skynet. Puedes cerrar esta pestaña.',
    { autocerrar: true }
  )
}

export function paginaConexionError(mensaje) {
  return pagina('No se pudo continuar', esc(mensaje))
}
