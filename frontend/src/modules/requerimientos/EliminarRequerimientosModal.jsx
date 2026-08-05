import { useState } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Btn, Field, Input, Modal, ErrorMsg } from '../../components/ui.jsx'

// Exclusivo de Super Admin (el backend lo blinda con soloAdmin — ver
// requerimientos.routes.js). Es la única operación de todo el módulo que
// borra datos en vez de mutar estado, así que además de la reautenticación
// (mismo patrón de "firma" que aprobar/despachar) exige escribir la palabra
// ELIMINAR — un solo campo de contraseña es fácil de enviar sin pensarlo dos
// veces cuando lo que se confirma no es una decisión sino una purga masiva
// e irreversible.
const PALABRA_CONFIRMACION = 'ELIMINAR'

export default function EliminarRequerimientosModal({ abierto, onCerrar, onEliminado }) {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  function cerrar() {
    setDesde('')
    setHasta('')
    setPassword('')
    setConfirmacion('')
    setError('')
    setEnviando(false)
    onCerrar()
  }

  async function eliminar(e) {
    e.preventDefault()
    setError('')
    if (desde > hasta) {
      setError('La fecha de inicio no puede ser posterior a la de fin')
      return
    }
    if (confirmacion.trim().toUpperCase() !== PALABRA_CONFIRMACION) {
      setError(`Escribe "${PALABRA_CONFIRMACION}" para confirmar`)
      return
    }
    setEnviando(true)
    try {
      const { eliminados } = await requerimientosApi.eliminarPorRango(desde, hasta, password)
      onEliminado?.(eliminados)
      cerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal abierto={abierto} titulo="Eliminar requerimientos por fecha" onCerrar={cerrar} ancho="max-w-sm">
      <form onSubmit={eliminar} className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Esto borra permanentemente todos los requerimientos con fecha de solicitud en el rango elegido. No se
          puede deshacer — exporta primero si quieres conservar un respaldo.
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
        <Field label={`Escribe "${PALABRA_CONFIRMACION}" para confirmar`}>
          <Input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} placeholder={PALABRA_CONFIRMACION} />
        </Field>
        <Field label="Tu contraseña">
          <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Btn variante="secundario" onClick={cerrar}>Cancelar</Btn>
          <Btn type="submit" variante="peligro" disabled={enviando} className="flex items-center gap-1.5">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {enviando ? 'Eliminando…' : 'Eliminar'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}
