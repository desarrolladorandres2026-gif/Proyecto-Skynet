const fs = require('node:fs')
const { contextBridge, ipcRenderer } = require('electron')

// La configuración llega por `additionalArguments` desde el proceso principal
// (ver preferenciasComunes en main.js) y NO importando config.js: ese módulo
// usa `app`, que solo existe en el proceso principal. Leerlo de los argumentos
// evita además un IPC síncrono en el momento más sensible, el arranque.
//
// Si el argumento faltara (no debería), se cae a valores inertes en vez de
// reventar: un preload que lanza deja la ventana sin puente y sin ninguna
// pista de por qué, que es exactamente el fallo mudo que este proyecto intenta
// evitar en todas partes.
function leerArgumentos() {
  const prefijo = '--skynet-config='
  const crudo = process.argv.find((a) => a.startsWith(prefijo))
  if (!crudo) return {}
  try {
    return JSON.parse(decodeURIComponent(crudo.slice(prefijo.length)))
  } catch {
    return {}
  }
}

// Puente entre el panel de Skynet (que es la MISMA app web de siempre) y el
// proceso principal de Electron.
//
// ── Por qué es tan estrecho ─────────────────────────────────────────────────
// El renderer carga código servido por la red. Con `contextIsolation` activo
// (el valor por defecto desde Electron 12) ese código no ve `require` ni
// `process`: solo ve exactamente lo que se publique aquí. Así que esta lista
// ES la superficie de ataque de la app, y por eso no hay ni un solo método
// genérico: nada de `leerArchivo(ruta)`, `ejecutar(comando)` ni `invoke(canal,
// datos)`. Cada función hace una cosa concreta y acotada.
//
// La única que toca el disco es `urlModelo`, y lee una ruta FIJA que calcula
// el propio proceso principal — el renderer no puede pedir otro archivo.

const ajustes = leerArgumentos()

contextBridge.exposeInMainWorld('skynetEscritorio', {
  // Bandera que usa el frontend para saber que corre dentro del asistente y no
  // en una pestaña normal (ver frontend/src/escritorio/esEscritorio.js).
  version: 1,
  atajo: ajustes.atajo || null,
  wakeWordInicial: ajustes.wakeWord === true,
  hayModelo: ajustes.hayModelo === true,

  // ── Eventos que llegan del proceso principal ──────────────────────────────
  // Devuelven su función de baja para que React pueda limpiarlas en el cleanup
  // del efecto; sin eso, cada re-montaje del componente acumularía un listener
  // más y el atajo acabaría disparando la escucha varias veces seguidas.
  alEscuchar(callback) {
    const fn = () => callback()
    ipcRenderer.on('skynet:escuchar', fn)
    return () => ipcRenderer.off('skynet:escuchar', fn)
  },
  alCambiarWakeWord(callback) {
    const fn = (_e, activo) => callback(activo)
    ipcRenderer.on('skynet:wake-word', fn)
    return () => ipcRenderer.off('skynet:wake-word', fn)
  },

  // ── Avisos hacia el proceso principal ─────────────────────────────────────
  reportarEstado(estado) {
    ipcRenderer.send('skynet:estado', String(estado))
  },
  abrirPanel(ruta) {
    ipcRenderer.send('skynet:abrir-panel', typeof ruta === 'string' ? ruta : '/')
  },
  sesionCaducada() {
    ipcRenderer.send('skynet:sesion-caducada')
  },

  diagnostico() {
    return ipcRenderer.invoke('skynet:diagnostico')
  },

  /**
   * Devuelve una URL `blob:` con el modelo de voz, o null si no está instalado.
   *
   * ── Por qué un blob y no la ruta del archivo ──────────────────────────────
   * El panel se sirve por http (es la misma app web de siempre), y desde un
   * origen http el navegador BLOQUEA cualquier `fetch('file://…')`. Registrar
   * un protocolo propio en el proceso principal funcionaría, pero obliga a
   * gestionar CORS a mano para un archivo que ya está en disco local.
   *
   * Leerlo aquí es más simple y más seguro: el preload corre en el mismo
   * proceso que el renderer, así que no hay copia por IPC de los 40 MB, y lo
   * que cruza el puente es una cadena. La ruta la decide `config.js`, nunca
   * quien llama.
   *
   * Se lee una sola vez y se memoriza: `createModel` puede reintentar, y
   * releer 40 MB del disco en cada intento es tiempo perdido.
   */
  urlModelo: (() => {
    let cache
    return () => {
      if (cache !== undefined) return cache
      if (!ajustes.hayModelo || !ajustes.rutaModelo) {
        cache = null
        return cache
      }
      try {
        const datos = fs.readFileSync(ajustes.rutaModelo)
        cache = URL.createObjectURL(new Blob([datos], { type: 'application/gzip' }))
      } catch {
        cache = null
      }
      return cache
    }
  })(),
})
