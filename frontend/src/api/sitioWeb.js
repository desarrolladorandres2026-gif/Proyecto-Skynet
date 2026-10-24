import { request, requestBlob } from './client.js'
import { invalidarCachePorPrefijo } from '../hooks/useDatosConCache.js'

// "Sitio web público": ver Backend/src/modules/sitio_web. Cada sección exige su
// permiso (noticias:gestionar, eventos:gestionar, publicaciones:gestionar).
// Toda mutación invalida la caché 'sitioweb:' para que listados y resumen
// reflejen el cambio en la siguiente visita sin esperar el ttl.
// `prefijo` acota qué se descarta: abrir o responder un radicado no debe
// tirar la caché de noticias, eventos o imágenes (cada una cuesta una ida y
// vuelta a WordPress al volver a pedirla).
function conInvalidacion(promesa, prefijo = 'sitioweb:') {
  return promesa.then((res) => {
    invalidarCachePorPrefijo(prefijo)
    return res
  })
}

const conInvalidacionRadicados = (promesa) => conInvalidacion(promesa, 'sitioweb:radicado')

function aQuery(params) {
  const q = new URLSearchParams()
  for (const [clave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== '') q.set(clave, valor)
  }
  const texto = q.toString()
  return texto ? `?${texto}` : ''
}

const json = (metodo, cuerpo) => ({ method: metodo, body: JSON.stringify(cuerpo) })

export const sitioWebApi = {
  resumen: () => request('/sitio-web/resumen'),

  // Medios: la imagen viaja como FormData (campo "archivo"); request() la
  // comprime en el navegador antes de enviarla.
  listarMedios: ({ page = 1, limit = 24, buscar } = {}) => request(`/sitio-web/medios${aQuery({ page, limit, buscar })}`),
  subirImagen(archivo, alt) {
    const datos = new FormData()
    datos.append('archivo', archivo)
    if (alt) datos.append('alt', alt)
    return conInvalidacion(request('/sitio-web/medios', { method: 'POST', body: datos }))
  },

  listarNoticias: ({ page = 1, limit = 20, buscar, estado, categoria } = {}) =>
    request(`/sitio-web/noticias${aQuery({ page, limit, buscar, estado, categoria })}`),
  categorias: () => request('/sitio-web/noticias/categorias'),
  crearNoticia: (datos) => conInvalidacion(request('/sitio-web/noticias', json('POST', datos))),
  actualizarNoticia: (id, datos) => conInvalidacion(request(`/sitio-web/noticias/${id}`, json('PUT', datos))),
  eliminarNoticia: (id) => conInvalidacion(request(`/sitio-web/noticias/${id}`, { method: 'DELETE' })),

  listarEventos: ({ page = 1, limit = 12, buscar, estado } = {}) => request(`/sitio-web/eventos${aQuery({ page, limit, buscar, estado })}`),
  sedes: () => request('/sitio-web/eventos/sedes'),
  crearEvento: (datos) => conInvalidacion(request('/sitio-web/eventos', json('POST', datos))),
  actualizarEvento: (id, datos) => conInvalidacion(request(`/sitio-web/eventos/${id}`, json('PUT', datos))),
  eliminarEvento: (id) => conInvalidacion(request(`/sitio-web/eventos/${id}`, { method: 'DELETE' })),

  // Radicados (PQRSF y demás formularios del sitio): permiso pqrs:gestionar.
  radicadosFormularios: () => request('/sitio-web/radicados/formularios'),
  listarRadicados: ({ page = 1, limit = 15, buscar, estado, formularioId } = {}) =>
    request(`/sitio-web/radicados${aQuery({ page, limit, buscar, estado, formularioId })}`),
  obtenerRadicado: (id) => request(`/sitio-web/radicados/${id}`),
  cambiarEstadoRadicado: (id, estado, { soloSiSinLeer = false } = {}) =>
    conInvalidacionRadicados(request(`/sitio-web/radicados/${id}/estado`, json('PUT', { estado, ...(soloSiSinLeer ? { soloSiSinLeer: true } : {}) }))),

  responderRadicado(id, { nota, archivo, marcarTramitado }) {
    const datos = new FormData()
    datos.append('nota', nota || '')
    datos.append('marcarTramitado', marcarTramitado ? 'true' : 'false')
    if (archivo) datos.append('archivo', archivo)
    return conInvalidacionRadicados(request(`/sitio-web/radicados/${id}/respuesta`, { method: 'POST', body: datos }))
  },
  eliminarRadicado: (id) => conInvalidacionRadicados(request(`/sitio-web/radicados/${id}`, { method: 'DELETE' })),
  exportarRadicados: ({ estado, formularioId } = {}) => requestBlob(`/sitio-web/radicados/exportar${aQuery({ estado, formularioId })}`, { timeoutMs: 60_000 }),

  listarAvisos: () => request('/sitio-web/avisos'),
  crearAviso: (datos) => conInvalidacion(request('/sitio-web/avisos', json('POST', datos))),
  actualizarAviso: (id, datos) => conInvalidacion(request(`/sitio-web/avisos/${id}`, json('PUT', datos))),
  eliminarAviso: (id) => conInvalidacion(request(`/sitio-web/avisos/${id}`, { method: 'DELETE' })),
}
