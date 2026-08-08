const path = require('node:path')
const fs = require('node:fs')
const { app } = require('electron')

// Configuración del asistente de escritorio. Se resuelve en este orden:
//   1. Variables de entorno (para desarrollo: `npm run dev`).
//   2. `config.json` junto al ejecutable (para que TI pueda apuntar la app al
//      servidor del Terminal sin recompilarla).
//   3. Valores por defecto.
//
// No hay ninguna credencial aquí, y es deliberado: la app NO guarda usuario ni
// contraseña. La sesión es la cookie httpOnly que emite el backend cuando la
// persona inicia sesión en la ventana de Skynet, exactamente igual que en el
// navegador (ver src/main.js → ventana de sesión). Guardar un token en un
// archivo de configuración sería inventar un segundo mecanismo de
// autenticación, más débil que el que ya existe.

const RUTA_CONFIG = () => path.join(path.dirname(app.getPath('exe')), 'config.json')

function leerArchivo() {
  try {
    const crudo = fs.readFileSync(RUTA_CONFIG(), 'utf8')
    return JSON.parse(crudo)
  } catch {
    // Sin archivo (caso normal en desarrollo) o con JSON inválido: se sigue
    // con los valores por defecto en vez de impedir el arranque. Una app de
    // bandeja que no arranca por un config mal escrito es peor que una que
    // arranca apuntando al sitio equivocado y lo dice en el diagnóstico.
    return {}
  }
}

let cache = null

function config() {
  if (cache) return cache
  const archivo = leerArchivo()
  cache = {
    // De dónde se carga el panel. En producción, la URL del Skynet desplegado.
    url: process.env.SKYNET_URL || archivo.url || 'http://localhost:5173',
    // Atajo global. Formato de Electron (Accelerator).
    //
    // Ctrl+Shift+S y no algo más corto: los atajos globales se registran para
    // TODO el sistema, así que uno de dos teclas le robaría la combinación a
    // cualquier programa que el usuario tenga abierto. Con tres modificadores
    // el choque es improbable, y si aun así falla, main.js lo detecta y lo
    // reporta en vez de quedarse callado.
    atajo: process.env.SKYNET_ATAJO || archivo.atajo || 'Control+Shift+S',
    // "Oye Skynet" siempre escuchando. APAGADO por defecto, igual que en el
    // panel web: abrir el micrófono de forma permanente tiene que ser una
    // decisión consciente de la persona, no algo que le pase por instalar.
    wakeWord: archivo.wakeWord === true,
    // Arrancar con Windows. También apagado por defecto.
    autoArranque: archivo.autoArranque === true,
  }
  return cache
}

// Ruta del modelo de voz. En desarrollo vive en `recursos/`; empaquetado, en
// `resources/recursos/` (ver `extraResources` en package.json).
function rutaModelo() {
  const nombre = 'modelo-voz-es.tar.gz'
  const empaquetado = path.join(process.resourcesPath || '', 'recursos', nombre)
  if (fs.existsSync(empaquetado)) return empaquetado
  return path.join(__dirname, '..', 'recursos', nombre)
}

function hayModelo() {
  return fs.existsSync(rutaModelo())
}

module.exports = { config, rutaModelo, hayModelo, RUTA_CONFIG }
