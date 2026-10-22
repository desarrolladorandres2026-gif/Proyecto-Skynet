import { wpRequest } from './wp.client.js'
import { prepararContenido } from './html.js'
import { ErrorValidacion, ErrorNoEncontrado } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

// Avisos al público = ventanas emergentes (popups) de Popup Maker, que es lo
// que el sitio ya usa ("Promoción principal"). Un popup se ve en el sitio
// cuando está publicado Y activado (`enabled`); sus disparadores y
// condiciones (cuándo y dónde aparece) viven en `settings`.
//
// Un aviso nuevo NO inventa esos ajustes: copia los de un aviso existente
// (la "plantilla"), así aparece con el mismo comportamiento que ya funciona en
// el sitio. Nace siempre como borrador y desactivado.

const CAMPOS = 'id,date,modified,status,title,content,enabled,settings,link'

function aAviso(p) {
  return {
    id: p.id,
    titulo: p.title?.raw ?? p.title?.rendered ?? '',
    contenido: p.content?.raw ?? '',
    estado: p.status,
    activo: Boolean(p.enabled),
    // Visible de verdad = publicado y activado.
    visible: p.status === 'publish' && Boolean(p.enabled),
    modificado: p.modified,
  }
}

export async function listarAvisos() {
  const { data } = await wpRequest('GET', '/wp/v2/popups', {
    query: { context: 'edit', status: 'publish,draft', per_page: 50, orderby: 'modified', order: 'desc', _fields: CAMPOS },
  })
  return { avisos: data.map(aAviso) }
}

export async function obtenerAviso(id) {
  const { data } = await wpRequest('GET', `/wp/v2/popups/${id}`, { query: { context: 'edit', _fields: CAMPOS } })
  return aAviso(data)
}

function validarTitulo(titulo) {
  const t = String(titulo ?? '').trim()
  if (!t) throw new ErrorValidacion('El título es obligatorio')
  if (t.length > 120) throw new ErrorValidacion('El título no puede superar 120 caracteres')
  return t
}

// `plantillaId` opcional: por defecto, el aviso publicado más reciente.
export async function crearAviso({ titulo, contenido, plantillaId }, admin, ip) {
  const nombre = validarTitulo(titulo)

  let plantilla
  if (plantillaId !== undefined && plantillaId !== null) {
    if (!Number.isInteger(plantillaId)) throw new ErrorValidacion('La plantilla seleccionada no es válida')
    plantilla = (await wpRequest('GET', `/wp/v2/popups/${plantillaId}`, { query: { context: 'edit', _fields: CAMPOS } })).data
  } else {
    const { data } = await wpRequest('GET', '/wp/v2/popups', {
      query: { context: 'edit', status: 'publish', per_page: 1, orderby: 'modified', order: 'desc', _fields: CAMPOS },
    })
    plantilla = data[0]
  }
  if (!plantilla?.settings) {
    throw new ErrorNoEncontrado('No hay un aviso de referencia en el sitio para copiar sus ajustes. Crea uno primero en WordPress.')
  }

  const { data } = await wpRequest('POST', '/wp/v2/popups', {
    body: {
      title: nombre,
      content: prepararContenido(contenido ?? ''),
      status: 'draft',
      enabled: false,
      settings: plantilla.settings,
    },
    query: { context: 'edit', _fields: CAMPOS },
  })
  await registrarAuditoria({
    usuario: admin,
    accion: 'crear',
    modulo: 'sitio_web',
    entidad: 'aviso',
    descripcion: `Creó el aviso #${data.id} "${nombre}" en el sitio web (borrador)`,
    ip,
  })
  return aAviso(data)
}

export async function actualizarAviso(id, { titulo, contenido, activo, estado }, admin, ip) {
  const cuerpo = {}
  if (titulo !== undefined) cuerpo.title = validarTitulo(titulo)
  if (contenido !== undefined) cuerpo.content = prepararContenido(contenido)
  if (activo !== undefined) cuerpo.enabled = Boolean(activo)
  if (estado !== undefined) {
    if (!['draft', 'publish'].includes(estado)) throw new ErrorValidacion('El estado debe ser "draft" o "publish"')
    cuerpo.status = estado
  }
  if (!Object.keys(cuerpo).length) throw new ErrorValidacion('No hay cambios para guardar')

  const { data } = await wpRequest('POST', `/wp/v2/popups/${id}`, { body: cuerpo, query: { context: 'edit', _fields: CAMPOS } })
  const aviso = aAviso(data)
  await registrarAuditoria({
    usuario: admin,
    accion: 'actualizar',
    modulo: 'sitio_web',
    entidad: 'aviso',
    descripcion: `Modificó el aviso #${id} del sitio web${cuerpo.enabled !== undefined || cuerpo.status ? (aviso.visible ? ' (ahora visible)' : ' (ahora oculto)') : ''}`,
    cambios: { campos: Object.keys(cuerpo) },
    ip,
  })
  return aviso
}

export async function eliminarAviso(id, admin, ip) {
  await wpRequest('DELETE', `/wp/v2/popups/${id}`, { query: { force: 'false' } })
  await registrarAuditoria({
    usuario: admin,
    accion: 'eliminar',
    modulo: 'sitio_web',
    entidad: 'aviso',
    descripcion: `Envió a la papelera el aviso #${id} del sitio web`,
    ip,
  })
}
