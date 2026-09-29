import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, FileText, Home, Menu, Search, Settings } from 'lucide-react'
import { registrarSlot } from './slotsBarraSuperior.js'
import bannerTerminal from '../assets/banner-terminal.png'
import { useAuth } from '../auth/AuthContext.jsx'
import { AvatarUsuario } from '../components/AvatarUsuario.jsx'
import { NotificacionesBell } from '../components/notificaciones/NotificacionesBell.jsx'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../components/DropdownMenu.jsx'

const refSlotSaludo = (el) => registrarSlot('saludo', el)
const refSlotAcciones = (el) => registrarSlot('acciones', el)

const btnNav =
  'hidden h-9 w-9 items-center justify-center rounded-full hover:bg-[#dedede] hover:text-[#222] sm:flex'

export default function BarraSuperior({ onAbrirMenu, onBuscar }) {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const inicial = (usuario?.nombre || '?').trim().charAt(0).toUpperCase()

  return (
    <header style={{
      backgroundImage: `linear-gradient(rgba(255,255,255,.72), rgba(255,255,255,.72)), url(${bannerTerminal})`,
      backgroundSize: '100% 100%, 100vw auto',
      backgroundAttachment: 'fixed',
      backgroundPosition: 'left -125px',
    }}
      className="sticky top-0 z-30 flex h-20 shrink-0 items-center gap-3 px-4 sm:gap-4 sm:px-6">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menú"
          className="rounded-full p-2 text-[#444] hover:bg-[#dedede] lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </button>
        <button type="button" onClick={() => navigate(-1)} aria-label="Atrás" className={`${btnNav} text-[#444]`}>
          <ArrowLeft className="h-5 w-5" strokeWidth={2.4} />
        </button>
        <button type="button" onClick={() => navigate(1)} aria-label="Adelante" className={`${btnNav} text-[#444]`}>
          <ArrowRight className="h-5 w-5" strokeWidth={2.4} />
        </button>
        <Link
          to="/"
          aria-label="Inicio"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[#303030] text-white transition hover:scale-105 hover:bg-[var(--color-primario)]"
        >
          <Home className="h-6 w-6" fill="currentColor" />
        </Link>
      </div>

      <button
        type="button"
        onClick={onBuscar}
        className="hidden h-12 w-52 flex-none items-center gap-3 rounded-full border border-[var(--color-linea)] bg-white px-5 text-left text-base font-medium text-[#777] transition focus-visible:border-[var(--color-primario)] focus-visible:ring-2 focus-visible:ring-[var(--color-primario)]/20 focus-visible:outline-none md:flex"
      >
        <Search className="h-6 w-6 shrink-0 text-[#666]" aria-hidden="true" />
        Buscar
      </button>

      <div ref={refSlotSaludo} className="hidden min-w-0 empty:hidden lg:block" />

      <div className="ml-auto flex items-center gap-3">
        <div ref={refSlotAcciones} className="flex items-center gap-1.5" />
        <div className="hidden text-[#666] sm:block"><NotificacionesBell /></div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-3 rounded-full border border-[var(--color-linea)] bg-white p-1 pr-3 hover:border-[var(--color-primario)]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primario)] text-base font-bold text-white ring-[3px] ring-white">
                {inicial}
              </span>
              <span className="hidden min-w-0 flex-col text-left xl:flex">
                <span className="max-w-36 truncate text-xs font-bold text-[#333]">{usuario?.nombre}</span>
                <span className="text-[10px] text-[#777]">{usuario?.rol?.nombre}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="w-56">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <AvatarUsuario usuario={usuario} className="h-8 w-8" />
              <DropdownMenuLabel className="truncate p-0 font-medium">{usuario?.nombre}</DropdownMenuLabel>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/notificaciones"><Settings className="h-4 w-4" aria-hidden="true" />Preferencias de notificaciones</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/legal"><FileText className="h-4 w-4" aria-hidden="true" />Términos y privacidad</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
