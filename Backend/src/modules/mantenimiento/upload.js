import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { env } from '../../config/env.js'

const destino = path.join(env.STORAGE_ROOT, 'mantenimientos')
fs.mkdirSync(destino, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, destino),
  filename: (_req, file, cb) => {
    const nombre = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    cb(null, nombre)
  },
})

function filtroPdf(_req, file, cb) {
  if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
    return cb(null, true)
  }
  cb(new Error('Solo se permiten archivos PDF'))
}

export const uploadPdf = multer({ storage, fileFilter: filtroPdf, limits: { fileSize: 20 * 1024 * 1024 } })

export function urlArchivo(filename) {
  return `${env.FILES_PUBLIC_URL}/mantenimientos/${filename}`
}
