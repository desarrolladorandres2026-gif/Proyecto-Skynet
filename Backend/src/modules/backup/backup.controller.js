import { generarBackup, catalogoColecciones } from './backup.service.js'

export function listarColecciones(req, res) {
  res.json({ colecciones: catalogoColecciones() })
}

export async function exportarBackup(req, res) {
  const { colecciones, desde, hasta, formato } = req.query
  const { buffer, contentType, extension } = await generarBackup({ colecciones, desde, hasta, formato }, req.usuario)
  const fecha = new Date().toISOString().slice(0, 10)
  res.set({
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="skynet-backup-${fecha}.${extension}"`,
  })
  res.send(buffer)
}
