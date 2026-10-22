import { wpRequest } from './wp.client.js'
import { prepararContenido } from './html.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

// Auditoría: RegistroAuditoria.entidadId es un ObjectId de Mongo y el id de un
// post de WordPress es un entero, así que el id va en la descripción.
//
// Noticias = posts de WordPress. WordPress es la fuente de verdad: Skynet no
// las duplica en Mongo (habría dos copias que se desincronizan en cuanto
// alguien edite desde el panel de WP). Skynet lee y escribe a través de la API.

// Solo estos dos estados se pueden pedir desde Skynet. 'future' (programada)
// no se pide: lo asigna WordPress solo cuando 'publish' llega con fecha futura.
const ESTADOS_ESCRIBIBLES = new Set(['draft', 'publish'])
const ESTADOS_LISTABLES = new Set(['draft', 'publish', 'future'])
const CAMPOS = 'id,date,modified,status,title,excerpt,content,link,categories,featured_media,sticky,_links,_embedded'

function validarEstado(estado) {
  if (!ESTADOS_ESCRIBIBLES.has(estado)) {
    throw new ErrorValidacion('El estado debe ser "draft" (borrador) o "publish" (publicado)')
  }
}

// La fecha llega como "YYYY-MM-DDTHH:mm" en hora del Terminal (la que WordPress
// tiene configurada), sin zona: se reenvía tal cual para no correrla.
function validarFecha(fecha) {
  if (fecha === null || fecha === '') return null
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(fecha)) {
    throw new ErrorValidacion('La fecha de publicación no es válida')
  }
  return fecha
}

function imagenDe(post) {
  const medio = post._embedded?.['wp:featuredmedia']?.[0]
  if (!medio || medio.code) return null
  return medio.media_details?.sizes?.medium_large?.source_url || medio.media_details?.sizes?.medium?.source_url || medio.source_url || null
}

function aNoticia(post) {
  return {
    id: post.id,
    titulo: post.title?.raw ?? post.title?.rendered ?? '',
    extracto: post.excerpt?.raw ?? '',
    contenido: post.content?.raw ?? '',
    estado: post.status,
    fecha: post.date,
    modificada: post.modified,
    enlace: post.link,
    categorias: post.categories || [],
    imagenId: post.featured_media || null,
    imagenUrl: imagenDe(post),
    destacada: Boolean(post.sticky),
  }
}

export async function listarNoticias({ page = 1, limit = 20, buscar, estado, categoria } = {}) {
  const { data, total, totalPaginas } = await wpRequest('GET', '/wp/v2/posts', {
    query: {
      context: 'edit',
      status: ESTADOS_LISTABLES.has(estado) ? estado : 'publish,draft,future',
      page,
      per_page: limit,
      search: buscar,
      categories: categoria,
      _embed: 'wp:featuredmedia',
      _fields: CAMPOS,
    },
  })
  return { noticias: data.map(aNoticia), total, totalPaginas }
}

export async function obtenerNoticia(id) {
  const { data } = await wpRequest('GET', `/wp/v2/posts/${id}`, {
    query: { context: 'edit', _embed: 'wp:featuredmedia', _fields: CAMPOS },
  })
  return aNoticia(data)
}

export async function listarCategorias() {
  const { data } = await wpRequest('GET', '/wp/v2/categories', {
    query: { per_page: 100, hide_empty: 'false', _fields: 'id,name,count' },
  })
  return data
}

function armarCuerpo({ titulo, contenido, extracto, categorias, estado, imagenId, fechaPublicacion, destacada }) {
  const cuerpo = {}
  if (titulo !== undefined) {
    const t = String(titulo).trim()
    if (!t) throw new ErrorValidacion('El título es obligatorio')
    if (t.length > 200) throw new ErrorValidacion('El título no puede superar 200 caracteres')
    cuerpo.title = t
  }
  if (contenido !== undefined) cuerpo.content = prepararContenido(contenido)
  if (extracto !== undefined) cuerpo.excerpt = prepararContenido(extracto)
  if (categorias !== undefined) {
    if (!Array.isArray(categorias) || categorias.some((c) => !Number.isInteger(c))) {
      throw new ErrorValidacion('Las categorías deben ser una lista de identificadores numéricos')
    }
    cuerpo.categories = categorias
  }
  if (imagenId !== undefined) {
    if (imagenId !== null && !Number.isInteger(imagenId)) throw new ErrorValidacion('La imagen seleccionada no es válida')
    cuerpo.featured_media = imagenId || 0
  }
  if (estado !== undefined) {
    validarEstado(estado)
    cuerpo.status = estado
  }
  if (fechaPublicacion !== undefined) {
    const fecha = validarFecha(fechaPublicacion)
    if (fecha) cuerpo.date = fecha
  }
  if (destacada !== undefined) cuerpo.sticky = Boolean(destacada)
  return cuerpo
}

// Por defecto nace como borrador: publicar es una decisión explícita.
export async function crearNoticia(datos, admin, ip) {
  if (datos.titulo === undefined) throw new ErrorValidacion('El título es obligatorio')
  const cuerpo = armarCuerpo({ estado: 'draft', ...datos })
  const { data } = await wpRequest('POST', '/wp/v2/posts', {
    body: cuerpo,
    query: { context: 'edit', _embed: 'wp:featuredmedia', _fields: CAMPOS },
  })

  await registrarAuditoria({
    usuario: admin,
    accion: 'crear',
    modulo: 'sitio_web',
    entidad: 'noticia',
    descripcion: `Creó la noticia #${data.id} "${cuerpo.title}" en el sitio web (${data.status})`,
    ip,
  })
  return aNoticia(data)
}

export async function actualizarNoticia(id, datos, admin, ip) {
  const cuerpo = armarCuerpo(datos)
  if (!Object.keys(cuerpo).length) throw new ErrorValidacion('No hay cambios para guardar')
  const { data } = await wpRequest('POST', `/wp/v2/posts/${id}`, {
    body: cuerpo,
    query: { context: 'edit', _embed: 'wp:featuredmedia', _fields: CAMPOS },
  })

  await registrarAuditoria({
    usuario: admin,
    accion: cuerpo.status === 'publish' ? 'publicar' : 'actualizar',
    modulo: 'sitio_web',
    entidad: 'noticia',
    descripcion: `Modificó la noticia #${id} del sitio web`,
    cambios: { campos: Object.keys(cuerpo) },
    ip,
  })
  return aNoticia(data)
}

// A la papelera de WordPress (force=false), no borrado definitivo: desde el
// panel de WP se puede restaurar si fue un error.
export async function eliminarNoticia(id, admin, ip) {
  await wpRequest('DELETE', `/wp/v2/posts/${id}`, { query: { force: 'false' } })
  await registrarAuditoria({
    usuario: admin,
    accion: 'eliminar',
    modulo: 'sitio_web',
    entidad: 'noticia',
    descripcion: `Envió a la papelera la noticia #${id} del sitio web`,
    ip,
  })
}
