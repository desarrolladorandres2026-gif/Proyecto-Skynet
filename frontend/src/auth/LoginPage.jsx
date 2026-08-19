import { useState, useEffect, useRef } from 'react'
import { Navigate, useNavigate, Link } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import './login.css'

export default function LoginPage() {
  const { login, usuario } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  // Fases de la animación: 'idle' | 'verificando' | 'concedido' | 'entrando'
  const [fase, setFase] = useState('idle')
  const [usuarioData, setUsuarioData] = useState(null)
  const [telemetriaPaso, setTelemetriaPaso] = useState(0)
  const intervalRef = useRef(null)

  // Puesto por api/client.js cuando un 401 cierra una sesión activa
  const [sesionInvalidada] = useState(
    () => sessionStorage.getItem('skynet_sesion_invalidada') === '1'
  )
  if (sesionInvalidada) sessionStorage.removeItem('skynet_sesion_invalidada')

  // Telemetría animada rápida durante verificación
  useEffect(() => {
    if (fase === 'verificando') {
      setTelemetriaPaso(1)
      intervalRef.current = setInterval(() => {
        setTelemetriaPaso((prev) => (prev < 3 ? prev + 1 : prev))
      }, 250)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fase])

  // Temporizadores optimizados: rápidos, fluidos y sin trabas
  useEffect(() => {
    if (fase === 'concedido') {
      const tConcedido = setTimeout(() => {
        setFase('entrando')
      }, 750)

      return () => clearTimeout(tConcedido)
    }

    if (fase === 'entrando') {
      const tEntrando = setTimeout(() => {
        navigate('/', { replace: true })
      }, 200)

      return () => clearTimeout(tEntrando)
    }
  }, [fase, navigate])

  // Si ya hay usuario previo y estamos en reposo, redirigir directo
  if (usuario && fase === 'idle') {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (fase !== 'idle') return

    setError('')
    setFase('verificando')

    try {
      const resUsuario = await login(email, password)
      setUsuarioData(resUsuario)
      setFase('concedido')
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión. Verifica tus credenciales.')
      setFase('idle')
    }
  }

  const enSecuencia = fase === 'concedido' || fase === 'entrando'
  const cargando = fase === 'verificando' || enSecuencia

  return (
    <div
      className="skynet-login relative flex min-h-svh items-center justify-center overflow-hidden px-4"
      onClick={() => {
        if (enSecuencia) navigate('/', { replace: true })
      }}
    >
      {/* Transición suave al entrar */}
      {fase === 'entrando' && <div className="skynet-portal-flash" aria-hidden="true" />}

      {/* Fondo tipo HUD: grid táctico optimizado */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className={`skynet-grid absolute inset-0 ${enSecuencia ? 'skynet-grid-warp' : ''}`} />
        <div className="skynet-scanline absolute inset-x-0 h-40" />
        <div className={`skynet-glow absolute left-1/2 top-1/2 ${enSecuencia ? 'skynet-glow-active' : ''}`} />
      </div>

      {/* Onda expansiva ligera al autorizar */}
      {enSecuencia && <div className="skynet-shockwave" aria-hidden="true" />}

      <div
        className={`skynet-card relative w-full max-w-md p-6 sm:p-8 ${
          fase === 'verificando'
            ? 'skynet-card-verificando'
            : enSecuencia
            ? 'skynet-card-concedido'
            : ''
        }`}
      >
        {/* Haz de escaneo láser activo durante la verificación */}
        {fase === 'verificando' && <div className="skynet-scan-beam" aria-hidden="true" />}

        {/* Corner brackets */}
        <span className="skynet-bracket skynet-bracket--tl" aria-hidden="true" />
        <span className="skynet-bracket skynet-bracket--tr" aria-hidden="true" />
        <span className="skynet-bracket skynet-bracket--bl" aria-hidden="true" />
        <span className="skynet-bracket skynet-bracket--br" aria-hidden="true" />

        {enSecuencia ? (
          /* =========================================================
             SECUENCIA ÉPICA LIGERA: ACCESO CONCEDIDO
             ========================================================= */
          <div className="py-2 text-center cursor-pointer select-none">
            {/* Retícula holográfica fluida */}
            <div className="skynet-hud-reticle">
              <div className="skynet-ring-outer" />
              <div className="skynet-ring-mid" />
              <div className="skynet-ring-inner">
                <svg
                  className="h-8 w-8 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <p className="skynet-mono text-[11px] font-semibold tracking-[0.3em] text-emerald-400">
              ACCESO CONCEDIDO
            </p>

            <h2 className="skynet-title skynet-granted-text my-2 text-xl sm:text-2xl text-white">
              SKYNET ONLINE
            </h2>

            <div className="my-4 rounded border border-cyan-500/30 bg-cyan-950/40 p-3 text-left">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1.5 text-[11px]">
                <span className="skynet-mono text-cyan-400/70">OPERADOR:</span>
                <span className="skynet-mono font-bold text-white">
                  {usuarioData?.nombre_usuario || usuarioData?.nombre || email.split('@')[0]}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-cyan-500/20 py-1.5 text-[11px]">
                <span className="skynet-mono text-cyan-400/70">CLEARANCE:</span>
                <span className="skynet-mono text-emerald-400">
                  {usuarioData?.rol?.nombre || usuarioData?.rol?.slug || 'AUTORIZADO'}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1.5 text-[11px]">
                <span className="skynet-mono text-cyan-400/70">ESTADO:</span>
                <span className="skynet-mono text-cyan-300">SINCRONIZADO</span>
              </div>
            </div>

            {/* Barra de progreso rápida */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] tracking-widest text-cyan-400/80">
                <span className="skynet-mono">INICIALIZANDO</span>
                <span className="skynet-mono">100%</span>
              </div>
              <div className="skynet-progress-track">
                <div className="skynet-progress-fill" />
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================
             FORMULARIO PRINCIPAL DE LOGIN
             ========================================================= */
          <>
            <div className="mb-6 text-center">
              <p className="skynet-mono mb-2 text-[11px] tracking-[0.35em] text-cyan-400/70">
                SISTEMA · ACCESO RESTRINGIDO
              </p>
              <h1 className="skynet-title skynet-title-glitch text-3xl text-white">SKYNET</h1>
              <p className="skynet-mono mt-2 text-xs text-slate-400">
                &gt; autenticación requerida_
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="skynet-field">
                <label
                  htmlFor="email"
                  className="skynet-mono mb-1.5 block text-[11px] tracking-[0.2em] text-cyan-400/80"
                >
                  CORREO
                </label>
                <div className="skynet-input-frame">
                  <span className="skynet-input-icon" aria-hidden="true">
                    <svg
                      width={16}
                      height={16}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x={2} y={4} width={20} height={16} rx={2} />
                      <path d="m2 7 10 6 10-6" />
                    </svg>
                  </span>
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    disabled={cargando}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="skynet-input w-full py-2.5 pl-10 pr-3 text-sm text-white"
                    placeholder="usuario@dominio.com"
                  />
                </div>
              </div>

              <div className="skynet-field">
                <label
                  htmlFor="password"
                  className="skynet-mono mb-1.5 block text-[11px] tracking-[0.2em] text-cyan-400/80"
                >
                  CONTRASEÑA
                </label>
                <div className="skynet-input-frame">
                  <span className="skynet-input-icon" aria-hidden="true">
                    <svg
                      width={16}
                      height={16}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x={4} y={11} width={16} height={9} rx={2} />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  </span>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    disabled={cargando}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="skynet-input w-full py-2.5 pl-10 pr-3 text-sm text-white"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {/* Registro de telemetría ligero */}
              {fase === 'verificando' && (
                <div className="space-y-1 rounded border border-cyan-500/20 bg-cyan-950/30 p-2 text-[10px] text-cyan-300">
                  <div className="skynet-terminal-line skynet-mono text-cyan-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                    <span>[01] INICIANDO HANDSHAKE...</span>
                  </div>
                  {telemetriaPaso >= 2 && (
                    <div className="skynet-terminal-line skynet-mono text-cyan-300">
                      <span>&gt;</span>
                      <span>[02] VALIDANDO CREDENCIALES...</span>
                    </div>
                  )}
                  {telemetriaPaso >= 3 && (
                    <div className="skynet-terminal-line skynet-mono text-emerald-400">
                      <span>&gt;</span>
                      <span>[03] CONECTANDO A SKYNET...</span>
                    </div>
                  )}
                </div>
              )}

              {!error && sesionInvalidada && (
                <p className="skynet-mono rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
                  Tu sesión se cerró porque un administrador actualizó tu rol o tus permisos. Inicia sesión de nuevo para continuar.
                </p>
              )}

              {error && (
                <p className="skynet-mono rounded-md border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                  ERROR: {error}
                </p>
              )}

              <button
                type="submit"
                disabled={cargando}
                className="skynet-btn w-full"
              >
                <span className="skynet-mono flex items-center justify-center gap-2">
                  {fase === 'verificando' ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                      VERIFICANDO…
                    </>
                  ) : (
                    'INICIAR SESIÓN'
                  )}
                </span>
              </button>
            </form>

            <p className="skynet-mono mt-5 text-center text-[10px] tracking-[0.15em] text-slate-500">
              CONEXIÓN CIFRADA · NODO LOCAL
            </p>

            <p className="mt-3 text-center text-[11px] text-slate-500">
              Al continuar aceptas las{' '}
              <Link to="/legal#politica-sgi" className="text-cyan-400 underline-offset-2 hover:underline">
                políticas del SGI
              </Link>{' '}
              y la{' '}
              <Link to="/legal#privacidad" className="text-cyan-400 underline-offset-2 hover:underline">
                política de privacidad
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  )
}
