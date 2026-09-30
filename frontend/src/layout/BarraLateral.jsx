import { NavLink, useLocation } from 'react-router-dom'
import { LogOut, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../auth/AuthContext.jsx'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../components/DropdownMenu.jsx'
import { cn } from '../lib/cn.js'

const coincide = (pathname, to) =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)

const claseItem = (activo) =>
  cn(
    'relative flex w-full flex-col items-center gap-1 border-b border-[var(--color-linea)] px-1 py-2.5 text-[11px] font-medium tracking-wide transition-colors duration-150',
    activo
      ? 'font-semibold text-[#141414]'
      : 'text-[#555] hover:bg-black/4 hover:text-[#161616]'
  )

function Contenido({ modulo, activo }) {
  return (
    <>
      {activo && (
        <span className="absolute left-0 top-1/2 h-12 w-1 -translate-y-1/2 rounded-r-full bg-accent-600" />
      )}
      <modulo.icon className={cn('h-[25px] w-[25px]', activo && 'text-[#292929]')} aria-hidden="true" />
      <span title={modulo.label} className="line-clamp-2 w-full break-words text-center leading-tight">{modulo.label}</span>
    </>
  )
}

function ItemModulo({ modulo, onNavigate }) {
  const { pathname } = useLocation()
  const activo = modulo.items.some((i) => coincide(pathname, i.to))

  if (modulo.items.length === 1) {
    return (
      <NavLink to={modulo.items[0].to} onClick={onNavigate} className={claseItem(activo)}>
        <Contenido modulo={modulo} activo={activo} />
      </NavLink>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={claseItem(activo)}>
          <Contenido modulo={modulo} activo={activo} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" sideOffset={8}>
        <DropdownMenuLabel>{modulo.label}</DropdownMenuLabel>
        {modulo.items.map((item) => (
          <DropdownMenuItem key={item.to} asChild>
            <NavLink to={item.to} end={item.end} onClick={onNavigate}>{item.label}</NavLink>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function BarraLateral({ modulosVisibles, abierta, onCerrar }) {
  const { logout } = useAuth()

  return (
    <>
      {abierta && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={onCerrar}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-30 flex-col border-r border-[var(--color-linea)] bg-white shadow-[1px_0_3px_rgba(0,0,0,.08)] transition-transform duration-300 ease-out',
          'lg:static lg:z-auto lg:translate-x-0',
          abierta ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="relative flex h-14 shrink-0 items-center justify-center gap-2 border-b border-[var(--color-linea)]">
          <span className="text-[15px] font-semibold tracking-tight text-[#4b4b4b]">Skynet</span>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar menú"
            className="absolute right-1 top-1 text-[#555] hover:text-[#111] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="barra-scroll flex flex-1 flex-col overflow-y-auto">
          {modulosVisibles.map((m) => (
            <ItemModulo key={m.key} modulo={m} onNavigate={onCerrar} />
          ))}
        </nav>

        <div className="shrink-0 border-t border-[var(--color-linea)] px-2 py-2">
          <button
            type="button"
            onClick={async () => {
              const error = await logout()
              if (error) toast.error(error)
            }}
            className="flex w-full flex-col items-center gap-1 text-[10px] text-[#555] transition-colors hover:text-red-600"
          >
            <LogOut className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            Salir
          </button>
        </div>
      </aside>
    </>
  )
}
