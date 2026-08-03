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

// Sube un buffer (multer memoryStorage) vía stream: el SDK solo acepta rutas
// de archivo o streams, no buffers directos.
export function subirImagen(buffer, carpeta) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: carpeta, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    )
    stream.end(buffer)
  })
}

export function eliminarImagen(publicId) {
  return cloudinary.uploader.destroy(publicId)
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
