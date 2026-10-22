import { wpRequest } from './wp.client.js'
import { prepararContenido } from './html.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

// Eventos = The Events Calendar (API tribe/events/v1). Igual que las noticias,
// WordPress es la fuente de verdad y Skynet escribe a través de su API.
//
// Las fechas viajan como "YYYY-MM-DD HH:mm:ss" en la zona horaria del sitio
// (la del Terminal): el calendario las interpreta así y no se convierten aquí,
// para que un evento de las 8:00 no se muestre a las 13:00.

const ESTADOS_ESCRIBIBLES = new Set(['draft', 'publish'])
const ESTADOS_LISTABLES = new Set(['draft', 'publish', 'future'])
const FECHA = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/

function aFechaTec(valor, campo) {
  if (typeof valor !== 'string' || !FECHA.test(valor)) throw new ErrorValidacion(`${campo} no es una fecha válida`)
  const limpia = valor.replace('T', ' ')
  return limpia.length === 16 ? `${limpia}:00` : limpia
}

function aEvento(e) {
  return {
    id: e.id,
    titulo: e.title || '',
    descripcion: e.description || '',
    inicio: e.start_date,
    fin: e.end_date,
    todoElDia: Boolean(e.all_day),
    estado: e.status,
    enlace: e.url,
    costo: e.cost || '',
    sitioWeb: e.website || '',
    imagenId: e.image?.id || null,
    imagenUrl: e.image?.sizes?.medium_large?.url || e.image?.url || null,
    sedeId: e.venue?.id || null,
    sede: e.venue?.venue || null,
  }
}

// El listado de la API del calendario (tribe/events/v1) no sirve para
// administrar: no devuelve borradores ni eventos sin fechas válidas (en este
// sitio devuelve 0 aunque existan eventos publicados). Por eso la lista sale del
// endpoint estándar de WordPress (que sí filtra por estado, busca y pagina con
// totales) y el detalle de cada evento —fechas, sede, imagen— se pide al
// calendario. Si el detalle de uno falla, el evento igual aparece, sin fechas.
export async function listarEventos({ page = 1, limit = 12, buscar, estado } = {}) {
  const { data, total, totalPaginas } = await wpRequest('GET', '/wp/v2/tribe_events', {
    query: {
      context: 'edit',
      status: ESTADOS_LISTABLES.has(estado) ? estado : 'publish,draft,future',
      page,
      per_page: limit,
      search: buscar,
      orderby: 'date',
      order: 'desc',
      _fields: 'id,status,title',
    },
  })
  const eventos = await Promise.all(
    data.map(async (p) => {
      try {
        return aEvento((await wpRequest('GET', `/tribe/events/v1/events/${p.id}`)).data)
      } catch {
        return aEvento({ id: p.id, title: p.title?.raw ?? '', status: p.status })
      }
    }),
  )
  eventos.sort((a, b) => String(b.inicio || '').localeCompare(String(a.inicio || '')))
  return { eventos, total, totalPaginas }
}

export async function obtenerEvento(id) {
  const { data } = await wpRequest('GET', `/tribe/events/v1/events/${id}`)
  return aEvento(data)
}

export async function listarSedes() {
  const { data } = await wpRequest('GET', '/tribe/events/v1/venues', { query: { per_page: 100 } })
  return (data.venues || []).map((v) => ({ id: v.id, nombre: v.venue }))
}

function armarCuerpo({ titulo, descripcion, inicio, fin, todoElDia, estado, costo, sitioWeb, imagenId, sedeId }, { creando }) {
  const cuerpo = {}
  if (titulo !== undefined || creando) {
    const t = String(titulo ?? '').trim()
    if (!t) throw new ErrorValidacion('El título es obligatorio')
    if (t.length > 200) throw new ErrorValidacion('El título no puede superar 200 caracteres')
    cuerpo.title = t
  }
  if (descripcion !== undefined) cuerpo.description = prepararContenido(descripcion)
  if (inicio !== undefined || creando) cuerpo.start_date = aFechaTec(inicio, 'La fecha de inicio')
  if (fin !== undefined || creando) cuerpo.end_date = aFechaTec(fin, 'La fecha de fin')
  if (cuerpo.start_date && cuerpo.end_date && cuerpo.end_date < cuerpo.start_date) {
    throw new ErrorValidacion('El evento no puede terminar antes de empezar')
  }
  if (todoElDia !== undefined) cuerpo.all_day = Boolean(todoElDia)
  if (costo !== undefined) cuerpo.cost = String(costo).trim().slice(0, 60)
  if (sitioWeb !== undefined) {
    const url = String(sitioWeb).trim()
    if (url && !/^https?:\/\//i.test(url)) throw new ErrorValidacion('El sitio web debe empezar por http:// o https://')
    cuerpo.website = url
  }
  if (imagenId !== undefined) {
    if (imagenId !== null && !Number.isInteger(imagenId)) throw new ErrorValidacion('La imagen seleccionada no es válida')
    cuerpo.image = imagenId || ''
  }
  if (sedeId !== undefined) {
    if (sedeId !== null && !Number.isInteger(sedeId)) throw new ErrorValidacion('La sede seleccionada no es válida')
    cuerpo.venue = sedeId || ''
  }
  if (estado !== undefined) {
    if (!ESTADOS_ESCRIBIBLES.has(estado)) throw new ErrorValidacion('El estado debe ser "draft" (borrador) o "publish" (publicado)')
    cuerpo.status = estado
  }
  return cuerpo
}

export async function crearEvento(datos, admin, ip) {
  const cuerpo = armarCuerpo({ estado: 'draft', ...datos }, { creando: true })
  const { data } = await wpRequest('POST', '/tribe/events/v1/events', { body: cuerpo })
  await registrarAuditoria({
    usuario: admin,
    accion: 'crear',
    modulo: 'sitio_web',
    entidad: 'evento',
    descripcion: `Creó el evento #${data.id} "${cuerpo.title}" en el sitio web (${data.status})`,
    ip,
  })
  return aEvento(data)
}

export async function actualizarEvento(id, datos, admin, ip) {
  const cuerpo = armarCuerpo(datos, { creando: false })
  if (!Object.keys(cuerpo).length) throw new ErrorValidacion('No hay cambios para guardar')
  const { data } = await wpRequest('POST', `/tribe/events/v1/events/${id}`, { body: cuerpo })
  await registrarAuditoria({
    usuario: admin,
    accion: cuerpo.status === 'publish' ? 'publicar' : 'actualizar',
    modulo: 'sitio_web',
    entidad: 'evento',
    descripcion: `Modificó el evento #${id} del sitio web`,
    cambios: { campos: Object.keys(cuerpo) },
    ip,
  })
  return aEvento(data)
}

// A la papelera (trash), no borrado definitivo: restaurable desde WordPress.
export async function eliminarEvento(id, admin, ip) {
  await wpRequest('DELETE', `/tribe/events/v1/events/${id}`, { query: { trash: 'true' } })
  await registrarAuditoria({
    usuario: admin,
    accion: 'eliminar',
    modulo: 'sitio_web',
    entidad: 'evento',
    descripcion: `Envió a la papelera el evento #${id} del sitio web`,
    ip,
  })
}
