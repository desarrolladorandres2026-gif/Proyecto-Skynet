import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import logoClaro from '../assets/claro.png'
import './login.css'

// Marco común de las pantallas públicas de recuperación de contraseña
// (solicitar y restablecer). Reutiliza el look del login sin su secuencia
// animada ni la columna hero: aquí solo hay una tarjeta centrada.
export default function RecuperarLayout({ titulo, subtitulo, children }) {
  return (
    <div className="skynet-login-root relative flex min-h-svh w-full items-center justify-center overflow-hidden p-4">
      <div className="skynet-ambient-layer pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="skynet-blob skynet-blob-1" />
        <div className="skynet-blob skynet-blob-2" />
        <div className="skynet-blob skynet-blob-3" />
      </div>

      <div className="relative z-20 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-2xl sm:p-10">
        <div className="absolute left-0 right-0 top-0 h-1.5 w-full bg-gradient-to-r from-[#1c568c] via-[#5a982c] to-[#d96b12]" />

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3.5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-b from-white to-slate-100 p-2.5 shadow-xl ring-4 ring-blue-500/20">
            <img src={logoClaro} alt="Terminal de Transportes de Neiva" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{titulo}</h1>
          {subtitulo && <p className="mt-1.5 text-sm text-slate-400">{subtitulo}</p>}
        </div>

        {children}

        <div className="mt-6 border-t border-white/10 pt-4 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4585bd] transition-colors hover:text-blue-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  )
}

export const claseInput =
  'w-full rounded-xl border border-white/15 bg-slate-950/60 py-3 sm:py-2.5 pl-10 pr-3.5 text-base sm:text-sm text-white placeholder-slate-500 shadow-inner outline-none transition duration-200 focus:border-[#4585bd] focus:bg-slate-950/90 focus:ring-2 focus:ring-[#4585bd]/30 disabled:opacity-50'

export const claseLabel = 'block font-mono text-[11px] font-medium tracking-wider text-slate-300 uppercase'

export const claseBoton =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1c568c] via-[#2468a3] to-[#1c568c] py-3.5 sm:py-3 px-4 font-mono text-sm font-semibold tracking-wide text-white shadow-lg shadow-blue-900/40 transition-all duration-200 hover:from-[#2468a3] hover:to-[#184873] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60'
