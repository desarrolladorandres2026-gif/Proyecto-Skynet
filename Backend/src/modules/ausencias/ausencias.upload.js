import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { env } from '../../config/env.js'

// Soportes de ausencias (certificados médicos de incapacidades): se guardan en
// disco local bajo STORAGE_ROOT/ausencias_soportes, no en servicios de terceros
// (Cloudinary) porque los certificados médicos contienen datos de salud
// confidenciales y los PDF se visualizan mejor directamente desde el servidor
// con autorización por-recurso (ver ausencias.controller.js#soporte).
const destino = path.join(env.STORAGE_ROOT, 'ausencias_soportes')
fs.mkdirSync(destino, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, destino),
  filename: (_req, file, cb) => {
    const nombreLimpio = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}_${nombreLimpio}`)
  },
})

function filtroSoporte(_req, file, cb) {
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    return cb(null, true)
  }
  cb(new Error('El soporte debe ser una imagen o un PDF'))
}

// 15 MB: cubre imágenes tomadas con celular y certificados PDF escaneados de la EPS.
export const uploadSoporte = multer({
  storage,
  fileFilter: filtroSoporte,
  limits: { fileSize: 15 * 1024 * 1024 },
})

export { destino as CARPETA_SOPORTES }
