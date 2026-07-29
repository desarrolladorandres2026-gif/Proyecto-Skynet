import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Btn, Field, Input, Modal, ErrorMsg } from './ui.jsx'

// "Firma digital" = reingreso de contraseña como challenge de identidad
// dentro de una sesión ya autenticada. `onConfirmar(password)` debe lanzar
// si el backend la rechaza (contraseña incorrecta) — el modal se queda
// abierto mostrando el error y permite reintentar.
export default function ReautenticacionModal({
  abierto,
  titulo = 'Confirmar firma',
  descripcion,
  onConfirmar,
  onCerrar,
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  function cerrar() {
    setPassword('')
    setError('')
    setEnviando(false)
    onCerrar()
  }

  async function confirmar(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await onConfirmar(password)
      cerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={cerrar} ancho="max-w-sm">
      <form onSubmit={confirmar} className="space-y-4">
        {descripcion && <p className="text-sm text-slate-600 dark:text-slate-300">{descripcion}</p>}
        <ErrorMsg>{error}</ErrorMsg>
        <Field label="Tu contraseña">
          <Input
            type="password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Btn variante="secundario" onClick={cerrar}>Cancelar</Btn>
          <button
            type="submit"
            disabled={enviando}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-60"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            {enviando ? 'Confirmando…' : 'Confirmar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
