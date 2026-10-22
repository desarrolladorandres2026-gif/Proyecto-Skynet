import { wpRequest } from './wp.client.js'
import RegistroAuditoria from '../../models/RegistroAuditoria.js'

// Pantalla de inicio del módulo. Cada bloque se pide por separado y un fallo
// no tumba a los demás: si el calendario de eventos no responde, el resto del
// resumen se sigue mostrando y ese bloque llega en null.

const total = async (ruta, query) => (await wpRequest('GET', ruta, { query: { ...query, per_page: 1, _fields: 'id' } })).total

async function conexion() {
  const { data } = await wpRequest('GET', '/wp/v2/users/me', { query: { context: 'edit', _fields: 'name,roles' } })
  return { ok: true, usuario: data.name, roles: data.roles }
}

async function noticias() {
  const [publicadas, borradores, programadas] = await Promise.all(
    ['publish', 'draft', 'future'].map((status) => total('/wp/v2/posts', { status, context: 'edit' })),
  )
  return { publicadas, borradores, programadas }
}

async function eventos() {
  const [publicados, borradores] = await Promise.all(
    ['publish', 'draft'].map((status) => total('/wp/v2/tribe_events', { status, context: 'edit' })),
  )
  return { publicados, borradores }
}

async function avisos() {
  const { data } = await wpRequest('GET', '/wp/v2/popups', {
    query: { context: 'edit', status: 'publish,draft', per_page: 50, _fields: 'id,status,enabled' },
  })
  return { total: data.length, visibles: data.filter((a) => a.status === 'publish' && a.enabled).length }
}

async function medios() {
  return { total: await total('/wp/v2/media', { media_type: 'image' }) }
}

async function recientes() {
  const { data } = await wpRequest('GET', '/wp/v2/posts', {
    query: { context: 'edit', status: 'publish,draft,future', per_page: 5, orderby: 'modified', order: 'desc', _fields: 'id,title,status,modified' },
  })
  return data.map((p) => ({ id: p.id, titulo: p.title?.raw ?? '', estado: p.status, modificada: p.modified }))
}

async function actividad() {
  const registros = await RegistroAuditoria.find({ modulo: 'sitio_web' }).sort({ creadoEn: -1 }).limit(8).lean()
  return registros.map((r) => ({
    id: String(r._id),
    usuario: r.usuarioNombre,
    accion: r.accion,
    descripcion: r.descripcion,
    fecha: r.creadoEn,
  }))
}

export async function obtenerResumen() {
  const bloques = { conexion, noticias, eventos, avisos, medios, recientes, actividad }
  const claves = Object.keys(bloques)
  const resultados = await Promise.allSettled(claves.map((k) => bloques[k]()))

  const resumen = {}
  claves.forEach((k, i) => {
    resumen[k] = resultados[i].status === 'fulfilled' ? resultados[i].value : null
  })
  // La conexión es el diagnóstico: si falla, se dice por qué en lugar de dejar
  // solo un bloque vacío.
  if (!resumen.conexion) {
    const razon = resultados[0].reason
    resumen.conexion = { ok: false, error: razon?.message || 'No se pudo conectar con el sitio web' }
  }
  return resumen
}
