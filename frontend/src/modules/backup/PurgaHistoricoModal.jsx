import { useEffect, useState } from 'react'
import { Download, Trash2, TriangleAlert } from 'lucide-react'
import { backup as backupApi } from '../../api/backup.js'
import { Btn, Field, Input, Modal, ErrorMsg } from '../../components/ui.jsx'

const PALABRA_CONFIRMACION = 'ELIMINAR'

function fmtFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Flujo guiado en 2 pasos, a propósito: no se puede escribir la contraseña
// de purga hasta haber descargado el rescate en ESTA misma apertura del
// modal (rescateDescargado). El backend no puede verificar que un archivo
// llegó de verdad al disco del Super Admin — esta es la barrera de UX, la
// garantía real vive en la reautenticación del lado del servidor (ver
// purga.service.js::purgarAntiguos).
export default function PurgaHistoricoModal({ abierto, meses, onCerrar, onEliminado }) {
  const [preview, setPreview] = useState(null)
  const [cargandoPreview, setCargandoPreview] = useState(false)
  const [rescateDescargado, setRescateDescargado] = useState(false)
  const [descargandoRescate, setDescargandoRescate] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!abierto) return
    setPreview(null)
    setRescateDescargado(false)
    setPassword('')
    setConfirmacion('')
    setError('')
    setCargandoPreview(true)
    backupApi
      .previsualizarPurga(meses)
      .then(setPreview)
      .catch((err) => setError(err.message))
      .finally(() => setCargandoPreview(false))
  }, [abierto, meses])

  function cerrar() {
    setEliminando(false)
    onCerrar()
  }

  async function descargarRescate() {
    setError('')
    setDescargandoRescate(true)
    try {
      const { blob, nombre } = await backupApi.rescatarPurga(meses)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setRescateDescargado(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setDescargandoRescate(false)
    }
  }

  async function eliminar(e) {
    e.preventDefault()
    setError('')
    if (confirmacion.trim().toUpperCase() !== PALABRA_CONFIRMACION) {
      setError(`Escribe "${PALABRA_CONFIRMACION}" para confirmar`)
      return
    }
    setEliminando(true)
    try {
      const resultado = await backupApi.purgar(meses, password)
      onEliminado?.(resultado)
      cerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setEliminando(false)
    }
  }

  const totalAEliminar = preview?.conteos?.reduce((acc, c) => acc + c.total, 0) ?? 0

  return (
    <Modal
      abierto={abierto}
      titulo={`Rescatar y eliminar histórico (${meses === 12 ? '1 año' : `${meses} meses`})`}
      onCerrar={cerrar}
      ancho="max-w-md"
    >
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Esto borra permanentemente los registros de Requerimientos, Reportes de daños, Ausencias, Auditoría,
          Órdenes de mantenimiento, Movimientos de inventario y Bitácora de entradas anteriores a la fecha de
          corte. Usuarios, roles, equipos y demás catálogos nunca se tocan. No se puede deshacer.
        </p>

        <ErrorMsg>{error}</ErrorMsg>

        {cargandoPreview ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Calculando qué se va a eliminar…</p>
        ) : preview ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700">
            <p className="border-b border-slate-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Se eliminará todo lo anterior al {fmtFecha(preview.corte)}
            </p>
            <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
              {preview.conteos.map((c) => (
                <li key={c.entidad} className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-slate-600 dark:text-slate-300">{c.entidad}</span>
                  <span className="panel-mono font-semibold text-slate-800 dark:text-slate-100">{c.total}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!rescateDescargado ? (
          <Btn
            onClick={descargarRescate}
            disabled={descargandoRescate || totalAEliminar === 0}
            className="flex w-full items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {descargandoRescate
              ? 'Descargando rescate…'
              : totalAEliminar === 0
                ? 'No hay nada que rescatar en ese rango'
                : '1. Descargar rescate antes de eliminar'}
          </Btn>
        ) : (
          <form onSubmit={eliminar} className="space-y-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Rescate descargado. 2. Confirma para eliminar {totalAEliminar} registro(s) de forma permanente.
            </p>
            <Field label={`Escribe "${PALABRA_CONFIRMACION}" para confirmar`}>
              <Input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} placeholder={PALABRA_CONFIRMACION} />
            </Field>
            <Field label="Tu contraseña">
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Btn type="submit" variante="peligro" disabled={eliminando} className="flex w-full items-center justify-center gap-2">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {eliminando ? 'Eliminando…' : `Eliminar ${totalAEliminar} registro(s) definitivamente`}
            </Btn>
          </form>
        )}

        <div className="flex justify-end pt-1">
          <Btn variante="secundario" onClick={cerrar}>Cancelar</Btn>
        </div>
      </div>
    </Modal>
  )
}
