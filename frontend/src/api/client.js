import { comprimirSiEsImagen } from '../lib/imageCompression.js'

// Exportado (no solo usado internamente): requestBlob() y cualquier caller
// que necesite construir una URL de subrecurso directamente (p. ej. un
// <audio src>) sin pasar por fetch, lo necesitan para saber contra qué host
// apuntar.
export const BASE = import.meta.env.VITE_API_URL || '/api'

// El token de sesión vive en una cookie httpOnly puesta por el backend: este
// código JS nunca la lee ni la escribe (por diseño, para que un XSS no pueda
// robarla). "usuario" en localStorage es solo un dato NO sensible (nombre,
// rol, módulos) para pintar la UI al instante mientras se confirma /auth/me.
export function removeUsuarioLocal() {
  localStorage.removeItem('skynet_usuario')
}

// Comprime en el sitio cualquier File de imagen dentro de un FormData antes
// de subirlo (fotos de daños, evidencias, firmas, etc.). Centralizado acá en
// vez de en cada api/*.js para que aplique a toda subida sin tener que
// tocar cada punto de llamada por separado.
async function comprimirFormData(formData) {
  const entradas = Array.from(formData.entries())
  const tieneImagenes = entradas.some(([, v]) => v instanceof File && v.type?.startsWith('image/'))
  if (!tieneImagenes) return formData

  const nuevo = new FormData()
  for (const [clave, valor] of entradas) {
    nuevo.append(clave, valor instanceof File ? await comprimirSiEsImagen(valor) : valor)
  }
  return nuevo
}

// `fetch` no tiene timeout propio: sin uno, un backend que se cuelga (o un
// proxy que se queda pensando) deja la petición pendiente PARA SIEMPRE. La UI
// no tiene forma de distinguir eso de "está cargando, ya casi" — el botón
// queda en spinner infinito, sin error que mostrar y sin que la persona pueda
// reintentar sin recargar la pestaña entera. Ver BUG-013 en la auditoría
// 2026-08-13.
//
// 20s para peticiones normales; las que suben un archivo (FormData, ya
// comprimido en el sitio pero puede seguir pesando varios MB en una red de
// Terminal con señal mala) tienen más margen porque un timeout corto ahí
// cancelaría subidas legítimas, no solo las colgadas.
const TIMEOUT_MS_DEFECTO = 20_000
const TIMEOUT_MS_ARCHIVO = 60_000

// Combina dos AbortSignal en uno que se dispara cuando cualquiera de los dos
// lo hace. `AbortSignal.any()` haría esto nativo, pero no está disponible en
// jsdom (entorno de test) ni en los navegadores más viejos de las tablets con
// las que opera el Terminal — se evita depender de un método que puede faltar
// justo donde más importa.
function combinarSignals(a, b) {
  const controlador = new AbortController()
  const abortar = () => controlador.abort()
  if (a.aborted || b.aborted) {
    controlador.abort()
  } else {
    a.addEventListener('abort', abortar, { once: true })
    b.addEventListener('abort', abortar, { once: true })
  }
  return controlador.signal
}

// Compartidas por request() y requestConProgreso(): mismo efecto de un 401 y de
// un 503 de mantenimiento, sin importar si la petición salió por fetch o XHR.
function notificarSesionInvalida() {
  // Si había un usuario logueado, este 401 casi siempre es tokenVersion
  // desincronizado (un admin cambió su rol, permisos o contraseña) y no una
  // sesión que simplemente expiró sola: se lo señalamos a LoginPage.
  if (localStorage.getItem('skynet_usuario')) {
    sessionStorage.setItem('skynet_sesion_invalidada', '1')
  }
  removeUsuarioLocal()
  window.dispatchEvent(new Event('skynet:logout'))
}

function errorDeMantenimiento(data) {
  window.dispatchEvent(new CustomEvent('skynet:mantenimiento', { detail: data.estado || null }))
  const err = new Error(data?.error || 'La plataforma está en mantenimiento')
  // Se adjunta para que quien llame (p. ej. LoginPage) pueda reaccionar sin
  // tener que interpretar el texto del mensaje.
  err.mantenimiento = true
  err.estado = data.estado || null
  return err
}

export async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData
  if (isFormData) {
    options = { ...options, body: await comprimirFormData(options.body) }
  }

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...options.headers,
  }

  // AbortSignal.timeout() crea su propia señal que se dispara sola; si quien
  // llama ya trae un signal propio (para cancelar manualmente, p. ej. al
  // desmontar un componente), se combinan las dos — cualquiera de las dos
  // cancela la petición, sin que una pise a la otra.
  const timeoutMs = options.timeoutMs ?? (isFormData ? TIMEOUT_MS_ARCHIVO : TIMEOUT_MS_DEFECTO)
  const signalTimeout = AbortSignal.timeout(timeoutMs)
  const signal = options.signal ? combinarSignals(options.signal, signalTimeout) : signalTimeout

  // credentials:'include' hace que el navegador adjunte la cookie httpOnly de
  // sesión en cada petición (y acepte la que ponga el backend en /login).
  let res
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include', signal })
  } catch (err) {
    // AbortError con la señal DE TIMEOUT (no la que pasó quien llama, que
    // puede querer cancelar sin que eso cuente como fallo de red) se traduce
    // a un mensaje que la UI ya sabe mostrar en un toast, en vez de dejar
    // pasar el "AbortError" críptico de fetch.
    if (err.name === 'AbortError' && signalTimeout.aborted && !options.signal?.aborted) {
      throw new Error('La solicitud tardó demasiado. Verifica tu conexión e inténtalo de nuevo.')
    }
    throw err
  }

  // Un 401 significa que la cookie ya no es válida (expiró, se invalidó por un
  // reset de contraseña, o el usuario fue desactivado/eliminado): limpia el
  // estado local y notifica a la app para que redirija a /login.
  //
  // options.suppressAuthEvent evita esto para la comprobación anónima inicial
  // de /auth/me (sin sesión aún): antes se distinguía por "¿hay token en
  // localStorage?", pero el token ahora vive en una cookie httpOnly invisible
  // para este código. Sin la supresión, esa sonda inicial (que corre en
  // paralelo a un posible login manual) podría dispatchear skynet:logout y
  // borrar el usuario que el login manual acaba de establecer.
  if (res.status === 401 && !options.suppressAuthEvent) {
    notificarSesionInvalida()
  }

  const data = await res.json().catch(() => null)

  // Mantenimiento de plataforma: el backend responde 503 con
  // {mantenimiento: true, estado} en CUALQUIER endpoint bloqueado (y también
  // en /auth/login tras validar credenciales). Se avisa a toda la app con un
  // evento global para que la pantalla de mantenimiento aparezca de
  // inmediato, sin esperar al siguiente sondeo periódico.
  //
  // Se comprueba la bandera `mantenimiento` y no el status 503 a secas: un
  // 503 puede venir también de nginx o del propio VPS cuando el backend se
  // está reiniciando, y ese caso NO debe pintar una pantalla de mantenimiento
  // programado que nadie configuró.
  if (res.status === 503 && data?.mantenimiento === true) {
    throw errorDeMantenimiento(data)
  }

  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
  return data
}

// Variante de request() para subidas pesadas (hoy: archivos de video, ver
// api/videos.js), con dos diferencias que fetch no permite:
//  - Progreso: fetch no informa cuánto se ha enviado; XMLHttpRequest sí
//    (xhr.upload.onprogress), y sin una barra de avance una subida de 2 GB
//    parece colgada.
//  - Sin timeout total: request() corta a los 60 s cualquier FormData, lo que
//    haría imposible subir un video grande. Aquí solo se cancela si quien llama
//    lo pide (signal) o si se pierde la conexión.
// El resto (cookie de sesión, 401, mantenimiento, compresión de imágenes) se
// comporta igual que request().
export async function requestConProgreso(path, { method = 'POST', body, onProgreso, signal } = {}) {
  const cuerpo = body instanceof FormData ? await comprimirFormData(body) : body

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, `${BASE}${path}`)
    xhr.withCredentials = true

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgreso?.({ enviados: e.loaded, total: e.total })
    }

    xhr.onload = () => {
      let data = null
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        data = null
      }
      if (xhr.status === 401) notificarSesionInvalida()
      if (xhr.status === 503 && data?.mantenimiento === true) return reject(errorDeMantenimiento(data))
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data)
      // 413 sin JSON = lo cortó el proxy (nginx), no el backend.
      if (xhr.status === 413 && !data) {
        return reject(new Error('El servidor rechazó el archivo por su tamaño. Revisa client_max_body_size en la configuración de nginx.'))
      }
      reject(new Error(data?.error || `Error ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Se perdió la conexión durante la subida. Verifica tu red e inténtalo de nuevo.'))
    xhr.onabort = () => {
      const err = new Error('Subida cancelada')
      err.cancelada = true
      reject(err)
    }

    if (signal) {
      if (signal.aborted) return xhr.abort()
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(cuerpo)
  })
}

// Variante de request() para respuestas binarias (hoy: el audio WAV de un
// Aviso Terminal de Neiva — ver api/avisosTerminal.js). No puede reutilizar
// request() tal cual porque esa siempre hace res.json() sobre el cuerpo
// completo, y un .json() sobre bytes de audio revienta. Reimplementa el
// mismo timeout/cookie/mantenimiento que request() sobre el camino feliz;
// deliberadamente NO dispara skynet:logout en un 401 (a diferencia de
// request()) — un audio que no cargó por sesión vencida no debe cerrarle la
// sesión a alguien que sigue activo en otra pestaña, el próximo request()
// normal ya se encargará si de verdad expiró.
export async function requestBlob(path, options = {}) {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS_DEFECTO
  const signal = AbortSignal.timeout(timeoutMs)

  let res
  try {
    res = await fetch(`${BASE}${path}`, { ...options, credentials: 'include', signal })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('La solicitud tardó demasiado. Verifica tu conexión e inténtalo de nuevo.')
    }
    throw err
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    if (res.status === 503 && data?.mantenimiento === true) {
      window.dispatchEvent(new CustomEvent('skynet:mantenimiento', { detail: data.estado || null }))
    }
    throw new Error(data?.error || `Error ${res.status}`)
  }

  return res.blob()
}
