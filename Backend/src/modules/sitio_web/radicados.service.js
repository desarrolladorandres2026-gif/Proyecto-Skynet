import { createHash } from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { env } from '../../config/env.js'
import { wpRequest } from './wp.client.js'
import { esSpamProbable } from './radicados.spam.js'
import { ErrorNoEncontrado, ErrorValidacion } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { enviarEmailRespuestaRadicado } from '../../utils/email.js'
import RespuestaRadicado from '../../models/RespuestaRadicado.js'
import Usuario from '../../models/Usuario.js'

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
    posibleSpam: esSpamProbable(aResumen(r.resumen)),
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

// Constancia de Skynet (quién, cuándo y estado del correo) de una respuesta, tal
// como la ve la pantalla. null si es anterior a este registro.
function aConstancia(reg) {
  if (!reg) return null
  return {
    id: String(reg._id),
    respondidoPor: reg.respondidoPor?.nombre || reg.respondidoPor?.nombreUsuario || '',
    nombreUsuario: reg.respondidoPor?.nombreUsuario || '',
    fecha: reg.creadoEn,
    correo: {
      destinatario: reg.correo?.destinatario || '',
      estado: reg.correo?.estado || 'sin_correo',
      enviadoEn: reg.correo?.enviadoEn || null,
      adjuntoIncluido: reg.correo?.adjuntoIncluido === true,
      error: reg.correo?.estado === 'fallido' ? reg.correo?.error || '' : '',
    },
  }
}

export async function obtenerRadicado(id) {
  const { data } = await wpRequest('GET', `/skynet/v1/radicados/${id}`)
  // La constancia es un extra: si Mongo falla, el radicado se sigue viendo.
  const constancias = new Map()
  try {
    for (const reg of await RespuestaRadicado.find({ radicadoId: id }).lean()) constancias.set(reg.wpRespuestaId, reg)
  } catch (err) {
    console.error(`No se pudo leer el registro de respuestas del radicado #${id}:`, err.message)
  }
  return {
    ...aRadicado(data),
    ip: data.ip || '',
    navegador: data.navegador || '',
    correoRespuesta: correoDelSolicitante(data),
    campos: (data.campos || []).map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, valor: c.valor, adjunto: esAdjuntoDelSitio(c.valor) })),
    respuestas: (data.respuestas || []).map((r) => ({
      id: r.id,
      nota: r.nota,
      archivoUrl: r.archivoUrl,
      archivoNombre: r.archivoNombre,
      autor: r.autor,
      fecha: r.fecha,
      constancia: aConstancia(constancias.get(r.id)),
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

const EMAIL_VALIDO = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/

// A quién se le responde: el formulario lo arma el Terminal desde el editor de
// WordPress, así que el correo se busca por la etiqueta del campo. Solo se
// acepta una dirección bien formada; cualquier otra cosa cuenta como "sin correo".
export function correoDelSolicitante(radicado) {
  const candidatos = [
    radicado?.resumen?.correo,
    ...(radicado?.campos || []).filter((c) => /correo|e-?mail/iu.test(c.etiqueta || '')).map((c) => c.valor),
  ]
  for (const candidato of candidatos) {
    const correo = String(candidato ?? '').trim()
    if (correo.length <= 254 && EMAIL_VALIDO.test(correo)) return correo.toLowerCase()
  }
  return ''
}

const mensajeDeError = (err) => String(err?.message || err || 'Error desconocido').slice(0, 300)

// Envía la respuesta por correo y deja el resultado en la constancia. Nunca
// lanza: la respuesta ya es pública, y un fallo de SMTP se refleja en el estado
// del registro (y se puede reenviar), no como error de la petición.
async function enviarCorreoYRegistrar(registro, { radicado, adjunto, archivoNombre, archivoUrl }) {
  const destinatario = registro.correo?.destinatario
  if (!destinatario) return registro

  let resultado
  try {
    const { messageId } = await enviarEmailRespuestaRadicado({
      to: destinatario,
      solicitante: radicado.resumen?.solicitante,
      radicado: radicado.radicado,
      asunto: radicado.resumen?.asunto,
      nota: registro.nota,
      adjunto,
      archivoNombre,
      archivoUrl,
    })
    resultado = { destinatario, estado: 'enviado', enviadoEn: new Date(), messageId, error: '', adjuntoIncluido: Boolean(adjunto) }
  } catch (err) {
    console.error(`No se pudo enviar por correo la respuesta del radicado #${registro.radicadoId}:`, err.message)
    resultado = { destinatario, estado: 'fallido', error: mensajeDeError(err) }
  }

  const sets = Object.fromEntries(Object.entries(resultado).map(([k, v]) => [`correo.${k}`, v]))
  try {
    return await RespuestaRadicado.findByIdAndUpdate(registro._id, { $set: sets, $inc: { 'correo.intentos': 1 } }, { new: true })
  } catch (err) {
    console.error('El correo se procesó, pero no se pudo guardar su estado en la constancia:', err.message)
    return { ...registro, correo: { ...registro.correo, ...resultado } }
  }
}

function avisoDeCorreo(correo) {
  if (correo.estado === 'sin_correo') return 'La respuesta se publicó, pero la solicitud no trae un correo válido: no se pudo enviar por correo.'
  if (correo.estado === 'fallido') {
    return `La respuesta se publicó, pero NO se pudo enviar el correo a ${correo.destinatario}. Reenvíalo desde el registro de la respuesta.`
  }
  return ''
}

// Respuesta oficial al ciudadano: una nota y/o un PDF que WordPress muestra en
// la consulta pública por número de radicado, y que además se envía por correo
// a quien hizo la petición (su constancia de que se le respondió). El PDF se
// valida por su contenido real (no por la extensión que declare el navegador).
export async function responderRadicado(id, { nota, enviarCorreo = true }, archivo, admin, ip) {
  const texto = String(nota ?? '').trim()
  if (texto.length > MAX_NOTA_RESPUESTA) throw new ErrorValidacion(`La nota no puede superar ${MAX_NOTA_RESPUESTA} caracteres`)
  if (!texto && !archivo) throw new ErrorValidacion('Escribe una nota o adjunta un PDF')

  const formulario = new FormData()
  formulario.append('nota', texto)
  formulario.append('autor', admin.nombre_usuario || '')
  let nombrePdf = ''
  if (archivo) {
    const tipo = await fileTypeFromBuffer(archivo.buffer)
    if (tipo?.mime !== 'application/pdf') throw new ErrorValidacion('El archivo debe ser un PDF')
    const nombre = String(archivo.originalname || 'respuesta.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 120)
    nombrePdf = nombre.toLowerCase().endsWith('.pdf') ? nombre : `${nombre}.pdf`
    formulario.append('archivo', new Blob([archivo.buffer], { type: 'application/pdf' }), nombrePdf)
  }

  // Se lee el radicado ANTES de publicar: de ahí salen el correo y el nombre del
  // solicitante, y si ya no existe se falla sin haber publicado nada.
  const { data: wpRadicado } = await wpRequest('GET', `/skynet/v1/radicados/${id}`)

  const { data } = await wpRequest('POST', `/skynet/v1/radicados/${id}/respuesta`, { body: formulario })
  await registrarAuditoria({
    usuario: admin,
    accion: 'crear',
    modulo: 'sitio_web',
    entidad: 'radicado',
    descripcion: `Respondió el radicado ${wpRadicado.radicado || `#${id}`} del sitio web${archivo ? ' con un PDF adjunto' : ''}`,
    ip,
  })

  // La respuesta ya es pública: nada de lo que sigue (constancia, correo,
  // estado) devuelve un error, porque quien reintentara publicaría la
  // respuesta dos veces. Cada fallo se avisa aparte.
  const resultado = { respuesta: { id: data.id, nota: data.nota, archivoUrl: data.archivoUrl, archivoNombre: data.archivoNombre } }

  const destinatario = correoDelSolicitante(wpRadicado)
  let registro
  try {
    const usuario = await Usuario.findById(admin.id_usuario).select('nombre').lean()
    registro = await RespuestaRadicado.create({
      radicadoId: id,
      radicado: wpRadicado.radicado,
      wpRespuestaId: data.id,
      nota: texto,
      archivo: archivo
        ? { nombre: data.archivoNombre || nombrePdf, url: data.archivoUrl, tamano: archivo.buffer.length, sha256: createHash('sha256').update(archivo.buffer).digest('hex') }
        : undefined,
      respondidoPor: { usuario: admin.id_usuario, nombreUsuario: admin.nombre_usuario, nombre: usuario?.nombre },
      ip,
      correo: { destinatario: destinatario || undefined, estado: !destinatario ? 'sin_correo' : enviarCorreo ? 'fallido' : 'no_enviado', error: destinatario && enviarCorreo ? 'El envío no se completó' : '' },
    })
  } catch (err) {
    console.error(`Respuesta publicada en el radicado #${id}, pero no se pudo guardar la constancia:`, err.message)
    resultado.avisoCorreo = 'La respuesta se publicó, pero no se pudo guardar su constancia ni enviar el correo. Avisa a soporte.'
  }

  if (registro && enviarCorreo) {
    const final = await enviarCorreoYRegistrar(registro, {
      radicado: wpRadicado,
      adjunto: archivo ? { nombre: nombrePdf, contenido: archivo.buffer } : undefined,
      archivoNombre: data.archivoNombre || nombrePdf,
      archivoUrl: data.archivoUrl,
    })
    resultado.constancia = aConstancia(final)
    const aviso = avisoDeCorreo(resultado.constancia.correo)
    if (aviso) resultado.avisoCorreo = aviso
  } else if (registro) {
    // Quien respondió decidió no enviar el correo: queda constancia de eso y se puede enviar después.
    resultado.constancia = aConstancia(registro.toObject())
  }

  // Responder resuelve el radicado: pasa a tramitado sin que nadie lo marque a mano.
  try {
    resultado.estado = (await cambiarEstadoRadicado(id, 'tramitado', admin, ip)).estado
  } catch (err) {
    console.error(`Respuesta publicada en el radicado #${id}, pero no se pudo marcar tramitado:`, err.message)
    resultado.avisoEstado = 'La respuesta se publicó, pero no se pudo marcar el radicado como tramitado. Cámbialo a mano.'
  }
  return resultado
}

// Descarga el PDF ya publicado para volver a adjuntarlo. Solo desde la carpeta
// de subidas del propio sitio; si falla, el correo sale igual con el enlace.
async function descargarPdfPublicado(url) {
  if (!url || !esAdjuntoDelSitio(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > TAMANO_MAXIMO_PDF || (await fileTypeFromBuffer(buffer))?.mime !== 'application/pdf') return null
    return buffer
  } catch {
    return null
  }
}

// Vuelve a mandar al solicitante el correo de una respuesta ya publicada
// (típicamente porque el envío falló). Usa el correo guardado en la constancia
// y, si el radicado no tenía, el que tenga ahora.
export async function reenviarCorreoRespuesta(radicadoId, constanciaId, admin, ip) {
  if (!/^[0-9a-f]{24}$/i.test(String(constanciaId))) throw new ErrorValidacion('La respuesta indicada no es válida')
  const registro = await RespuestaRadicado.findOne({ _id: constanciaId, radicadoId })
  if (!registro) throw new ErrorNoEncontrado('No hay registro de esa respuesta')

  const { data: wpRadicado } = await wpRequest('GET', `/skynet/v1/radicados/${radicadoId}`)
  const destinatario = registro.correo?.destinatario || correoDelSolicitante(wpRadicado)
  if (!destinatario) throw new ErrorValidacion('La solicitud no trae un correo válido al cual enviar la respuesta')
  registro.correo.destinatario = destinatario

  const pdf = await descargarPdfPublicado(registro.archivo?.url)
  const intacto = pdf && (!registro.archivo?.sha256 || createHash('sha256').update(pdf).digest('hex') === registro.archivo.sha256)
  const final = await enviarCorreoYRegistrar(registro.toObject(), {
    radicado: wpRadicado,
    adjunto: intacto ? { nombre: registro.archivo.nombre || 'respuesta.pdf', contenido: pdf } : undefined,
    archivoNombre: registro.archivo?.nombre,
    archivoUrl: registro.archivo?.url,
  })
  const constancia = aConstancia(final)
  await registrarAuditoria({
    usuario: admin,
    accion: 'actualizar',
    modulo: 'sitio_web',
    entidad: 'radicado',
    descripcion: `Reenvió por correo la respuesta del radicado ${wpRadicado.radicado || `#${radicadoId}`} (${constancia.correo.estado})`,
    ip,
  })
  return { constancia, ...(avisoDeCorreo(constancia.correo) ? { avisoCorreo: avisoDeCorreo(constancia.correo) } : {}) }
}

export async function eliminarRadicado(id, admin, ip) {
  const ruta = `/skynet/v1/radicados/${id}`
  try {
    await wpRequest('DELETE', ruta)
  } catch (err) {
    // Muchos firewalls/hostings de WordPress bloquean el método DELETE y
    // responden 403/5xx (que llega aquí como 502). WordPress acepta el mismo
    // borrado como POST con _method=DELETE; si el primer intento ya lo había
    // borrado, el reintento da 404 y se da por hecho.
    if (err?.status !== 502) throw err
    try {
      await wpRequest('POST', ruta, { query: { _method: 'DELETE' } })
    } catch (err2) {
      if (err2?.status !== 404) throw err2
    }
  }
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
