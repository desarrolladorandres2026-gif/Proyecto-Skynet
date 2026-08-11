import { useState } from 'react'
import { DatabaseBackup, Download } from 'lucide-react'
import { backup as backupApi } from '../../api/backup.js'
import { Btn, Card, ErrorMsg, OkMsg } from '../../components/ui.jsx'

export default function BackupPage() {
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function generar() {
    setGenerando(true)
    setError('')
    setOk('')
    try {
      const { blob, nombre } = await backupApi.exportar()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setOk('Backup generado y descargado correctamente.')
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <DatabaseBackup className="h-6 w-6 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <div>
          <h1 className="panel-mono text-xl font-semibold tracking-wide text-slate-900 dark:text-white">Copia de seguridad</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Exclusivo Super Admin.</p>
        </div>
      </div>

      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Genera un archivo Excel con toda la información de la plataforma (usuarios, roles, requerimientos,
          reportes de daños, ausencias, mantenimiento, auditoría y más), organizada en una hoja por colección.
        </p>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          No hay backups automáticos ni programados: tú decides cuándo generarlo. Los registros de{' '}
          <strong>Auditoría</strong> se eliminan solos pasados unos meses (ver módulo Sistema), así que conviene
          descargar un backup de vez en cuando para no perder ese historial.
        </p>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Por seguridad, el archivo nunca incluye contraseñas ni credenciales — solo información de negocio.
          Guárdalo en un lugar de confianza: contiene datos personales de todo el personal.
        </p>

        <ErrorMsg>{error}</ErrorMsg>
        <OkMsg>{ok}</OkMsg>

        <div className="mt-5">
          <Btn onClick={generar} disabled={generando} className="flex items-center gap-2">
            <Download className="h-4 w-4" aria-hidden="true" />
            {generando ? 'Generando backup…' : 'Generar y descargar backup'}
          </Btn>
        </div>
      </Card>
    </div>
  )
}
