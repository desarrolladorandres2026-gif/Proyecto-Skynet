import { fileTypeFromBuffer } from 'file-type'
import { wpRequest } from './wp.client.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

// Biblioteca de medios de WordPress. Solo imágenes: es lo que el sitio usa en
// noticias, eventos y avisos. Se valida el CONTENIDO real del archivo (no el
// Content-Type que declara el navegador, que cualquiera puede falsear).
export const TAMANO_MAXIMO_IMAGEN = 8 * 1024 * 1024
const FORMATOS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])
const CAMPOS = 'id,date,title,alt_text,source_url,mime_type,media_details'

function aMedio(m) {
  const tamanos = m.media_details?.sizes || {}
  return {
    id: m.id,
    titulo: m.title?.raw ?? m.title?.rendered ?? '',
    alt: m.alt_text || '',
    url: m.source_url,
    miniatura: tamanos.medium?.source_url || tamanos.thumbnail?.source_url || m.source_url,
    ancho: m.media_details?.width || null,
    alto: m.media_details?.height || null,
    fecha: m.date,
  }
}

export async function listarMedios({ page = 1, limit = 24, buscar } = {}) {
  const { data, total, totalPaginas } = await wpRequest('GET', '/wp/v2/media', {
    query: { media_type: 'image', page, per_page: limit, search: buscar, orderby: 'date', order: 'desc', context: 'edit', _fields: CAMPOS },
  })
  return { medios: data.map(aMedio), total, totalPaginas }
}

// Nombre de archivo seguro: el original solo aporta una base legible; la
// extensión sale del contenido detectado, no de lo que diga el usuario.
// multer entrega originalname decodificado como latin1: un nombre UTF-8 con
// tildes llega como mojibake ("Ã‘andÃº"), así que primero se recodifica.
function nombreSeguro(original, ext) {
  const base = Buffer.from(String(original || 'imagen'), 'latin1')
    .toString('utf8')
    .replace(/\.[^.]*$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base || 'imagen'}.${ext}`
}

export async function subirMedio(archivo, { alt } = {}, admin, ip) {
  if (!archivo) throw new ErrorValidacion('Selecciona una imagen')
  const tipo = await fileTypeFromBuffer(archivo.buffer)
  if (!tipo || !FORMATOS.has(tipo.mime)) {
    throw new ErrorValidacion('Formato no compatible. Sube una imagen JPG, PNG, WebP o GIF.')
  }

  const nombre = nombreSeguro(archivo.originalname, FORMATOS.get(tipo.mime))
  const formulario = new FormData()
  formulario.append('file', new Blob([archivo.buffer], { type: tipo.mime }), nombre)
  if (alt) formulario.append('alt_text', String(alt).trim().slice(0, 200))

  const { data } = await wpRequest('POST', '/wp/v2/media', { body: formulario, query: { context: 'edit', _fields: CAMPOS } })
  await registrarAuditoria({
    usuario: admin,
    accion: 'crear',
    modulo: 'sitio_web',
    entidad: 'medio',
    descripcion: `Subió la imagen #${data.id} (${nombre}) a la biblioteca del sitio web`,
    ip,
  })
  return aMedio(data)
}
