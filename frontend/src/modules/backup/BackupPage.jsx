import { useState } from 'react'
import { DatabaseBackup, FileArchive, Trash2 } from 'lucide-react'
import { Btn, Card, ErrorMsg, OkMsg } from '../../components/ui.jsx'
import BackupPersonalizadoPanel from './BackupPersonalizadoPanel.jsx'
import PurgaHistoricoModal from './PurgaHistoricoModal.jsx'
import { descargarPdfsRequerimientosFinalizados } from '../../pdf/backupPdfsRequerimientos.js'

export default function BackupPage() {
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [mesesModal, setMesesModal] = useState(null)
  const [generandoPdfs, setGenerandoPdfs] = useState(false)
  const [progresoPdfs, setProgresoPdfs] = useState(null)

  async function descargarPdfs() {
    setGenerandoPdfs(true)
    setError('')
    setOk('')
    setProgresoPdfs(null)
    try {
      const { total } = await descargarPdfsRequerimientosFinalizados({
        onProgreso: (hecho, deTotal) => setProgresoPdfs({ hecho, total: deTotal }),
      })
      setOk(
        total === 0
          ? 'No hay requerimientos aprobados y despachados todavía.'
          : `Se descargaron ${total} PDF(s) en un .zip.`
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerandoPdfs(false)
      setProgresoPdfs(null)
    }
  }

  function alEliminar(resultado) {
    const total = resultado.resultados.reduce((acc, r) => acc + r.eliminados, 0)
    setOk(`Se eliminaron ${total} registro(s) anteriores al ${new Date(resultado.corte).toLocaleDateString('es-CO')}.`)
    setError('')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="mb-2 flex items-center gap-3">
        <DatabaseBackup className="h-6 w-6 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <div>
          <h1 className="panel-mono text-xl font-semibold tracking-wide text-slate-900 dark:text-white">Copia de seguridad</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Exclusivo Super Admin.</p>
        </div>
      </div>

      <Card>
        <BackupPersonalizadoPanel />
      </Card>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      <Card>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">PDFs de Requerimientos</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Descarga en un solo .zip el PDF de cada requerimiento ya <strong>aprobado por Financiero y despachado
          por Bodega</strong> — el registro final del trámite. No incluye los pendientes, rechazados ni los que
          Bodega marcó "no se puede despachar", porque esos documentos todavía pueden cambiar.
        </p>
        <div className="mt-4">
          <Btn onClick={descargarPdfs} disabled={generandoPdfs} className="flex items-center gap-2">
            <FileArchive className="h-4 w-4" aria-hidden="true" />
            {generandoPdfs
              ? progresoPdfs
                ? `Generando PDF ${progresoPdfs.hecho} de ${progresoPdfs.total}…`
                : 'Buscando requerimientos…'
              : 'Descargar PDFs (.zip)'}
          </Btn>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Depurar histórico</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Para no saturar la plataforma, puedes eliminar el historial más viejo de Requerimientos, Reportes de
          daños, Ausencias, Auditoría, Órdenes de mantenimiento, Movimientos de inventario y Bitácora de
          entradas. Primero se descarga un Excel de rescate solo con lo que se va a borrar, y luego pides
          confirmación con tu contraseña. Usuarios, roles y catálogos nunca se tocan.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variante="peligro" onClick={() => setMesesModal(6)} className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Rescatar y eliminar (6 meses)
          </Btn>
          <Btn variante="peligro" onClick={() => setMesesModal(12)} className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Rescatar y eliminar (1 año)
          </Btn>
        </div>
      </Card>

      <PurgaHistoricoModal
        abierto={mesesModal !== null}
        meses={mesesModal}
        onCerrar={() => setMesesModal(null)}
        onEliminado={alEliminar}
      />
    </div>
  )
}
