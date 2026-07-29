import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import multer from 'multer'
import { env } from '../../config/env.js'

const mensajesDir = path.join(env.STORAGE_ROOT, 'mensajes')
const videosDir = path.join(env.STORAGE_ROOT, 'videos')
fs.mkdirSync(mensajesDir, { recursive: true })
fs.mkdirSync(videosDir, { recursive: true })

const EXTENSIONES_VALIDAS = /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/i

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('video/') ? videosDir : mensajesDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`)
  },
})

function filtroArchivo(_req, file, cb) {
  if (EXTENSIONES_VALIDAS.test(file.originalname)) return cb(null, true)
  cb(new Error('Extensión de archivo no permitida'))
}

export const uploadMiddleware = multer({
  storage,
  fileFilter: filtroArchivo,
  limits: { fileSize: 50 * 1024 * 1024 },
}).single('file')

export function subirArchivo(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' })

  const subdir = req.file.mimetype.startsWith('video/') ? 'videos' : 'mensajes'
  const url = `${env.FILES_PUBLIC_URL}/${subdir}/${req.file.filename}`

  res.json({ url })
}
