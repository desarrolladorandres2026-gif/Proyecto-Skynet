import { fileTypeFromBuffer } from 'file-type'
import { env } from '../../config/env.js'
import { wpRequest } from './wp.client.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

// Radicados del sitio público (PQRSF, contacto, denuncias…): los formularios
// los crea y guarda el tema terminal-theme en WordPress ("Formularios
// Terminal"). Skynet los lee y cambia su estado a través del plugin puente
// `skynet-bridge` (deploy/wordpress/skynet-bridge), que expone /skynet/v1.
// Skynet NO crea ni borra radicados: el consecutivo TTN-AAAA-NNNN lo asigna
// siempre WordPress al recibir el formulario.

// WordPress habla en inglés (unread/read/processed); Skynet, en español.
const A_SKYNET = { unread: 'sin_leer', read: 'leido', processed: 'tramitado' }
const A_WORDPRESS = Object.fromEntries(Object.entries(A_SKYNET).map(([wp, sk]) => [sk, wp]))

// Object.hasOwn: 'constructor' o '__proto__' no son estados aunque existan en el prototipo.
const esEstado = (estado) => Object.hasOwn(A_WORDPRESS, estado)

export const ESTADOS_RADICADO = Object.keys(A_WORDPRESS)

const MENSAJE_SIN_PUENTE =
  'El sitio web no tiene instalado el plugin "Skynet Bridge". Instálalo en WordPress para gestionar los radicados desde Skynet'

// wpRequest traduce todo 404 a "el contenido ya no existe". En las rutas de
// listado un 404 solo puede significar que el plugin puente no está instalado.
async function pedirListado(ruta, query) {
  try {
    return await wpRequest('GET', ruta, { query })
  } catch (err) {
    if (err.status === 404) {
      err.message = MENSAJE_SIN_PUENTE
      err.status = 503
    }
    throw err
  }
}

function aResumen(r) {
  return {
    tipo: r?.tipo || '',
    asunto: r?.asunto || '',
    solicitante: r?.solicitante || '',
    correo: r?.correo || '',
  }
}

function aRadicado(r) {
  return {
    id: r.id,
    radicado: r.radicado,
    formulario: r.formulario,
    estado: A_SKYNET[r.estado] || r.estado,
    fecha: r.fecha,
    resumen: aResumen(r.resumen),
  }
}

export async function listarFormularios() {
  const { data } = await pedirListado('/skynet/v1/formularios')
  return {
    formularios: (data?.formularios || []).map((f) => ({
      id: f.id,
      titulo: f.titulo,
      total: f.total,
      sinLeer: f.sin_leer,
    })),
  }
}

export async function listarRadicados({ page, limit, formularioId, estado, buscar }) {
  if (estado && !esEstado(estado)) throw new ErrorValidacion('El estado no es válido')
  const { data } = await pedirListado('/skynet/v1/radicados', {
    page,
    per_page: limit,
    form_id: formularioId,
    estado: estado ? A_WORDPRESS[estado] : undefined,
    buscar,
  })
  return {
    radicados: (data?.items || []).map(aRadicado),
    total: data?.total || 0,
    totalPaginas: data?.totalPaginas || 1,
  }
}

// Un campo es "archivo adjunto" solo si apunta a la carpeta de subidas del
// propio sitio. Cualquier otro enlace que escriba el público en un campo de
// texto es solo texto: no debe verse como documento oficial.
function esAdjuntoDelSitio(valor) {
  try {
    const url = new URL(valor)
    return url.origin === new URL(env.WP_URL).origin && url.pathname.startsWith('/wp-content/uploads/')
  } catch {
    return false
  }
}

export async function obtenerRadicado(id) {
  const { data } = await wpRequest('GET', `/skynet/v1/radicados/${id}`)
  return {
    ...aRadicado(data),
    ip: data.ip || '',
    navegador: data.navegador || '',
    campos: (data.campos || []).map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, valor: c.valor, adjunto: esAdjuntoDelSitio(c.valor) })),
    respuestas: (data.respuestas || []).map((r) => ({
      id: r.id,
      nota: r.nota,
      archivoUrl: r.archivoUrl,
      archivoNombre: r.archivoNombre,
      autor: r.autor,
      fecha: r.fecha,
    })),
  }
}

// `soloSiSinLeer`: usado al abrir un radicado para marcarlo "leído". Si otra
// persona ya lo avanzó mientras la pantalla seguía abierta, no se retrocede:
// WordPress devuelve el estado que ya tenía y no se registra ningún cambio.
export async function cambiarEstadoRadicado(id, estado, admin, ip, { soloSiSinLeer = false } = {}) {
  if (!esEstado(estado)) throw new ErrorValidacion('El estado no es válido')
  const { data } = await wpRequest('POST', `/skynet/v1/radicados/${id}/estado`, {
    body: { estado: A_WORDPRESS[estado], ...(soloSiSinLeer ? { solo_si_sin_leer: true } : {}) },
  })
  const resultante = A_SKYNET[data.estado] || data.estado
  if (resultante === estado) {
    await registrarAuditoria({
      usuario: admin,
      accion: 'actualizar',
      modulo: 'sitio_web',
      entidad: 'radicado',
      descripcion: `Cambió el radicado #${id} del sitio web a "${estado}"`,
      cambios: { estado },
      ip,
    })
  }
  return { id: data.id, estado: resultante }
}

export const MAX_NOTA_RESPUESTA = 3000
export const TAMANO_MAXIMO_PDF = 10 * 1024 * 1024

// Respuesta oficial al ciudadano: una nota y/o un PDF que WordPress muestra en
// la consulta pública por número de radicado. El PDF se valida por su
// contenido real (no por la extensión que declare el navegador).
export async function responderRadicado(id, { nota, marcarTramitado }, archivo, admin, ip) {
  const texto = String(nota ?? '').trim()
  if (texto.length > MAX_NOTA_RESPUESTA) throw new ErrorValidacion(`La nota no puede superar ${MAX_NOTA_RESPUESTA} caracteres`)
  if (!texto && !archivo) throw new ErrorValidacion('Escribe una nota o adjunta un PDF')

  const formulario = new FormData()
  formulario.append('nota', texto)
  formulario.append('autor', admin.nombre_usuario || '')
  if (archivo) {
    const tipo = await fileTypeFromBuffer(archivo.buffer)
    if (tipo?.mime !== 'application/pdf') throw new ErrorValidacion('El archivo debe ser un PDF')
    const nombre = String(archivo.originalname || 'respuesta.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 120)
    formulario.append('archivo', new Blob([archivo.buffer], { type: 'application/pdf' }), nombre.toLowerCase().endsWith('.pdf') ? nombre : `${nombre}.pdf`)
  }

  const { data } = await wpRequest('POST', `/skynet/v1/radicados/${id}/respuesta`, { body: formulario })
  await registrarAuditoria({
    usuario: admin,
    accion: 'crear',
    modulo: 'sitio_web',
    entidad: 'radicado',
    descripcion: `Respondió el radicado #${id} del sitio web${archivo ? ' con un PDF adjunto' : ''}`,
    ip,
  })

  // La respuesta ya es pública: si marcar "tramitado" falla, no se devuelve
  // un error (quien reintentara publicaría la respuesta dos veces); se avisa
  // aparte para que cambie el estado a mano.
  const resultado = { respuesta: { id: data.id, nota: data.nota, archivoUrl: data.archivoUrl, archivoNombre: data.archivoNombre } }
  if (marcarTramitado) {
    try {
      resultado.estado = (await cambiarEstadoRadicado(id, 'tramitado', admin, ip)).estado
    } catch (err) {
      console.error(`Respuesta publicada en el radicado #${id}, pero no se pudo marcar tramitado:`, err.message)
      resultado.avisoEstado = 'La respuesta se publicó, pero no se pudo marcar el radicado como tramitado. Cámbialo a mano.'
    }
  }
  return resultado
}

export async function eliminarRadicado(id, admin, ip) {
  await wpRequest('DELETE', `/skynet/v1/radicados/${id}`)
  await registrarAuditoria({
    usuario: admin,
    accion: 'eliminar',
    modulo: 'sitio_web',
    entidad: 'radicado',
    descripcion: `Eliminó el radicado #${id} del sitio web`,
    ip,
  })
}

// Quien llena el formulario es el público: una celda que empiece con = + - @
// se ejecutaría como fórmula al abrir el CSV en Excel. El apóstrofo la vuelve
// texto.
function celdaCsv(valor) {
  let texto = String(valor ?? '')
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`
  return /[",\n\r;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

// CSV con BOM (Excel en español lo abre con tildes bien) y una columna por
// cada pregunta distinta de los formularios exportados.
export async function exportarRadicadosCsv({ formularioId, estado }) {
  if (estado && !esEstado(estado)) throw new ErrorValidacion('El estado no es válido')
  const { data } = await pedirListado('/skynet/v1/radicados/exportar', {
    form_id: formularioId,
    estado: estado ? A_WORDPRESS[estado] : undefined,
  })
  const items = data?.items || []
  const preguntas = [...new Set(items.flatMap((r) => (r.campos || []).map((c) => c.etiqueta)))]
  const fijas = ['Radicado', 'Formulario', 'Estado', 'Fecha', 'IP']

  const filas = [[...fijas, ...preguntas]]
  for (const r of items) {
    const porEtiqueta = new Map((r.campos || []).map((c) => [c.etiqueta, c.valor]))
    filas.push([r.radicado, r.formulario, ETIQUETA_ESTADO[A_SKYNET[r.estado]] || r.estado, r.fecha, r.ip, ...preguntas.map((p) => porEtiqueta.get(p) ?? '')])
  }
  return `\uFEFF${filas.map((fila) => fila.map(celdaCsv).join(';')).join('\r\n')}\r\n`
}

const ETIQUETA_ESTADO = { sin_leer: 'Sin leer', leido: 'Leído', tramitado: 'Tramitado' }
