import { BASE, request, requestConProgreso } from './client.js'
import { invalidarCachePorPrefijo } from '../hooks/useDatosConCache.js'

// "Videos informativos": ver Backend/src/modules/videos. Lectura (destacado,
// historial, categorías) es universal; la gestión exige videos:gestionar.
// Toda mutación invalida la caché 'videos:' para que el inicio y el historial
// reflejen el cambio en la siguiente visita sin esperar el ttl.
function conInvalidacion(promesa) {
  return promesa.then((res) => {
    invalidarCachePorPrefijo('videos:')
    return res
  })
}

function aQuery(params) {
  const q = new URLSearchParams()
  for (const [clave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== '') q.set(clave, valor)
  }
  const texto = q.toString()
  return texto ? `?${texto}` : ''
}

// URL del archivo de un video subido al VPS (proveedor 'local'). Va directo en
// un <video src>: el navegador manda la cookie de sesión solo, y el backend
// responde por rangos para poder adelantar/retroceder. `v` cambia al
// reemplazar el archivo, así la caché del navegador nunca sirve el viejo.
export function urlArchivoVideo(video) {
  return `${BASE}/videos/${video.id}/archivo?v=${encodeURIComponent(video.archivoVersion || '')}`
}

export const videosApi = {
  destacado() {
    return request('/videos/destacado')
  },
  categorias() {
    return request('/videos/categorias')
  },
  listar({ page = 1, limit = 12, categoria, desde, hasta, orden, q } = {}) {
    return request(`/videos${aQuery({ page, limit, categoria, desde, hasta, orden, q })}`)
  },

  // Gestión. `datos` es un FormData (título, categoría, url o archivo de
  // video, miniatura...). Van por requestConProgreso, no por request(): un
  // archivo de video puede pesar gigas y necesita barra de avance y ningún
  // timeout total (ver client.js).
  listarGestion({ page = 1, limit = 20, q } = {}) {
    return request(`/videos/gestion${aQuery({ page, limit, q })}`)
  },
  crear(datos, { onProgreso, signal } = {}) {
    return conInvalidacion(requestConProgreso('/videos/gestion', { method: 'POST', body: datos, onProgreso, signal }))
  },
  actualizar(id, datos, { onProgreso, signal } = {}) {
    return conInvalidacion(requestConProgreso(`/videos/gestion/${id}`, { method: 'PUT', body: datos, onProgreso, signal }))
  },
  eliminar(id) {
    return conInvalidacion(request(`/videos/gestion/${id}`, { method: 'DELETE' }))
  },
}
