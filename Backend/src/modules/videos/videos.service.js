import fsp from 'node:fs/promises'
import mongoose from 'mongoose'
import Video from '../../models/Video.js'
import { analizarUrlVideo } from '../../utils/videoUrl.js'
import { instanteLocal, inicioDelDia } from '../../utils/fechas.js'
import { escapeRegex } from '../../utils/regex.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { ErrorValidacion, ErrorNoEncontrado } from '../../utils/errores.js'
import { cloudinaryConfigurado, subirImagen, eliminarImagen } from '../../config/cloudinary.js'
import { datosArchivo, confirmarArchivoVideo, eliminarArchivoVideo } from './videos.almacenamiento.js'

// Días durante los cuales un video recién publicado lleva la marca "Nuevo".
export const DIAS_VIDEO_NUEVO = 7
const MS_POR_DIA = 24 * 60 * 60 * 1000
const CARPETA_MINIATURAS = 'skynet/videos'

// Documentos creados cuando existían estados y que quedaron sin publicar (ver
// el campo `estado` en models/Video.js): siguen ocultos hasta que se editen.
const OCULTOS_LEGADO = ['borrador', 'desactivado']
const esOcultoLegado = (v) => OCULTOS_LEGADO.includes(v.estado)

// ── Presentación ────────────────────────────────────────────────────────────
// El servidor entrega ya resuelto CÓMO se reproduce cada video (embedUrl) y
// qué miniatura usar: el frontend nunca arma un iframe a partir de una URL
// libre, solo de estos valores derivados de datos validados en el alta.
function embedUrlDe(v) {
  if (v.proveedor === 'youtube') return `https://www.youtube-nocookie.com/embed/${v.videoId}?rel=0&modestbranding=1`
  if (v.proveedor === 'vimeo') {
    const sufijo = v.videoHash ? `?h=${v.videoHash}` : ''
    return `https://player.vimeo.com/video/${v.videoId}${sufijo}`
  }
  if (v.proveedor === 'archivo') return v.url
  return null
}

function miniaturaUrlDe(v) {
  if (v.miniatura?.url) return v.miniatura.url
  if (v.proveedor === 'youtube') return `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
  return null
}

export function aVideoPublico(v, ahora = new Date()) {
  const publicadoEn = v.fechaPublicacion ? new Date(v.fechaPublicacion) : null
  const esNuevo =
    !esOcultoLegado(v) &&
    publicadoEn !== null &&
    publicadoEn <= ahora &&
    ahora.getTime() - publicadoEn.getTime() < DIAS_VIDEO_NUEVO * MS_POR_DIA
  return {
    id: String(v._id),
    titulo: v.titulo,
    descripcion: v.descripcion || '',
    categoria: v.categoria,
    proveedor: v.proveedor,
    url: v.url,
    embedUrl: embedUrlDe(v),
    miniaturaUrl: miniaturaUrlDe(v),
    fechaPublicacion: publicadoEn,
    esNuevo,
    // Solo videos subidos al VPS: el frontend arma con esto la URL del archivo
    // (/api/videos/:id/archivo?v=...). Cambia al reemplazar el archivo, así que
    // sirve también para invalidar la caché del navegador.
    archivoVersion: v.proveedor === 'local' ? (v.archivo?.nombre || '').split('.')[0] : null,
  }
}

// Vista administrativa: lo público + programación, autoría y si la miniatura es
// propia (subida) o derivada, para que el formulario sepa si puede "quitarla".
export function aVideoGestion(v, ahora = new Date()) {
  return {
    ...aVideoPublico(v, ahora),
    programado: Boolean(v.fechaPublicacion) && new Date(v.fechaPublicacion) > ahora,
    ocultoLegado: esOcultoLegado(v),
    tieneMiniaturaPropia: Boolean(v.miniatura?.url),
    archivoNombreOriginal: v.archivo?.nombreOriginal || null,
    archivoTamano: v.archivo?.tamano ?? null,
    creadoPor: v.creadoPor?.nombre || '',
    actualizadoPor: v.actualizadoPor?.nombre || '',
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  }
}

// ── Consultas del trabajador ────────────────────────────────────────────────
// ÚNICO lugar que define "visible para un trabajador": fecha de publicación ya
// alcanzada. Tanto el destacado como el historial pasan por aquí, así que uno
// programado a futuro no puede colarse por una de las dos rutas y no por la
// otra. ($nin también deja pasar los documentos sin `estado`: todos los nuevos.)
function filtroVisible(ahora) {
  return { estado: { $nin: OCULTOS_LEGADO }, fechaPublicacion: { $lte: ahora } }
}

function paginacion({ page, limit }, limiteMaximo = 50) {
  return {
    page: Math.max(1, Math.floor(Number(page)) || 1),
    limit: Math.min(limiteMaximo, Math.max(1, Math.floor(Number(limit)) || 12)),
  }
}

function ordenPorFecha(orden) {
  const sentido = orden === 'antiguos' ? 1 : -1
  return { fechaPublicacion: sentido, _id: sentido }
}

function exigirTexto(valor, nombre) {
  if (valor === undefined || valor === null || valor === '') return undefined
  if (typeof valor !== 'string') throw new ErrorValidacion(`El parámetro "${nombre}" no es válido`)
  return valor.trim() || undefined
}

// Trae UN solo documento, con solo los campos que la tarjeta necesita: es la
// consulta que corre en cada carga del inicio de cada trabajador.
export async function obtenerDestacado(ahora = new Date()) {
  const video = await Video.findOne(filtroVisible(ahora))
    .sort({ fechaPublicacion: -1, _id: -1 })
    .select('titulo descripcion categoria url proveedor videoId videoHash miniatura archivo.nombre estado fechaPublicacion')
    .lean()
  return video ? aVideoPublico(video, ahora) : null
}

export async function listarPublicados(query = {}, ahora = new Date()) {
  const { page, limit } = paginacion(query)
  const filtro = filtroVisible(ahora)

  const categoria = exigirTexto(query.categoria, 'categoria')
  if (categoria) filtro.categoria = categoria

  const desde = exigirTexto(query.desde, 'desde')
  const hasta = exigirTexto(query.hasta, 'hasta')
  if (desde || hasta) {
    // Se suma al $lte de "ya publicado" (Mongo aplica todos los operadores del
    // objeto a la vez): el rango del usuario solo puede recortar, nunca
    // ampliar más allá de lo visible. Días en hora del Terminal, no en UTC.
    if (desde) {
      const inicio = inicioDelDia(desde)
      if (!inicio) throw new ErrorValidacion('La fecha "desde" no es válida')
      filtro.fechaPublicacion.$gte = inicio
    }
    if (hasta) {
      const inicioHasta = inicioDelDia(hasta)
      if (!inicioHasta) throw new ErrorValidacion('La fecha "hasta" no es válida')
      filtro.fechaPublicacion.$lt = new Date(inicioHasta.getTime() + MS_POR_DIA)
    }
  }

  const q = exigirTexto(query.q, 'q')
  if (q) {
    const patron = new RegExp(escapeRegex(q.slice(0, 80)), 'i')
    filtro.$or = [{ titulo: patron }, { descripcion: patron }]
  }

  const [videos, total] = await Promise.all([
    Video.find(filtro)
      .sort(ordenPorFecha(query.orden))
      .skip((page - 1) * limit)
      .limit(limit)
      .select('titulo descripcion categoria url proveedor videoId videoHash miniatura archivo.nombre estado fechaPublicacion')
      .lean(),
    Video.countDocuments(filtro),
  ])

  return { videos: videos.map((v) => aVideoPublico(v, ahora)), total, page, pages: Math.max(1, Math.ceil(total / limit)) }
}

export async function listarCategoriasPublicadas(ahora = new Date()) {
  const categorias = await Video.distinct('categoria', filtroVisible(ahora))
  return categorias.sort((a, b) => a.localeCompare(b, 'es'))
}

// ── Gestión administrativa ──────────────────────────────────────────────────
function textoObligatorio(valor, nombre, { min = 1, max }) {
  if (typeof valor !== 'string') throw new ErrorValidacion(`El campo "${nombre}" es obligatorio`)
  const texto = valor.trim()
  if (texto.length < min) throw new ErrorValidacion(`El campo "${nombre}" debe tener al menos ${min} caracteres`)
  if (texto.length > max) throw new ErrorValidacion(`El campo "${nombre}" no puede superar ${max} caracteres`)
  return texto
}

function fechaOpcional(valor) {
  if (valor === '' || valor === null) return null
  if (typeof valor !== 'string') throw new ErrorValidacion('La fecha de publicación no es válida')
  const fecha = instanteLocal(valor)
  if (!fecha) throw new ErrorValidacion('La fecha de publicación no es válida')
  return fecha
}

// Convierte el body (creación completa o edición parcial) en el `$set` de
// Mongo. Solo toca los campos presentes; valida el tipo de CADA uno antes de
// que llegue a una consulta.
//
// El origen del video es UNO de dos: un archivo subido (archivoVideo, viene de
// multer) o una URL. Si llega archivo, manda el archivo y la URL se ignora.
function construirCambios(body, { completo, archivoVideo = null, ahora = new Date() }) {
  const cambios = {}
  const presente = (k) => body[k] !== undefined

  if (completo || presente('titulo')) cambios.titulo = textoObligatorio(body.titulo, 'título', { min: 3, max: 140 })
  if (completo || presente('categoria')) cambios.categoria = textoObligatorio(body.categoria, 'categoría', { max: 80 })
  if (presente('descripcion')) {
    if (typeof body.descripcion !== 'string') throw new ErrorValidacion('La descripción no es válida')
    if (body.descripcion.trim().length > 600) throw new ErrorValidacion('La descripción no puede superar 600 caracteres')
    cambios.descripcion = body.descripcion.trim()
  }
  if (archivoVideo) {
    Object.assign(cambios, { proveedor: 'local', url: '', videoId: '', videoHash: '', archivo: datosArchivo(archivoVideo) })
  } else if (completo || presente('url')) {
    if (completo && !presente('url')) throw new ErrorValidacion('Sube un archivo de video o indica la URL del video')
    const { url, proveedor, videoId, videoHash } = analizarUrlVideo(body.url)
    Object.assign(cambios, { url, proveedor, videoId, videoHash })
  }
  // Fecha vacía = "ahora". Al crear siempre hay fecha: el video queda
  // publicado en el acto (o programado, si la fecha es futura).
  if (presente('fechaPublicacion')) cambios.fechaPublicacion = fechaOpcional(body.fechaPublicacion) ?? ahora
  else if (completo) cambios.fechaPublicacion = ahora
  return cambios
}

function autoria(actor) {
  return { usuario: actor.id_usuario, nombre: actor.nombre_usuario }
}

// Fallo del almacenamiento de imágenes (Cloudinary sin configurar o caído).
// Clase propia porque errorHandler oculta el mensaje de cualquier error 5xx
// ("Error interno del servidor"): aquí el mensaje SÍ debe llegar al
// administrador para que sepa que el video no se creó por la miniatura y no
// por sus datos. El controller lo responde directamente (ver
// responderFalloMiniatura) — mismo patrón que danos.controller.js.
export class ErrorAlmacenamientoMiniatura extends Error {
  constructor(mensaje, status) {
    super(mensaje)
    this.status = status
  }
}

// `archivo` viene de multer con diskStorage (carpeta temporal, ver
// videos.almacenamiento.js): ya se validó que es una imagen de ≤5 MB, así que
// leerla entera a memoria es seguro. El temporal lo borra el controller.
async function subirMiniatura(archivo) {
  if (!archivo) return null
  if (!cloudinaryConfigurado()) {
    throw new ErrorAlmacenamientoMiniatura('El almacenamiento de imágenes no está configurado (Cloudinary). Crea el video sin miniatura o avisa al administrador del sistema.', 503)
  }
  try {
    const subida = await subirImagen(await fsp.readFile(archivo.path), CARPETA_MINIATURAS)
    return { url: subida.secure_url, publicId: subida.public_id }
  } catch (err) {
    console.error('Error subiendo miniatura de video a Cloudinary:', err.message)
    throw new ErrorAlmacenamientoMiniatura('No se pudo subir la miniatura, inténtalo de nuevo', 502)
  }
}

// Best-effort: un asset huérfano en Cloudinary no debe impedir la operación
// de negocio ya confirmada en la base.
async function descartarMiniatura(miniatura) {
  if (!miniatura?.publicId || !cloudinaryConfigurado()) return
  try {
    await eliminarImagen(miniatura.publicId)
  } catch (err) {
    console.error('No se pudo eliminar la miniatura de Cloudinary:', err.message)
  }
}

function exigirIdValido(id) {
  if (!mongoose.isValidObjectId(id)) throw new ErrorNoEncontrado('Video no encontrado')
}

export async function listarGestion(query = {}, ahora = new Date()) {
  const { page, limit } = paginacion(query)
  const filtro = {}

  const categoria = exigirTexto(query.categoria, 'categoria')
  if (categoria) filtro.categoria = categoria
  const q = exigirTexto(query.q, 'q')
  if (q) filtro.titulo = new RegExp(escapeRegex(q.slice(0, 80)), 'i')

  const [videos, total, categorias] = await Promise.all([
    Video.find(filtro)
      .sort(ordenPorFecha(query.orden))
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Video.countDocuments(filtro),
    Video.distinct('categoria'),
  ])

  return {
    videos: videos.map((v) => aVideoGestion(v, ahora)),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    categorias: categorias.sort((a, b) => a.localeCompare(b, 'es')),
  }
}

// Dueño del archivo de video subido: si algo falla ANTES de que el documento
// quede guardado, lo borra; después de guardado, el archivo ya es del video.
export async function crearVideo(body, actor, { archivoVideo = null, archivoMiniatura = null } = {}, ahora = new Date()) {
  let creado
  let miniatura = null
  try {
    const cambios = construirCambios(body || {}, { completo: true, archivoVideo, ahora })
    miniatura = await subirMiniatura(archivoMiniatura)
    if (archivoVideo) await confirmarArchivoVideo(archivoVideo)
    creado = await Video.create({
      ...cambios,
      ...(miniatura && { miniatura }),
      creadoPor: autoria(actor),
    })
  } catch (err) {
    await descartarMiniatura(miniatura)
    await eliminarArchivoVideo(archivoVideo?.filename)
    throw err
  }

  const video = creado

  await registrarAuditoria({
    usuario: actor,
    accion: 'crear',
    modulo: 'videos',
    entidad: 'Video',
    entidadId: video._id,
    descripcion: `Video creado: ${video.titulo}`,
  })
  return aVideoGestion(video.toObject(), ahora)
}

export async function actualizarVideo(
  id,
  body,
  actor,
  { archivoVideo = null, archivoMiniatura = null, quitarMiniatura = false } = {},
  ahora = new Date()
) {
  let antes
  let miniatura = null
  let cambios
  try {
    exigirIdValido(id)
    cambios = construirCambios(body || {}, { completo: false, archivoVideo, ahora })
    miniatura = await subirMiniatura(archivoMiniatura)

    const operacion = { $set: { ...cambios, actualizadoPor: autoria(actor) } }
    // `estado` es legado (ver models/Video.js): editar un video antiguo que
    // quedó oculto lo publica.
    const quitar = { estado: '' }
    if (miniatura) operacion.$set.miniatura = miniatura
    else if (quitarMiniatura) quitar.miniatura = ''
    // Pasó de archivo subido a URL: el documento deja de apuntar al archivo.
    if (cambios.proveedor && cambios.proveedor !== 'local') quitar.archivo = ''
    operacion.$unset = quitar

    if (archivoVideo) await confirmarArchivoVideo(archivoVideo)
    // `antes` (sin { new: true }) devuelve el documento previo: da la
    // miniatura y el archivo viejos que hay que borrar y el estado anterior
    // para la auditoría, en la misma operación atómica.
    antes = await Video.findByIdAndUpdate(id, operacion, { runValidators: true }).lean()
    if (!antes) throw new ErrorNoEncontrado('Video no encontrado')
  } catch (err) {
    await descartarMiniatura(miniatura)
    await eliminarArchivoVideo(archivoVideo?.filename)
    throw err
  }

  if (miniatura || quitarMiniatura) await descartarMiniatura(antes.miniatura)
  // El archivo anterior se borra solo si ya no es el del video: fue
  // reemplazado por otro archivo o el video pasó a ser una URL.
  if (antes.archivo?.nombre && cambios.proveedor && antes.archivo.nombre !== cambios.archivo?.nombre) {
    await eliminarArchivoVideo(antes.archivo.nombre)
  }

  const video = await Video.findById(id)

  await registrarAuditoria({
    usuario: actor,
    accion: 'actualizar',
    modulo: 'videos',
    entidad: 'Video',
    entidadId: video._id,
    descripcion: `Video actualizado: ${video.titulo}`,
    cambios: {
      antes: { titulo: antes.titulo, categoria: antes.categoria, fechaPublicacion: antes.fechaPublicacion, url: antes.url, archivo: antes.archivo?.nombreOriginal },
      despues: { titulo: video.titulo, categoria: video.categoria, fechaPublicacion: video.fechaPublicacion, url: video.url, archivo: video.archivo?.nombreOriginal },
    },
  })
  return aVideoGestion(video.toObject(), ahora)
}

export async function eliminarVideo(id, actor) {
  exigirIdValido(id)
  const eliminado = await Video.findByIdAndDelete(id).lean()
  if (!eliminado) throw new ErrorNoEncontrado('Video no encontrado')

  await descartarMiniatura(eliminado.miniatura)
  await eliminarArchivoVideo(eliminado.archivo?.nombre)
  await registrarAuditoria({
    usuario: actor,
    accion: 'eliminar',
    modulo: 'videos',
    entidad: 'Video',
    entidadId: eliminado._id,
    descripcion: `Video eliminado: ${eliminado.titulo}`,
    cambios: { antes: { titulo: eliminado.titulo, categoria: eliminado.categoria, fechaPublicacion: eliminado.fechaPublicacion } },
  })
}

// Autoriza la reproducción del archivo de un video subido al VPS. Mismo
// criterio de visibilidad que el destacado y el historial (filtroVisible): un
// trabajador solo alcanza videos ya en fecha; quien gestiona videos puede
// además previsualizar los programados.
// Todo lo demás responde 404 (no 403): no se confirma que el video exista.
export async function obtenerArchivoParaReproducir(id, usuario, ahora = new Date()) {
  exigirIdValido(id)
  const video = await Video.findById(id).select('estado fechaPublicacion proveedor archivo').lean()
  if (!video || video.proveedor !== 'local' || !video.archivo?.nombre) throw new ErrorNoEncontrado('Video no encontrado')

  const visible = !esOcultoLegado(video) && video.fechaPublicacion && new Date(video.fechaPublicacion) <= ahora
  const gestiona = usuario?.esSuperAdmin || usuario?.permisos?.has('videos:gestionar')
  if (!visible && !gestiona) throw new ErrorNoEncontrado('Video no encontrado')
  return video.archivo
}
