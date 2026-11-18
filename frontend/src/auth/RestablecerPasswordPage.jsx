import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { resetPassword } from '../api/auth.js'
import RecuperarLayout, { claseInput, claseLabel, claseBoton } from './RecuperarLayout.jsx'

// Misma regla que Backend/src/utils/password.js (PASSWORD_MIN); el backend
// sigue siendo quien valida de verdad.
const PASSWORD_MIN = 8

// Paso 2: el usuario llega desde el enlace del correo (/reset-password?token=…).
export default function RestablecerPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  // 'validando' | 'valido' | 'invalido' | 'listo'
  const [estado, setEstado] = useState(token ? 'validando' : 'invalido')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let activo = true
    resetPassword
      .validarToken(token)
      .then((r) => activo && setEstado(r?.valido ? 'valido' : 'invalido'))
      .catch(() => activo && setEstado('invalido'))
    return () => {
      activo = false
    }
  }, [token])

  async function onSubmit(e) {
    e.preventDefault()
    if (enviando) return
    setError('')
    if (password.length < PASSWORD_MIN) {
      setError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`)
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden')
      return
    }
    setEnviando(true)
    try {
      await resetPassword.restablecer(token, password)
      setEstado('listo')
    } catch (err) {
      setError(err.message || 'No se pudo restablecer la contraseña.')
    } finally {
      setEnviando(false)
    }
  }

  if (estado === 'validando') {
    return (
      <RecuperarLayout titulo="Nueva contraseña">
        <p className="text-center text-sm text-slate-400">Verificando enlace…</p>
      </RecuperarLayout>
    )
  }

  if (estado === 'invalido') {
    return (
      <RecuperarLayout titulo="Enlace no válido">
        <div className="space-y-3 text-center">
          <XCircle className="mx-auto h-10 w-10 text-red-400" />
          <p className="text-sm text-slate-300">
            Este enlace es inválido, ya fue usado o venció. Solicita uno nuevo para continuar.
          </p>
          <Link
            to="/recuperar-password"
            className="inline-block text-sm font-medium text-[#4585bd] hover:text-blue-300 hover:underline"
          >
            Solicitar un nuevo enlace
          </Link>
        </div>
      </RecuperarLayout>
    )
  }

  if (estado === 'listo') {
    return (
      <RecuperarLayout titulo="Contraseña actualizada">
        <div className="space-y-3 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
          <p className="text-sm text-slate-300">
            Ya puedes iniciar sesión con tu nueva contraseña. Las sesiones abiertas en otros
            dispositivos se cerraron por seguridad.
          </p>
        </div>
      </RecuperarLayout>
    )
  }

  return (
    <RecuperarLayout titulo="Nueva contraseña" subtitulo={`Mínimo ${PASSWORD_MIN} caracteres`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="nueva_password" className={claseLabel}>NUEVA CONTRASEÑA</label>
          <div className="relative flex items-center">
            <Lock className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#4585bd]" />
            <input
              id="nueva_password"
              type={mostrar ? 'text' : 'password'}
              autoComplete="new-password"
              required
              disabled={enviando}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${claseInput} pr-10`}
              placeholder="••••••••••••"
            />
            <button
              type="button"
              onClick={() => setMostrar(!mostrar)}
              className="absolute right-3 p-1 text-slate-400 transition-colors hover:text-white"
              tabIndex={-1}
              title={mostrar ? 'Ocultar contraseña' : 'Ver contraseña'}
            >
              {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmar_password" className={claseLabel}>CONFIRMAR CONTRASEÑA</label>
          <div className="relative flex items-center">
            <Lock className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#4585bd]" />
            <input
              id="confirmar_password"
              type={mostrar ? 'text' : 'password'}
              autoComplete="new-password"
              required
              disabled={enviando}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className={claseInput}
              placeholder="••••••••••••"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <p className="font-mono font-medium">ERROR: {error}</p>
          </div>
        )}

        <button type="submit" disabled={enviando} className={claseBoton}>
          {enviando ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              GUARDANDO…
            </>
          ) : (
            'GUARDAR CONTRASEÑA'
          )}
        </button>
      </form>
    </RecuperarLayout>
  )
}
