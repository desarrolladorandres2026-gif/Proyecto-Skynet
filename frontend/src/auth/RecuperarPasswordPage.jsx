import { useState } from 'react'
import { Mail, AlertCircle, MailCheck } from 'lucide-react'
import { resetPassword } from '../api/auth.js'
import RecuperarLayout, { claseInput, claseLabel, claseBoton } from './RecuperarLayout.jsx'

// Paso 1: el usuario pide el enlace. El backend responde siempre lo mismo exista
// o no la cuenta (anti-enumeración), así que la pantalla de éxito tampoco
// confirma nada: solo dice que, si los datos coinciden, llegará un correo.
export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    if (enviando) return
    setError('')
    const correo = email.trim()
    if (!correo) {
      setError('Ingresa tu correo')
      return
    }
    // Misma regla que Backend/src/utils/regex.js (EMAIL_REGEX).
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError('El correo no tiene un formato válido (ej. usuario@terminalneiva.com)')
      return
    }
    setEnviando(true)
    try {
      await resetPassword.solicitar(correo)
      setEnviado(true)
    } catch (err) {
      setError(err.message || 'No se pudo procesar la solicitud. Inténtalo de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <RecuperarLayout titulo="Revisa tu correo">
        <div className="space-y-3 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-emerald-400" />
          <p className="text-sm text-slate-300">
            Si el correo corresponde a una cuenta activa, te enviamos un enlace para crear una
            nueva contraseña. El enlace vence en 1 hora.
          </p>
          <p className="text-xs text-slate-400">
            ¿No llega? Revisa la carpeta de spam o vuelve a intentarlo en unos minutos.
          </p>
        </div>
      </RecuperarLayout>
    )
  }

  return (
    <RecuperarLayout
      titulo="Recuperar contraseña"
      subtitulo="Ingresa el correo registrado en tu cuenta y te enviaremos un enlace"
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className={claseLabel}>CORREO</label>
          <div className="relative flex items-center">
            <Mail className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#4585bd]" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              disabled={enviando}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={claseInput}
              placeholder="usuario@terminalneiva.com"
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
              ENVIANDO…
            </>
          ) : (
            'ENVIAR ENLACE'
          )}
        </button>
      </form>
    </RecuperarLayout>
  )
}
