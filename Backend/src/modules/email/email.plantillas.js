// Páginas HTML mínimas servidas por los enlaces públicos de
// aprobar/denegar (clic desde el cliente de correo, sin sesión de Skynet
// abierta) — mismo estilo que notificaciones.plantillas.js#paginaConfirmacionBaja.
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
const MONO = "'JetBrains Mono', monospace"

function pagina(titulo, mensaje) {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#05070a;font-family:${SANS};display:flex;align-items:center;justify-content:center;min-height:100vh;">
    <div style="max-width:420px;padding:32px;text-align:center;color:#e2e8f0;">
      <span style="font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:4px;color:#00e5ff;">SKYNET</span>
      <h1 style="font-size:18px;color:#f1f5f9;margin:16px 0 12px;font-weight:600;">${titulo}</h1>
      <p style="font-size:14px;line-height:1.6;color:#94a3b8;">${mensaje}</p>
    </div>
  </body>
</html>`
}

export function paginaConexionDenegada() {
  return pagina('Conexión denegada', 'No se conectó ninguna cuenta de Gmail. Si no fuiste tú quien intentó esto, te recomendamos cambiar tu contraseña de Skynet.')
}

export function paginaConexionError(mensaje) {
  return pagina('No se pudo continuar', mensaje)
}
