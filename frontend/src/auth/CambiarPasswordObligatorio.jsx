import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useAuth } from './AuthContext.jsx'
import { Btn, Card, ErrorMsg, Field, Input } from '../components/ui.jsx'

// Pantalla que ProtectedRoute muestra en vez de la app cuando
// usuario.debeCambiarPassword es true (contraseña de seed o asignada por un
// admin): bloquea el resto de Skynet hasta que la persona ponga una propia.
export default function CambiarPasswordObligatorio() {
  const { cambiarPassword } = useAuth()
  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNueva, setPasswordNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')

    if (passwordNueva !== confirmacion) {
      setError('La nueva contraseña y su confirmación no coinciden.')
      return
    }
    if (passwordNueva === passwordActual) {
      setError('La nueva contraseña debe ser distinta de la actual.')
      return
    }

    setEnviando(true)
    try {
      await cambiarPassword(passwordActual, passwordNueva)
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la contraseña.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          <KeyRound className="h-8 w-8 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Debes cambiar tu contraseña</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tu contraseña actual fue asignada por un administrador. Elige una propia antes de continuar.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <Field label="Contraseña actual">
            <Input
              type="password"
              value={passwordActual}
              onChange={(e) => setPasswordActual(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="Nueva contraseña (mínimo 12 caracteres)">
            <Input
              type="password"
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
            />
          </Field>
          <Field label="Confirmar nueva contraseña">
            <Input
              type="password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
            />
          </Field>

          <ErrorMsg>{error}</ErrorMsg>

          <Btn type="submit" disabled={enviando} className="w-full justify-center">
            {enviando ? 'Guardando…' : 'Cambiar contraseña'}
          </Btn>
        </form>
      </Card>
    </div>
  )
}
