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

// Dónde vive Skynet en producción. El frontend llama al backend con rutas
// relativas (`/api`, ver frontend/src/api/client.js), y nginx las enruta al
// Express de PM2 en el 3001 (deploy/nginx/skynetttn.conf). Por eso esta única
// URL es todo lo que la app necesita saber del servidor: apuntarla bien deja
// funcionando panel, API, sesión y archivos a la vez.
const URL_PRODUCCION = 'https://skynetttn.online'
const URL_DESARROLLO = 'http://localhost:5173'

// De dónde se bajan las actualizaciones. Es el mismo servidor, en una carpeta
// que nginx sirve como estática (bloque `location /descargas/`).
const URL_ACTUALIZACIONES = `${URL_PRODUCCION}/descargas/`

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
    // De dónde se carga el panel. El defecto depende de si la app está
    // empaquetada, y no es un detalle: un .exe instalado en el equipo de un
    // funcionario NO tiene un Vite corriendo en el 5173, así que si el defecto
    // fuera el de desarrollo, cualquier instalación sin `config.json` al lado
    // arrancaría contra la nada y se vería como "Skynet no abre".
    url:
      process.env.SKYNET_URL ||
      archivo.url ||
      (app.isPackaged ? URL_PRODUCCION : URL_DESARROLLO),
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
    // Actualizaciones automáticas. ENCENDIDO por defecto, al revés que el
    // micrófono: aquí el riesgo está en NO actualizar (equipos rezagados con
    // fallos ya corregidos), y quien administre un equipo suelto sin salida a
    // internet puede apagarlo con `"actualizaciones": false`.
    actualizaciones: archivo.actualizaciones !== false,
    urlActualizaciones: archivo.urlActualizaciones || URL_ACTUALIZACIONES,
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

module.exports = { config, rutaModelo, hayModelo, RUTA_CONFIG, URL_PRODUCCION }
