const { app } = require('electron')
const { autoUpdater } = require('electron-updater')

// ── Actualizaciones automáticas ─────────────────────────────────────────────
// Skynet se instala en equipos repartidos por el Terminal a los que nadie va a
// ir uno por uno a reinstalar. Sin esto, corregir un fallo obliga a recorrer
// oficinas; con esto, se publica una versión y los equipos se ponen al día
// solos, como hace Windows.
//
// Cómo funciona, en corto: al empaquetar, electron-builder escribe un
// `latest.yml` con la versión, el nombre del instalador y su hash. La app pide
// ese archivo cada tanto; si la versión de dentro es mayor que la instalada,
// baja el instalador, comprueba el hash y lo deja listo.
//
// ── La política: avisar y esperar ───────────────────────────────────────────
// La descarga es silenciosa, pero la INSTALACIÓN nunca interrumpe. Se avisa por
// notificación, aparece "Reiniciar para actualizar" en la bandeja, y si la
// persona no hace nada, se aplica sola la próxima vez que cierre Skynet
// (`autoInstallOnAppQuit`). Reiniciar por sorpresa cortaría un dictado a media
// frase o cerraría el panel con un formulario a medio llenar, y ninguna
// actualización vale eso: en el peor caso el equipo se actualiza al día
// siguiente, cuando apaguen el computador.

// Cada 6 horas. Una jornada del Terminal cabe en dos o tres comprobaciones, que
// es suficiente para que una corrección urgente llegue el mismo día, y son
// peticiones de unos pocos kilobytes (el latest.yml) — no el instalador.
const CADA_6_HORAS = 6 * 60 * 60 * 1000

// El arranque es el momento más ocupado de la app (carga el panel, registra el
// atajo, monta la bandeja). Esperar deja que todo eso termine antes de gastar
// red.
const ESPERA_TRAS_ARRANQUE = 15 * 1000

let estado = { fase: 'inactivo', version: null, detalle: null }
let avisarCambio = () => {}
let notificar = () => {}

function cambiar(fase, extra = {}) {
  estado = { fase, version: null, detalle: null, ...extra }
  avisarCambio()
}

function iniciarActualizador(opciones) {
  avisarCambio = opciones.alCambiar || (() => {})
  notificar = opciones.notificar || (() => {})
  const ajustes = opciones.ajustes

  if (!ajustes.actualizaciones) {
    cambiar('desactivado', { detalle: 'Apagadas en config.json' })
    return
  }

  // En desarrollo no hay nada que actualizar: la app corre desde el código
  // fuente y electron-updater fallaría buscando un app-update.yml que solo
  // existe dentro del empaquetado.
  if (!app.isPackaged) {
    cambiar('desactivado', { detalle: 'Solo aplica al Skynet instalado' })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Sin esto electron-updater intenta usar electron-log, que no está instalado.
  autoUpdater.logger = null

  // El feed viene del `publish` de package.json, incrustado en el paquete. Se
  // permite sobrescribirlo desde config.json para el caso en que el Terminal
  // monte un espejo interno sin salida a internet.
  if (ajustes.urlActualizaciones) {
    autoUpdater.setFeedURL({ provider: 'generic', url: ajustes.urlActualizaciones })
  }

  autoUpdater.on('checking-for-update', () => cambiar('buscando'))

  autoUpdater.on('update-not-available', () => cambiar('al-dia', { version: app.getVersion() }))

  autoUpdater.on('update-available', (info) => cambiar('descargando', { version: info.version }))

  autoUpdater.on('download-progress', (p) =>
    cambiar('descargando', { version: estado.version, detalle: `${Math.round(p.percent)}%` })
  )

  autoUpdater.on('update-downloaded', (info) => {
    cambiar('lista', { version: info.version })
    notificar(
      'Skynet se actualizó',
      `La versión ${info.version} está lista. Se instalará al cerrar Skynet, o reinícialo ahora desde la bandeja.`
    )
  })

  autoUpdater.on('error', (error) => {
    // Un equipo sin internet, o el servidor caído, dispara esto en CADA
    // comprobación. Se guarda para el Diagnóstico pero no se notifica: tres
    // avisos al día por algo que la persona no puede arreglar entrenan a
    // ignorar las notificaciones de Skynet, incluidas las que sí importan.
    cambiar('error', { detalle: error?.message || String(error) })
  })

  setTimeout(buscar, ESPERA_TRAS_ARRANQUE)
  setInterval(buscar, CADA_6_HORAS)
}

function buscar() {
  // Si ya hay una descargada esperando, volver a buscar no aporta nada y
  // pisaría el estado 'lista' que la bandeja está mostrando.
  if (estado.fase === 'lista' || estado.fase === 'descargando') return
  autoUpdater.checkForUpdates().catch(() => {
    // El evento 'error' de arriba ya registró el motivo; esto solo evita un
    // unhandled rejection cuando no hay red.
  })
}

// Comprobación pedida a mano desde la bandeja. A diferencia de la automática,
// esta SÍ responde siempre: quien hace clic espera una respuesta, y el silencio
// se leería como que el botón no funciona.
function buscarAMano() {
  if (estado.fase === 'desactivado') {
    notificar('Skynet', `Las actualizaciones están desactivadas. ${estado.detalle}.`)
    return
  }
  if (estado.fase === 'lista') {
    notificar('Skynet', `La versión ${estado.version} ya está descargada. Reinicia Skynet para aplicarla.`)
    return
  }
  notificar('Skynet', 'Buscando actualizaciones...')
  autoUpdater
    .checkForUpdates()
    .then((resultado) => {
      if (!resultado || !resultado.updateInfo) return
      if (resultado.updateInfo.version === app.getVersion()) {
        notificar('Skynet', `Ya tienes la última versión (${app.getVersion()}).`)
      }
    })
    .catch((error) => {
      notificar('Skynet', `No se pudo comprobar: ${error?.message || 'sin conexión con el servidor'}.`)
    })
}

// Cierra Skynet y lanza el instalador. `estaSaliendo` es la bandera que main.js
// mira para dejar que la app termine de verdad: sin ella, el handler de 'close'
// de la ventana de voz cancelaría el cierre y la actualización no se aplicaría.
function instalarAhora() {
  if (estado.fase !== 'lista') return
  app.estaSaliendo = true
  autoUpdater.quitAndInstall()
}

function estadoActualizador() {
  return { ...estado, versionInstalada: app.getVersion() }
}

module.exports = { iniciarActualizador, buscarAMano, instalarAhora, estadoActualizador }
