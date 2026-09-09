import { useState, useEffect, useRef } from 'react'
import { Navigate, useNavigate, Link } from 'react-router-dom'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowRight,
  AlertCircle
} from 'lucide-react'
import { useAuth } from './AuthContext.jsx'
import logoClaro from '../assets/claro.png'
import './login.css'

export default function LoginPage() {
  const { login, usuario } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
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
      className="skynet-login-root relative flex h-svh w-full flex-col overflow-hidden lg:grid lg:h-auto lg:min-h-svh lg:grid-cols-12 lg:overflow-x-hidden"
      onClick={() => {
        if (enSecuencia) navigate('/', { replace: true })
      }}
    >
      {/* Transición suave al entrar */}
      {fase === 'entrando' && <div className="skynet-portal-flash" aria-hidden="true" />}

      {/* Luces y esferas de ambiente institucional */}
      <div className="skynet-ambient-layer pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="skynet-blob skynet-blob-1" />
        <div className="skynet-blob skynet-blob-2" />
        <div className="skynet-blob skynet-blob-3" />
        <div className={`skynet-grid-overlay ${enSecuencia ? 'skynet-grid-warp' : ''}`} />
      </div>

      {/* Onda expansiva al autorizar */}
      {enSecuencia && <div className="skynet-shockwave" aria-hidden="true" />}

      {/* =========================================================
          COLUMNA 1: HERO IMAGE SHOWCASE (EL TERMINAL DE NEIVA)
          ========================================================= */}
      <div className="skynet-hero-col relative lg:col-span-7 xl:col-span-7 2xl:col-span-8 flex shrink-0 flex-col justify-end overflow-hidden p-4 sm:p-10 lg:p-12 xl:p-16 min-h-[120px] max-h-[24svh] lg:max-h-none lg:min-h-svh">
        
        {/* Foto real del Terminal con gradientes cinemáticos a pantalla completa */}
        <div className="skynet-hero-img-wrapper absolute inset-0">
          <div className="skynet-hero-img" />
          <div className="skynet-hero-vignette absolute inset-0" />
        </div>

        {/* Pie inferior del Hero: Título institucional y lema */}
        <div className="relative z-10 pt-0 lg:pt-10">
          <h2 className="text-base sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white drop-shadow-lg leading-tight">
            Terminal de Transportes <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-blue-300 via-emerald-300 to-amber-300 bg-clip-text text-transparent">
              de Neiva S.A.
            </span>
          </h2>

          <p className="mt-3 hidden sm:block text-sm sm:text-base lg:text-lg text-slate-200/90 font-normal max-w-xl leading-relaxed drop-shadow">
            Centro neurálgico de movilidad y transporte intermunicipal de Colombia. Plataforma integral de gestión operativa, despachos y seguridad unificada.
          </p>
        </div>
      </div>



      {/* =========================================================
          COLUMNA 2: TARJETA DE LOGIN / ACCESO (PANTALLA COMPLETA)
          ========================================================= */}
      <div
        className={`skynet-card-col relative lg:col-span-5 xl:col-span-5 2xl:col-span-4 flex min-h-0 flex-1 flex-col justify-center overflow-y-auto p-4 sm:p-10 lg:min-h-svh lg:flex-none lg:p-12 xl:p-14 bg-slate-900/95 lg:bg-slate-900/90 backdrop-blur-2xl border-t lg:border-t-0 lg:border-l border-white/10 shadow-2xl z-20 ${
          fase === 'verificando'
            ? 'skynet-card-verificando'
            : enSecuencia
            ? 'skynet-card-concedido'
            : ''
        }`}
      >
        {/* Barra superior de acento tricolor corporativo (Azul - Verde - Naranja) */}
        <div className="absolute top-0 left-0 right-0 h-1.5 w-full bg-gradient-to-r from-[#1c568c] via-[#5a982c] to-[#d96b12]" />

        <div className="w-full max-w-md mx-auto my-auto py-2 lg:py-6">
          {/* Haz de escaneo activo durante la verificación */}
          {fase === 'verificando' && <div className="skynet-scan-beam" aria-hidden="true" />}


            {enSecuencia ? (
              /* =========================================================
                 ESTADO: ACCESO CONCEDIDO
                 ========================================================= */
              <div className="py-6 text-center cursor-pointer select-none">
                <div className="skynet-hud-reticle mb-4">
                  <div className="skynet-ring-outer" />
                  <div className="skynet-ring-mid" />
                  <div className="skynet-ring-inner">
                    <CheckCircle2 className="h-9 w-9 text-emerald-400 animate-pulse" />
                  </div>
                </div>

                <div className="inline-block rounded-full bg-emerald-500/10 px-3 py-1 border border-emerald-500/30 text-[11px] font-bold tracking-[0.25em] text-emerald-400 uppercase mb-2">
                  ACCESO CONCEDIDO
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  TERMINAL DE NEIVA ONLINE
                </h2>

                <div className="my-5 rounded-xl border border-blue-500/20 bg-slate-950/60 p-4 text-left shadow-inner">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 text-xs">
                    <span className="font-mono text-slate-400">OPERADOR:</span>
                    <span className="font-mono font-bold text-white">
                      {usuarioData?.nombre_usuario || usuarioData?.nombre || email.split('@')[0]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/10 py-2 text-xs">
                    <span className="font-mono text-slate-400">CLEARANCE:</span>
                    <span className="font-mono font-semibold text-emerald-400">
                      {usuarioData?.rol?.nombre || usuarioData?.rol?.slug || 'AUTORIZADO'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 text-xs">
                    <span className="font-mono text-slate-400">ESTADO:</span>
                    <span className="font-mono text-blue-300 font-medium">SINCRONIZADO</span>
                  </div>
                </div>

                {/* Barra de progreso fluida */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] tracking-wider text-slate-400 font-mono">
                    <span>CARGANDO SISTEMA</span>
                    <span className="text-emerald-400 font-bold">100%</span>
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
              <div className="flex flex-col justify-center">
                {/* Logo institucional con aura */}
                <div className="mb-4 sm:mb-6 text-center">
                  <div className="group relative mx-auto mb-2.5 sm:mb-3.5 flex h-14 w-14 sm:h-24 sm:w-24 items-center justify-center rounded-2xl bg-gradient-to-b from-white to-slate-100 p-2 sm:p-2.5 shadow-xl ring-4 ring-blue-500/20 transition-transform duration-300 hover:scale-105">
                    <img
                      src={logoClaro}
                      alt="Terminal de Transportes de Neiva"
                      className="h-full w-full object-contain"
                    />
                  </div>

                  <p className="font-mono text-[10px] sm:text-[11px] font-semibold tracking-[0.25em] text-[#4585bd] uppercase">
                    PORTAL DE GESTIÓN &amp; CONTROL
                  </p>
                  <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-white">
                    Iniciar Sesión
                  </h1>
                  <p className="mt-1 text-xs text-slate-400">
                    Ingresa tus credenciales autorizadas
                  </p>
                </div>

                <form onSubmit={onSubmit} className="space-y-3 sm:space-y-4">
                  {/* Campo Correo */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="email"
                      className="block font-mono text-[11px] font-medium tracking-wider text-slate-300 uppercase"
                    >
                      CORREO
                    </label>
                    <div className="relative flex items-center">
                      <div className="pointer-events-none absolute left-3.5 flex items-center text-slate-400">
                        <Mail className="h-4 w-4 text-[#4585bd]" />
                      </div>
                      <input
                        id="email"
                        type="email"
                        autoComplete="username"
                        required
                        disabled={cargando}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-slate-950/60 py-2.5 pl-10 pr-3.5 text-sm text-white placeholder-slate-500 shadow-inner outline-none transition duration-200 focus:border-[#4585bd] focus:bg-slate-950/90 focus:ring-2 focus:ring-[#4585bd]/30 disabled:opacity-50"
                        placeholder="usuario@terminalneiva.com"
                      />
                    </div>
                  </div>

                  {/* Campo Contraseña con Toggle para ver/ocultar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="password"
                        className="block font-mono text-[11px] font-medium tracking-wider text-slate-300 uppercase"
                      >
                        CONTRASEÑA
                      </label>
                    </div>
                    <div className="relative flex items-center">
                      <div className="pointer-events-none absolute left-3.5 flex items-center text-slate-400">
                        <Lock className="h-4 w-4 text-[#4585bd]" />
                      </div>
                      <input
                        id="password"
                        type={mostrarPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        disabled={cargando}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-slate-950/60 py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-500 shadow-inner outline-none transition duration-200 focus:border-[#4585bd] focus:bg-slate-950/90 focus:ring-2 focus:ring-[#4585bd]/30 disabled:opacity-50"
                        placeholder="••••••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarPassword(!mostrarPassword)}
                        className="absolute right-3 p-1 text-slate-400 hover:text-white transition-colors"
                        tabIndex={-1}
                        title={mostrarPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      >
                        {mostrarPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Telemetría animada durante verificación */}
                  {fase === 'verificando' && (
                    <div className="space-y-1.5 rounded-xl border border-blue-500/20 bg-blue-950/30 p-3 text-[11px] text-blue-200">
                      <div className="flex items-center gap-2 font-mono text-blue-300">
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-400 animate-ping" />
                        <span>[01] INICIANDO HANDSHAKE DE RED...</span>
                      </div>
                      {telemetriaPaso >= 2 && (
                        <div className="flex items-center gap-2 font-mono text-blue-200">
                          <span>&gt;</span>
                          <span>[02] VALIDANDO CREDENCIALES EN SERVIDOR...</span>
                        </div>
                      )}
                      {telemetriaPaso >= 3 && (
                        <div className="flex items-center gap-2 font-mono text-emerald-400">
                          <span>&gt;</span>
                          <span>[03] ESTABLECIENDO SESIÓN SEGURA...</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Alerta de sesión cerrada/invalidada */}
                  {!error && sesionInvalidada && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                      <p>
                        Tu sesión se cerró porque un administrador actualizó tu rol o tus permisos. Inicia sesión de nuevo para continuar.
                      </p>
                    </div>
                  )}

                  {/* Alerta de Error */}
                  {error && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                      <p className="font-mono font-medium">ERROR: {error}</p>
                    </div>
                  )}

                  {/* Botón Principal de Envío */}
                  <button
                    type="submit"
                    disabled={cargando}
                    className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#1c568c] via-[#2468a3] to-[#1c568c] py-3 px-4 text-sm font-semibold tracking-wide text-white shadow-lg shadow-blue-900/40 transition-all duration-200 hover:from-[#2468a3] hover:to-[#184873] hover:shadow-blue-800/60 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="font-mono flex items-center justify-center gap-2">
                      {fase === 'verificando' ? (
                        <>
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          VERIFICANDO…
                        </>
                      ) : (
                        <>
                          INICIAR SESIÓN
                          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                        </>
                      )}
                    </span>
                  </button>
                </form>

                {/* Pie con enlace de política de privacidad */}
                <div className="mt-4 pt-3 sm:mt-6 sm:pt-4 border-t border-white/10 text-center">
                  <p className="text-[11px] text-slate-400">
                    Al continuar aceptas la{' '}
                    <Link
                      to="/legal#privacidad"
                      className="text-[#4585bd] font-medium hover:text-blue-300 underline-offset-2 hover:underline transition-colors"
                    >
                      política de privacidad
                    </Link>
                    .
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  )
}


