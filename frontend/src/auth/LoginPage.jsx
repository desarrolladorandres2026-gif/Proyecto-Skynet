import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import './login.css'

export default function LoginPage() {
  const { login, usuario } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  // Puesto por api/client.js cuando un 401 cierra una sesión que SÍ estaba
  // activa (típicamente porque un admin cambió el rol/permisos del usuario):
  // sin este aviso, el cierre de sesión se ve idéntico a un fallo silencioso.
  const [sesionInvalidada] = useState(
    () => sessionStorage.getItem('skynet_sesion_invalidada') === '1'
  )
  if (sesionInvalidada) sessionStorage.removeItem('skynet_sesion_invalidada')

  // Con sesión activa (incluido el instante posterior a un login exitoso),
  // esta página redirige al inicio: sin esto el login "funciona" pero la
  // pantalla se queda en /login sin dar señal alguna.
  if (usuario) return <Navigate to="/" replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="skynet-login relative flex min-h-svh items-center justify-center overflow-hidden px-4">
      {/* Fondo tipo HUD: grid táctico + líneas de escaneo, puramente decorativo */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="skynet-grid absolute inset-0" />
        <div className="skynet-scanline absolute inset-x-0 h-40" />
        <div className="skynet-glow absolute left-1/2 top-1/2" />
      </div>

      <div className="skynet-card relative w-full max-w-sm p-8">
        {/* Corner brackets: firma visual del diseño, simulan un visor de cámara/HUD */}
        <span className="skynet-bracket skynet-bracket--tl" aria-hidden="true" />
        <span className="skynet-bracket skynet-bracket--tr" aria-hidden="true" />
        <span className="skynet-bracket skynet-bracket--bl" aria-hidden="true" />
        <span className="skynet-bracket skynet-bracket--br" aria-hidden="true" />

        <div className="mb-8 text-center">
          <p className="skynet-mono mb-2 text-[11px] tracking-[0.35em] text-cyan-400/70">
            SISTEMA · ACCESO RESTRINGIDO
          </p>
          <h1 className="skynet-title skynet-title-glitch text-3xl text-white">SKYNET</h1>
          <p className="skynet-mono mt-2 text-xs text-slate-500">
            &gt; autenticación requerida para continuar_
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="skynet-field">
            <label htmlFor="email" className="skynet-mono mb-1.5 block text-[11px] tracking-[0.2em] text-cyan-400/80">
              CORREO
            </label>
            <div className="skynet-input-frame">
              <div className="skynet-input-glow" aria-hidden="true" />
              <div className="skynet-input-dark-bg" aria-hidden="true" />
              <div className="skynet-input-white" aria-hidden="true" />
              <div className="skynet-input-border" aria-hidden="true" />
              <span className="skynet-input-icon" aria-hidden="true">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <rect x={2} y={4} width={20} height={16} rx={2} />
                  <path d="m2 7 10 6 10-6" />
                </svg>
              </span>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="skynet-input w-full py-2.5 pl-10 pr-3 text-sm text-white"
                placeholder="usuario@dominio.com"
              />
            </div>
          </div>

          <div className="skynet-field">
            <label htmlFor="password" className="skynet-mono mb-1.5 block text-[11px] tracking-[0.2em] text-cyan-400/80">
              CONTRASEÑA
            </label>
            <div className="skynet-input-frame">
              <div className="skynet-input-glow" aria-hidden="true" />
              <div className="skynet-input-dark-bg" aria-hidden="true" />
              <div className="skynet-input-white" aria-hidden="true" />
              <div className="skynet-input-border" aria-hidden="true" />
              <span className="skynet-input-icon" aria-hidden="true">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <rect x={4} y={11} width={16} height={9} rx={2} />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              </span>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="skynet-input w-full py-2.5 pl-10 pr-3 text-sm text-white"
                placeholder="••••••••"
              />
            </div>
          </div>

          {!error && sesionInvalidada && (
            <p className="skynet-mono rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
              Tu sesión se cerró porque un administrador actualizó tu rol o tus permisos. Inicia sesión de nuevo para continuar.
            </p>
          )}

          {error && (
            <p className="skynet-mono rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              ERROR: {error}
            </p>
          )}

          <button type="submit" disabled={cargando} className="skynet-btn w-full">
            <span className="skynet-mono">
              {cargando ? 'VERIFICANDO…' : 'INICIAR SESIÓN'}
            </span>
          </button>
        </form>

        <p className="skynet-mono mt-6 text-center text-[10px] tracking-[0.15em] text-slate-600">
          CONEXIÓN CIFRADA · NODO LOCAL
        </p>
      </div>
    </div>
  )
}
