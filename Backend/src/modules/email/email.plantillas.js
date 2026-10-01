import { paginaSimple, destacado, esc } from '../../utils/emailDiseno.js'

// Páginas HTML mínimas servidas por los enlaces públicos de aprobar/denegar
// (clic desde el cliente de correo, sin sesión de Skynet abierta) — misma
// identidad que el correo que las abre (ver utils/emailDiseno.js).
//
// callbackGmail es público: `error` puede venir directo de un query string
// armado a mano (?error=<script>...), no solo de Google. Por eso todo dato
// variable pasa por esc()/destacado() antes de interpolarse: evita XSS
// reflejado en esta página sin sesión.

function pagina(titulo, mensajeHtml, { autocerrar = false } = {}) {
  // autocerrar: el clic en "Aprobar"/"Denegar" del correo casi siempre abre
  // una pestaña NUEVA, distinta de la pestaña de Skynet que ya estaba
  // abierta (ver EmailConfiguracionPage.jsx, que detecta la conexión sola
  // por polling/foco, sin necesitar que esta pestaña la redirija a ningún
  // lado). window.close() solo funciona en pestañas abiertas por script,
  // así que en el resto de casos queda la instrucción como fallback.
  const script = autocerrar ? `<script>setTimeout(function () { window.close() }, 2500)</script>` : ''
  return paginaSimple({ titulo, mensajeHtml, script })
}

export function paginaConexionExitosa(correo) {
  return pagina(
    'Cuenta conectada',
    `Conectamos ${destacado(correo)}. Puedes cerrar esta pestaña: la pantalla de Email se actualiza sola.`,
    { autocerrar: true }
  )
}

export function paginaConexionDenegada() {
  return pagina(
    'Conexión denegada',
    esc('No se conectó ninguna cuenta de Gmail. Si no fuiste tú quien intentó esto, te recomendamos cambiar tu contraseña. Puedes cerrar esta pestaña.'),
    { autocerrar: true }
  )
}

export function paginaConexionError(mensaje) {
  return pagina('No se pudo continuar', esc(mensaje))
}
