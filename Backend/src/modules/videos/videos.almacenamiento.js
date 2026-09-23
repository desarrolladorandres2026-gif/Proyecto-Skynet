import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import multer from 'multer'
import { env } from '../../config/env.js'
import { detectarTipoReal } from '../../utils/validarContenidoArchivo.js'
import { enviarArchivoSeguro } from '../../utils/streamArchivo.js'
import { ErrorValidacion } from '../../utils/errores.js'

// Archivos de video subidos desde el computador del administrador. Viven en
// el disco del VPS (STORAGE_ROOT/videos), NO en Cloudinary: son pesados y el
// plan de Cloudinary no está pensado para eso.
//
// ── Sin límite de tamaño ────────────────────────────────────────────────────
// multer escribe el archivo a disco en streaming (nunca entero en memoria), así
// que el tamaño no afecta la RAM del proceso (PM2 lo reinicia a los 400 MB).
// Lo único que un archivo enorme puede agotar es el DISCO: por eso, en vez de
// un tope de tamaño, se comprueba el espacio libre antes de aceptar la subida
// (ver verificarEspacioDisco).
//
// ── Carpeta temporal ────────────────────────────────────────────────────────
// Todo llega primero a STORAGE_ROOT/videos_temp y solo se mueve a
// STORAGE_ROOT/videos cuando el video quedó guardado en la base. Si la subida
// se corta a la mitad (el usuario cancela, se cae la red), multer no siempre
// borra el archivo parcial; al estar en la carpeta temporal, lo recoge
// limpiarTemporalesViejos() en la siguiente subida en vez de quedar huérfano
// junto a los videos reales. Ambas carpetas están bajo STORAGE_ROOT (mismo
// disco), así que moverlo es un rename instantáneo, no una copia.
//
// Las rutas se resuelven en cada llamada (no al importar el módulo) para que
// los tests puedan apuntar STORAGE_ROOT a una carpeta temporal.
export const dirVideos = () => path.join(env.STORAGE_ROOT, 'videos')
const dirTemporal = () => path.join(env.STORAGE_ROOT, 'videos_temp')

// Formatos que los navegadores reproducen de forma nativa. .avi, .wmv, .mkv,
// etc. se rechazan: se subirían bien pero nadie podría verlos.
// valor = extensión con la que se guarda el archivo en disco.
const FORMATOS_VIDEO = new Map([
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/quicktime', 'mov'],
  ['video/x-m4v', 'm4v'],
  ['video/ogg', 'ogv'],
])
const EXTENSIONES_VIDEO = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv'])
const MENSAJE_FORMATO = 'Formato de video no compatible. Sube un archivo MP4 (recomendado), WebM o MOV.'

// .mov y .m4v son el mismo contenedor que .mp4 (ISO BMFF). Chrome/Edge no
// reproducen algo declarado como "video/quicktime", pero sí el mismo archivo
// declarado como "video/mp4" — siempre que el códec interno sea H.264.
const TIPO_AL_SERVIR = { 'video/quicktime': 'video/mp4', 'video/x-m4v': 'video/mp4' }

export const MAX_BYTES_MINIATURA = 5 * 1024 * 1024
// Espacio que se deja libre SIEMPRE en el disco: Mongo, los logs y el propio
// sistema operativo necesitan margen; un disco lleno tumba el VPS entero.
const MARGEN_LIBRE_BYTES = 2 * 1024 ** 3
const MS_TEMPORAL_ABANDONADO = 24 * 60 * 60 * 1000

function asegurarCarpetas() {
  fs.mkdirSync(dirVideos(), { recursive: true })
  fs.mkdirSync(dirTemporal(), { recursive: true })
}

// Borra lo que quedó en la carpeta temporal de subidas cortadas hace más de
// un día. Una subida EN CURSO no se toca: su archivo se sigue escribiendo, así
// que su fecha de modificación es reciente.
async function limpiarTemporalesViejos() {
  const limite = Date.now() - MS_TEMPORAL_ABANDONADO
  const nombres = await fsp.readdir(dirTemporal()).catch(() => [])
  await Promise.all(
    nombres.map(async (nombre) => {
      const ruta = path.join(dirTemporal(), nombre)
      const info = await fsp.stat(ruta).catch(() => null)
      if (info?.isFile() && info.mtimeMs < limite) await fsp.unlink(ruta).catch(() => {})
    })
  )
}

/** Pura, para poder probarla sin llenar un disco de verdad. */
export function espacioInsuficiente({ solicitados, libres, margen = MARGEN_LIBRE_BYTES }) {
  return solicitados + margen > libres
}

function formatearGB(bytes) {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

// Rechaza la subida ANTES de recibir un solo byte si no cabe en el disco. Usa
// el Content-Length de la petición (el navegador siempre lo manda al subir un
// FormData): es el tamaño total que va a llegar.
async function verificarEspacioDisco(req, res, next) {
  try {
    asegurarCarpetas()
    limpiarTemporalesViejos() // en segundo plano: no retrasa la subida

    const solicitados = Number(req.headers['content-length'])
    if (!Number.isFinite(solicitados) || solicitados <= 0 || typeof fsp.statfs !== 'function') return next()

    const info = await fsp.statfs(dirTemporal())
    const libres = info.bavail * info.bsize
    if (espacioInsuficiente({ solicitados, libres })) {
      // 507 respondido aquí directamente: errorHandler oculta el mensaje de
      // cualquier 5xx, y este sí tiene que llegarle al administrador.
      return res.status(507).json({
        error: `No hay espacio suficiente en el servidor para este video (${formatearGB(solicitados)}). Espacio libre: ${formatearGB(libres)}. Libera espacio en el VPS o sube un archivo más pequeño.`,
      })
    }
    next()
  } catch (err) {
    next(err)
  }
}

const almacenamiento = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dirTemporal()),
  // Nombre SIEMPRE generado por el servidor (nunca el del cliente): aleatorio
  // para que no se pueda adivinar ni colisionar.
  filename: (_req, file, cb) => {
    const ext =
      file.fieldname === 'video'
        ? FORMATOS_VIDEO.get(file.mimetype) || path.extname(file.originalname).slice(1).toLowerCase()
        : 'img'
    cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`)
  },
})

function filtroArchivos(_req, file, cb) {
  if (file.fieldname === 'miniatura') {
    if (file.mimetype.startsWith('image/')) return cb(null, true)
    return cb(new ErrorValidacion('La miniatura debe ser una imagen'))
  }
  if (file.fieldname === 'video') {
    // Windows a veces no sabe el tipo de un .mov/.m4v y el navegador lo manda
    // como application/octet-stream: se acepta por extensión y la verificación
    // real del contenido (magic bytes) se hace después, en validarArchivos.
    const extension = path.extname(file.originalname).toLowerCase()
    const porTipo = FORMATOS_VIDEO.has(file.mimetype)
    const porExtension = file.mimetype === 'application/octet-stream' && EXTENSIONES_VIDEO.has(extension)
    if (porTipo || porExtension) return cb(null, true)
    return cb(new ErrorValidacion(MENSAJE_FORMATO))
  }
  cb(new ErrorValidacion('Archivo no esperado'))
}

// Sin `fileSize`: el tamaño del video no tiene tope (ver arriba). Sí se acota
// la cantidad de archivos y campos de texto, que no tienen motivo para crecer.
const recibirMultipart = multer({
  storage: almacenamiento,
  fileFilter: filtroArchivos,
  limits: { files: 2, fields: 20, fieldSize: 64 * 1024 },
}).fields([
  { name: 'video', maxCount: 1 },
  { name: 'miniatura', maxCount: 1 },
])

function archivosDe(req) {
  return { video: req.files?.video?.[0] || null, miniatura: req.files?.miniatura?.[0] || null }
}

export async function descartarTemporales(req) {
  const { video, miniatura } = archivosDe(req)
  await Promise.all([video, miniatura].filter(Boolean).map((f) => fsp.unlink(f.path).catch(() => {})))
}

function recibirArchivos(req, res, next) {
  recibirMultipart(req, res, (err) => {
    if (!err) return next()
    // Si la subida se cortó a la mitad, lo ya escrito queda en la carpeta
    // temporal y lo recoge limpiarTemporalesViejos().
    if (err instanceof multer.MulterError) {
      const mensaje = err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Archivo no esperado' : 'La subida no es válida'
      return next(new ErrorValidacion(mensaje))
    }
    next(err)
  })
}

// Confirma, leyendo la firma real del archivo (magic bytes), que el contenido
// es lo que el navegador declaró — el Content-Type lo pone el cliente y no se
// puede creer. Guarda en `file.tipoReal` el tipo detectado: es el que se
// persiste y el que se sirve después, no el declarado.
async function validarArchivos(req, res, next) {
  const { video, miniatura } = archivosDe(req)
  try {
    if (miniatura) {
      if (miniatura.size > MAX_BYTES_MINIATURA) throw new ErrorValidacion('La miniatura no puede superar 5 MB')
      const tipo = await detectarTipoReal(miniatura.path)
      if (!tipo?.mime.startsWith('image/')) throw new ErrorValidacion('La miniatura no es una imagen válida')
    }
    if (video) {
      if (video.size === 0) throw new ErrorValidacion('El archivo de video está vacío')
      const tipo = await detectarTipoReal(video.path)
      if (!tipo || !FORMATOS_VIDEO.has(tipo.mime)) throw new ErrorValidacion(MENSAJE_FORMATO)
      video.tipoReal = tipo.mime
    }
    next()
  } catch (err) {
    await descartarTemporales(req)
    next(err)
  }
}

/** Cadena de middlewares para las rutas que reciben video y/o miniatura. */
export const recibirSubidaVideo = [verificarEspacioDisco, recibirArchivos, validarArchivos]

export { archivosDe }

/** Datos del archivo tal como se guardan en Video.archivo. */
export function datosArchivo(file) {
  return {
    nombre: file.filename,
    // Solo para mostrarle al administrador qué subió; nunca se usa como ruta.
    nombreOriginal: path.basename(file.originalname).slice(0, 200),
    tamano: file.size,
    mimeType: file.tipoReal || file.mimetype,
  }
}

/** Pasa el video de la carpeta temporal a la definitiva. */
export async function confirmarArchivoVideo(file) {
  asegurarCarpetas()
  await fsp.rename(file.path, path.join(dirVideos(), file.filename))
}

export async function eliminarArchivoVideo(nombre) {
  if (!nombre || nombre !== path.basename(nombre)) return
  await fsp.unlink(path.join(dirVideos(), nombre)).catch(() => {})
}

// Envía el archivo con soporte de Range (res.sendFile, vía enviarArchivoSeguro):
// es lo que permite adelantar/retroceder en el reproductor y empezar a ver sin
// descargar el video completo. El caller ya verificó la autorización.
export function transmitirArchivoVideo(res, archivo) {
  enviarArchivoSeguro(res, dirVideos(), archivo.nombre, {
    headers: {
      'Content-Type': TIPO_AL_SERVIR[archivo.mimeType] || archivo.mimeType,
      // La URL lleva ?v=<nombre del archivo> (ver aVideoPublico): reemplazar el
      // video cambia la URL, así que el navegador puede guardarlo en caché.
      // private: nunca en un proxy/CDN compartido.
      'Cache-Control': 'private, max-age=604800',
    },
    cacheControl: false,
    acceptRanges: true,
  })
}
