import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { env } from '../../config/env.js'

// Evidencias de una Orden de Trabajo (Fase 3): fotos, videos, PDF, Excel,
// Word y audio — a diferencia de upload.js (solo PDF de informes de
// mantenimiento legado), que se deja intacto.
const destino = path.join(env.STORAGE_ROOT, 'mantenimiento_evidencias')
fs.mkdirSync(destino, { recursive: true })

const MIME_PERMITIDOS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

function tipoPorMime(mimetype) {
  if (mimetype.startsWith('image/')) return 'foto'
  if (mimetype.startsWith('video/')) return 'video'
  if (mimetype.startsWith('audio/')) return 'audio'
  if (mimetype === 'application/pdf') return 'pdf'
  if (mimetype.includes('word')) return 'word'
  if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return 'excel'
  return null
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, destino),
  filename: (_req, file, cb) => {
    const nombre = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    cb(null, nombre)
  },
})

function filtroEvidencia(_req, file, cb) {
  const esMultimedia = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')
  if (esMultimedia || MIME_PERMITIDOS.includes(file.mimetype)) return cb(null, true)
  cb(new Error('Tipo de archivo no permitido para evidencias'))
}

// 50 MB: cubre video corto de campo sin abrir la puerta a archivos enormes
// en disco local (mismo criterio de límite explícito que upload.js).
export const uploadEvidencia = multer({
  storage,
  fileFilter: filtroEvidencia,
  limits: { fileSize: 50 * 1024 * 1024 },
})

export { tipoPorMime }
