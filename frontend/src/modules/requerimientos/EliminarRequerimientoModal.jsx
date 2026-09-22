import { useState } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Btn, Field, Input, Modal, ErrorMsg } from '../../components/ui.jsx'

// Borrado puntual de UN requerimiento (Super Admin — ver requerimientos.routes.js:
// soloAdmin). Mismo patrón de reautenticación con contraseña que aprobar/
// despachar; a diferencia de EliminarRequerimientosModal.jsx (purga por
// rango) no pide escribir "ELIMINAR" porque acá no hay rango que fat-finger:
// el objetivo ya quedó fijado por el clic sobre esa fila específica.
export default function EliminarRequerimientoModal({ abierto, requerimiento, onCerrar, onEliminado }) {
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  function cerrar() {
    setPassword('')
    setError('')
    setEnviando(false)
    onCerrar()
  }

  async function eliminar(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await requerimientosApi.eliminar(requerimiento._id, password)
      onEliminado?.(requerimiento._id)
      cerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal abierto={abierto} titulo="Eliminar requerimiento" onCerrar={cerrar} ancho="max-w-sm">
      <form onSubmit={eliminar} className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg border border-warn-500/30 bg-warn-500/10 px-3 py-2 text-sm text-warn-800 dark:text-warn-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Esto borra permanentemente el requerimiento de {requerimiento?.tipo} de{' '}
          {requerimiento?.solicitante?.nombre}. No se puede deshacer.
        </p>
        <ErrorMsg>{error}</ErrorMsg>
        <Field label="Tu contraseña">
          <Input type="password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
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
