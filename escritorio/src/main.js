const path = require('node:path')
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell, nativeImage, Notification } = require('electron')
const { config, rutaModelo, hayModelo, RUTA_CONFIG } = require('./config')

// ── Por qué existe una app de escritorio ────────────────────────────────────
// Una página web NO puede escuchar el micrófono cuando está cerrada. No es una
// limitación de este proyecto: no existe ninguna API que lo permita. Los
// Service Workers —lo único que un navegador ejecuta en segundo plano— no
// tienen `navigator.mediaDevices`, así que ni con la app instalada como PWA se
// puede. El propio `useReconocimientoVoz.js` ya lo documentaba: "Oye Skynet
// funciona con la app abierta en pantalla, no en segundo plano".
//
// ── Qué NO se duplica ───────────────────────────────────────────────────────
// Esta app no tiene cerebro propio. Es una ventana de Chromium que carga EL
// MISMO panel de Skynet desde la MISMA URL, así que hereda tal cual:
//   - la sesión (cookie httpOnly del backend; aquí no se guarda ningún token),
//   - el cliente de API (`frontend/src/api/copiloto.js`),
//   - Gemini, el Tool Engine, los permisos y la auditoría,
//   - la lógica de voz y de wake word (los mismos hooks de React).
// Lo único que aporta el proceso principal es lo que un navegador no puede
// dar: vivir en la bandeja, un atajo global y una ventana que sigue
// procesando audio con el panel cerrado.

const ajustes = config()

let ventanaVoz = null // orbe: oculto pero SIEMPRE cargado, es quien escucha
let ventanaPanel = null // panel completo: login y chat, se abre a demanda
let bandeja = null
let estadoVoz = 'IDLE'
let atajoRegistrado = false

// Una sola instancia. Sin esto, abrir el ejecutable dos veces deja dos
// procesos peleando por el mismo atajo global y por el mismo micrófono: el
// segundo falla al registrar el atajo y el usuario ve un asistente "a medias"
// sin ninguna pista de por qué.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => mostrarPanel())
  arrancar()
}

function arrancar() {
  app.whenReady().then(() => {
    crearVentanaVoz()
    crearBandeja()
    registrarAtajo()
    aplicarAutoArranque()
  })

  // En Windows/Linux cerrar todas las ventanas termina la app por defecto. Aquí
  // NO: cerrar la ventana del panel debe dejar el asistente escuchando en la
  // bandeja, que es justamente el objetivo. Se sale solo desde el menú.
  app.on('window-all-closed', (e) => e.preventDefault())

  app.on('will-quit', () => globalShortcut.unregisterAll())
}

// Preferencias compartidas por las dos ventanas.
//
// ── Por qué `sandbox: false` ────────────────────────────────────────────────
// Desde Electron 20 los preload van en sandbox por defecto, y ahí `require`
// solo resuelve un puñado de módulos: `node:fs` y los ficheros del propio
// proyecto NO están. El preload necesita leer el modelo de voz del disco (40 MB
// que no pueden viajar por IPC en cada arranque), así que hay que desactivarlo.
//
// Esto NO abre el renderer a Node: `contextIsolation` sigue activo (su valor
// por defecto), que es la protección que de verdad importa. El código servido
// por la red sigue sin ver `require` ni `process`; solo ve lo que publica
// `contextBridge` en preload.js. El sandbox habría sido una segunda capa, y se
// cambia por una superficie mínima y explícita.
//
// La configuración viaja por `additionalArguments` en vez de importar
// `config.js` desde el preload: config.js usa `app`, que solo existe en el
// proceso principal, y hacerlo por argumentos evita además un IPC síncrono
// justo en el arranque.
function preferenciasComunes() {
  return {
    preload: path.join(__dirname, 'preload.js'),
    sandbox: false,
    additionalArguments: [
      `--skynet-config=${encodeURIComponent(
        JSON.stringify({
          atajo: ajustes.atajo,
          wakeWord: ajustes.wakeWord,
          rutaModelo: rutaModelo(),
          hayModelo: hayModelo(),
        })
      )}`,
    ],
  }
}

// ── Ventana de voz ──────────────────────────────────────────────────────────
function crearVentanaVoz() {
  ventanaVoz = new BrowserWindow({
    width: 320,
    height: 320,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true, // no ocupa sitio en la barra de tareas: vive en la bandeja
    alwaysOnTop: true,
    webPreferences: {
      ...preferenciasComunes(),
      // LA opción que hace posible todo esto. Chromium ralentiza los
      // temporizadores y suspende el trabajo de las ventanas que no están
      // visibles — es exactamente lo que rompe el wake word en una pestaña de
      // navegador en segundo plano. Desactivarlo mantiene el bucle de audio
      // corriendo a velocidad normal con la ventana oculta.
      backgroundThrottling: false,
    },
  })

  // El micrófono se concede sin diálogo porque la persona ya lo decidió al
  // instalar e iniciar el asistente, y porque una ventana oculta no tiene
  // dónde mostrar un diálogo: pedirlo ahí dejaría la petición colgada para
  // siempre. Se conceden SOLO media y notificaciones; todo lo demás se niega.
  const permitidos = new Set(['media', 'audioCapture', 'notifications'])
  ventanaVoz.webContents.session.setPermissionRequestHandler((_wc, permiso, aceptar) => {
    aceptar(permitidos.has(permiso))
  })
  ventanaVoz.webContents.session.setPermissionCheckHandler((_wc, permiso) => permitidos.has(permiso))

  ventanaVoz.loadURL(`${ajustes.url}/asistente`)

  // Cerrar el orbe lo esconde, no lo destruye: si se destruyera, se acabaría
  // la escucha y el asistente quedaría inservible hasta reiniciar la app.
  ventanaVoz.on('close', (e) => {
    if (!app.estaSaliendo) {
      e.preventDefault()
      ventanaVoz.hide()
    }
  })

  // Un fallo de carga (backend caído, URL mal configurada) tiene que ser
  // visible: si no, el asistente queda mudo y no hay forma de saber por qué.
  ventanaVoz.webContents.on('did-fail-load', (_e, codigo, descripcion) => {
    if (codigo === -3) return // navegación abortada: es normal al redirigir
    notificar('Skynet no pudo conectarse', `${descripcion}. Revisa la URL en ${RUTA_CONFIG()}`)
  })
}

// ── Panel completo ──────────────────────────────────────────────────────────
// Es donde la persona inicia sesión y donde se le muestra lo que no cabe en
// una respuesta hablada. Comparte sesión con la ventana de voz porque comparte
// la sesión por defecto de Electron: la cookie del backend vale para las dos.
function mostrarPanel(ruta = '/') {
  if (ventanaPanel && !ventanaPanel.isDestroyed()) {
    ventanaPanel.show()
    ventanaPanel.focus()
    return
  }
  ventanaPanel = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Skynet',
    icon: iconoApp(),
    webPreferences: preferenciasComunes(),
  })
  ventanaPanel.loadURL(`${ajustes.url}${ruta}`)
  ventanaPanel.on('closed', () => {
    ventanaPanel = null
  })
  // Los enlaces externos van al navegador del sistema, no a una ventana de la
  // app: una ventana de Electron sin barra de direcciones es el sitio ideal
  // para una suplantación, y aquí no hay ninguna razón para abrirlos dentro.
  ventanaPanel.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── Atajo global ────────────────────────────────────────────────────────────
function registrarAtajo() {
  // `register` devuelve false cuando otro programa ya se quedó con la
  // combinación. Sin comprobarlo, el usuario pulsa el atajo, no pasa nada, y
  // no hay ninguna pista de que el problema es un choque de teclas.
  atajoRegistrado = globalShortcut.register(ajustes.atajo, activarPorAtajo)
  if (!atajoRegistrado) {
    notificar(
      'Skynet: atajo no disponible',
      `Otro programa ya usa ${ajustes.atajo}. Cámbialo en ${RUTA_CONFIG()} y reinicia.`
    )
  }
  return atajoRegistrado
}

// El atajo hace UNA cosa: decirle a la ventana de voz que empiece a escuchar.
// Toda la lógica de qué hacer con lo que se oiga vive en el frontend, que es
// donde ya estaba.
function activarPorAtajo() {
  if (!ventanaVoz || ventanaVoz.isDestroyed()) return
  mostrarOrbe()
  ventanaVoz.webContents.send('skynet:escuchar')
}

// ── Orbe ────────────────────────────────────────────────────────────────────
// Se muestra sin robar el foco. `showInactive` es clave: si el orbe tomara el
// foco, dictarle algo a Skynet interrumpiría lo que la persona esté
// escribiendo en otro programa, que es justo lo que un asistente global no
// debe hacer.
function mostrarOrbe() {
  if (!ventanaVoz || ventanaVoz.isDestroyed()) return
  const { screen } = require('electron')
  const area = screen.getPrimaryDisplay().workAreaSize
  ventanaVoz.setPosition(area.width - 340, area.height - 340)
  ventanaVoz.showInactive()
}

function ocultarOrbe() {
  if (ventanaVoz && !ventanaVoz.isDestroyed() && ventanaVoz.isVisible()) ventanaVoz.hide()
}

// ── Bandeja ─────────────────────────────────────────────────────────────────
function iconoApp() {
  return nativeImage.createFromPath(path.join(__dirname, '..', 'recursos', 'icono.png'))
}

function crearBandeja() {
  bandeja = new Tray(iconoApp().resize({ width: 16, height: 16 }))
  refrescarBandeja()
  bandeja.on('click', () => activarPorAtajo())
}

function refrescarBandeja() {
  if (!bandeja) return
  const problemas = []
  if (!atajoRegistrado) problemas.push('atajo ocupado')
  if (ajustes.wakeWord && !hayModelo()) problemas.push('falta el modelo de voz')

  bandeja.setToolTip(
    problemas.length ? `Skynet — ${problemas.join(', ')}` : `Skynet — ${ajustes.atajo} para hablar`
  )
  bandeja.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Hablar con Skynet  (${ajustes.atajo})`, click: activarPorAtajo, enabled: atajoRegistrado },
      { type: 'separator' },
      { label: 'Abrir el panel', click: () => mostrarPanel('/') },
      { label: 'Diagnóstico', click: () => mostrarPanel('/asistente/diagnostico') },
      { type: 'separator' },
      {
        label: 'Escuchar "Oye Skynet"',
        type: 'checkbox',
        checked: ajustes.wakeWord,
        // El cambio es solo para esta sesión: dejarlo permanente exigiría
        // escribir el config.json, y ese archivo es de quien administra el
        // equipo, no de la app. Si se quiere permanente, se pone allí.
        click: (item) => {
          ajustes.wakeWord = item.checked
          ventanaVoz?.webContents.send('skynet:wake-word', item.checked)
          refrescarBandeja()
        },
      },
      {
        label: 'Arrancar con Windows',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--oculto'] }),
      },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          app.estaSaliendo = true
          app.quit()
        },
      },
    ])
  )
}

function aplicarAutoArranque() {
  // Solo se aplica si el config lo pide, y nunca se desactiva por nuestra
  // cuenta: si la persona lo activó a mano desde el menú, la app no debe
  // revertírselo en el siguiente arranque.
  if (ajustes.autoArranque && !app.getLoginItemSettings().openAtLogin) {
    app.setLoginItemSettings({ openAtLogin: true, args: ['--oculto'] })
  }
}

function notificar(titulo, cuerpo) {
  if (Notification.isSupported()) new Notification({ title: titulo, body: cuerpo }).show()
}

// ── Puente con el frontend ──────────────────────────────────────────────────
// Deliberadamente estrecho: el renderer solo puede cambiar el estado visual,
// pedir que se abra el panel y consultar el diagnóstico. No hay ningún canal
// que ejecute código, abra archivos ni toque el sistema.

ipcMain.on('skynet:estado', (_e, nuevo) => {
  estadoVoz = nuevo
  // El orbe se esconde solo cuando Skynet vuelve a reposo. Mientras escucha,
  // piensa o habla se queda visible: es el único indicador de que está
  // haciendo algo, porque la ventana no tiene barra ni botones.
  if (nuevo === 'IDLE') ocultarOrbe()
  else mostrarOrbe()
})

ipcMain.on('skynet:abrir-panel', (_e, ruta) => mostrarPanel(typeof ruta === 'string' ? ruta : '/'))

// La sesión caducó (JWT de 8 h): hay que mostrar el login, porque una ventana
// oculta no puede pedirle la contraseña a nadie.
ipcMain.on('skynet:sesion-caducada', () => {
  notificar('Skynet', 'Tu sesión caducó. Inicia sesión para seguir usando el asistente.')
  mostrarPanel('/login')
})

ipcMain.handle('skynet:diagnostico', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  url: ajustes.url,
  atajo: ajustes.atajo,
  atajoRegistrado,
  wakeWord: ajustes.wakeWord,
  hayModelo: hayModelo(),
  rutaModelo: rutaModelo(),
  rutaConfig: RUTA_CONFIG(),
  autoArranque: app.getLoginItemSettings().openAtLogin,
  estadoVoz,
}))
