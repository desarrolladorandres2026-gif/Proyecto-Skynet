import { generarBackupExcel } from './backup.service.js'

export async function exportarBackup(req, res) {
  const buffer = await generarBackupExcel(req.usuario)
  const fecha = new Date().toISOString().slice(0, 10)
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="skynet-backup-${fecha}.xlsx"`,
  })
  res.send(buffer)
}
