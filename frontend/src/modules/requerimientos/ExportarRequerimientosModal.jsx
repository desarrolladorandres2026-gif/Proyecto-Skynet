import { useState } from 'react'
import { Download } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Btn, Field, Input, Modal, ErrorMsg } from '../../components/ui.jsx'

// Compartido por Bodega, Financiero y la vista de supervisión (Admin/Super
// Admin) — cada una ve el rango sobre "lo suyo" tal como lo filtra el
// permiso en el backend (ver requerimientos.routes.js), así que el mismo
// modal sirve para las 3 sin distinguir rol aquí.
export default function ExportarRequerimientosModal({ abierto, onCerrar }) {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState('')

  function cerrar() {
    setError('')
    setExportando(false)
    onCerrar()
  }

  async function exportar(e) {
    e.preventDefault()
    setError('')
    if (desde > hasta) {
      setError('La fecha de inicio no puede ser posterior a la de fin')
      return
    }
    setExportando(true)
    try {
      const { blob, nombre } = await requerimientosApi.exportar(desde, hasta)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      cerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setExportando(false)
    }
  }

  return (
    <Modal abierto={abierto} titulo="Exportar requerimientos" onCerrar={cerrar} ancho="max-w-sm">
      <form onSubmit={exportar} className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Descarga en CSV los requerimientos con fecha de solicitud dentro del rango elegido (incluye ambos días).
        </p>
        <ErrorMsg>{error}</ErrorMsg>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde">
            <Input type="date" required value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" required value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Btn variante="secundario" onClick={cerrar}>Cancelar</Btn>
          <Btn type="submit" disabled={exportando} className="flex items-center gap-1.5">
            <Download className="h-4 w-4" aria-hidden="true" />
            {exportando ? 'Exportando…' : 'Exportar'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}
