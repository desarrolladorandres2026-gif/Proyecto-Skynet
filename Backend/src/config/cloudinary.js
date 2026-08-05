import { v2 as cloudinary } from 'cloudinary'
import { env } from './env.js'

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
})

export function cloudinaryConfigurado() {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
}

// Límite de lado para fotos subidas desde celular: las cámaras modernas
// entregan 3000-4000px, muy por encima de lo que cualquier pantalla necesita
// para ver un reporte de daño. 'limit' solo achica si excede — nunca agranda
// una foto más pequeña ni distorsiona el aspect ratio.
const LADO_MAXIMO_FOTO = 1600

// Sube un buffer (multer memoryStorage) vía stream: el SDK solo acepta rutas
// de archivo o streams, no buffers directos.
// La transformación es "incoming" (va en el upload, no en la URL de entrega):
// Cloudinary comprime y redimensiona antes de guardar, así que lo que queda
// almacenado —y lo que cuenta contra el plan— ya es la versión liviana.
export function subirImagen(buffer, carpeta) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: carpeta,
        resource_type: 'image',
        transformation: [
          {
            width: LADO_MAXIMO_FOTO,
            height: LADO_MAXIMO_FOTO,
            crop: 'limit',
            quality: 'auto:good',
            fetch_format: 'auto',
          },
        ],
      },
      (err, result) => (err ? reject(err) : resolve(result))
    )
    stream.end(buffer)
  })
}

export function eliminarImagen(publicId) {
  return cloudinary.uploader.destroy(publicId)
}

// ── Firma manuscrita ────────────────────────────────────────────────────
// El usuario sube una FOTO de su firma hecha en papel, no un PNG ya recortado.
// Estampar esa foto tal cual sobre el bloque de firma del PDF taparía la línea
// con un rectángulo de "papel"; la cadena de efectos la convierte en una
// rúbrica con fondo transparente:
//   trim            recorta el margen de papel alrededor del trazo
//   grayscale       neutraliza el tono cálido/amarillento de la foto
//   contrast        empuja el papel hacia blanco puro y la tinta hacia negro
//   make_transparent ese blanco pasa a alfa (el número es la tolerancia: sube
//                   si el papel queda gris, baja si se come partes del trazo)
const TRANSFORMACION_FIRMA = [
  { effect: 'trim:12' },
  { width: 900, crop: 'limit' },
  { effect: 'grayscale' },
  { effect: 'contrast:60' },
  { effect: 'make_transparent:38' },
]

// A diferencia de subirImagen(), aquí la transformación NO es "incoming": se
// guarda la foto original tal cual y el procesamiento se aplica en la URL de
// entrega. Así se puede reajustar la tolerancia más adelante sin pedirle a
// nadie que vuelva a subir su firma.
export function subirFirma(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'skynet/firmas', resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    )
    stream.end(buffer)
  })
}

// sign_url: las transformaciones derivadas quedan bloqueadas si la cuenta tiene
// activado "strict transformations"; firmar la URL funciona en ambos casos.
// format png: obligatorio para conservar el canal alfa que crea make_transparent
// (jpg lo aplanaría a blanco y se perdería todo el trabajo anterior).
export function urlFirmaProcesada(publicId) {
  return cloudinary.url(publicId, {
    transformation: TRANSFORMACION_FIRMA,
    format: 'png',
    secure: true,
    sign_url: true,
  })
}

// Para soportes de ausencias (incapacidad médica): puede llegar como foto o
// como PDF, y a diferencia de subirImagen/subirVideo no vale la pena separar
// por tipo — 'auto' deja que Cloudinary lo detecte.
export function subirArchivo(buffer, carpeta) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: carpeta, resource_type: 'auto' },
      (err, result) => (err ? reject(err) : resolve(result))
    )
    stream.end(buffer)
  })
}

export function subirVideo(buffer, carpeta) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: carpeta, resource_type: 'video' },
      (err, result) => (err ? reject(err) : resolve(result))
    )
    stream.end(buffer)
  })
}

// destroy() asume resource_type 'image' si no se indica: para video hay que
// pasarlo explícito o Cloudinary no encuentra el asset a borrar.
export function eliminarVideo(publicId) {
  return cloudinary.uploader.destroy(publicId, { resource_type: 'video' })
}
