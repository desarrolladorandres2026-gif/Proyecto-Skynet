import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Menu as MenuIcon, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useModulosVisibles, useTema, ToggleTema, NavContent } from './AppLayout.jsx'
import ContenidoRuta from './ContenidoRuta.jsx'
import { MOBILE_NAV_POR_ROL, INICIO_ITEM } from '../config/mobileNavPorRol.js'
import { BottomSheet } from '../components/mobileUi.jsx'
// panel.css y mobileShell.css se cargan globalmente desde index.css (ver
// comentario ahí) — las páginas que todavía no pasaron por su etapa de
// rediseño móvil siguen usando Card/Btn/Input/TablaWrap de components/ui.jsx
// (variables --panel-*), y este shell necesita sus propias --mobile-*.

import { cn } from '../lib/cn.js'

function TabItem({ to, end, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'm-navitem relative flex flex-1 flex-col items-center justify-center gap-1 py-1.5 transition-all duration-300',
          isActive && 'is-active scale-105'
        )
      }
    >
      {({ isActive }) => (
        <>
          <div
            className={cn(
              'relative flex items-center justify-center p-2 rounded-2xl transition-all duration-300',
              isActive
                ? 'bg-gradient-to-br from-cyan-500/20 to-sky-600/20 text-cyan-400 border border-cyan-400/40 shadow-[0_0_20px_rgba(34,211,238,0.4)] backdrop-blur-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-cyan-500/10'
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {isActive && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400 border border-slate-900"></span>
              </span>
            )}
          </div>
          <span
            className={cn(
              'text-[10px] font-medium transition-colors',
              isActive ? 'text-cyan-400 font-bold' : 'text-slate-400'
            )}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

export default function MobileShell() {
  const { usuario, logout } = useAuth()
  const [tema, alternarTema] = useTema()
  const modulosVisibles = useModulosVisibles()
  const [masAbierto, setMasAbierto] = useState(false)
  const [cuentaAbierta, setCuentaAbierta] = useState(false)
  const [errorLogout, setErrorLogout] = useState(null)

  // Los atajos curados de mobileNavPorRol.js se validan contra los módulos
  // que este usuario realmente tiene habilitados — así un atajo nunca apunta
  // a una ruta bloqueada por permiso o por el interruptor de módulos.
  const rutasPermitidas = new Set(modulosVisibles.flatMap((m) => m.items.map((i) => i.to)))
  const accesos = (MOBILE_NAV_POR_ROL[usuario?.rol?.slug] || []).filter((item) => rutasPermitidas.has(item.to))

  const iniciales = (usuario?.nombre || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?'

  return (
    <div className="m-shell flex h-svh flex-col">
      <header className="m-bar flex shrink-0 items-center justify-between border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="panel-mono panel-brand text-sm font-bold tracking-[0.2em]">SKYNET</span>
        <div className="flex items-center gap-2">
          <ToggleTema tema={tema} onToggle={alternarTema} />
          <button
            type="button"
            onClick={() => setCuentaAbierta(true)}
            aria-label="Cuenta"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mobile-accent)] text-xs font-bold text-[var(--mobile-accent-fg)]"
          >
            {iniciales}
          </button>
        </div>
      </header>

      <main className="relative flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <ContenidoRuta />
      </main>

      <nav className="m-bar flex shrink-0 items-stretch border-t pb-[env(safe-area-inset-bottom)]">
        <TabItem to={INICIO_ITEM.to} end={INICIO_ITEM.end} icon={INICIO_ITEM.icon} label={INICIO_ITEM.label} />
        {accesos.map((item) => (
          <TabItem key={item.to} to={item.to} icon={item.icon} label={item.label} />
        ))}
        <button
          type="button"
          onClick={() => setMasAbierto(true)}
          className="m-navitem flex flex-1 flex-col items-center justify-center gap-1 py-2"
        >
          <MenuIcon className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] font-medium">Más</span>
          <span className="m-navdot h-1 w-1 rounded-full" aria-hidden="true" />
        </button>
      </nav>

      <BottomSheet abierto={masAbierto} titulo="Módulos" onCerrar={() => setMasAbierto(false)}>
        <NavContent modulosVisibles={modulosVisibles} idPrefix="movil-mas" onNavigate={() => setMasAbierto(false)} />
      </BottomSheet>

      <BottomSheet abierto={cuentaAbierta} titulo="Cuenta" onCerrar={() => setCuentaAbierta(false)}>
        <p className="text-sm font-medium text-[var(--mobile-text)]">{usuario?.nombre}</p>
        <p className="panel-mono mt-0.5 text-[11px] tracking-wide text-[var(--mobile-accent)] uppercase">{usuario?.rol?.nombre}</p>
        {/* logout() espera al backend: si la cookie httpOnly no se pudo borrar,
            la sesión SIGUE viva en el servidor y hay que decirlo en vez de
            mandar al login como si nada. Este shell no monta el Toaster de
            sonner (vive en AppLayout), así que el aviso va en línea. */}
        <button
          type="button"
          onClick={async () => setErrorLogout(await logout())}
          className="mt-4 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" /> Cerrar sesión
        </button>
        {errorLogout && (
          <p className="mt-2 px-3 text-xs text-red-600 dark:text-red-400">{errorLogout}</p>
        )}
      </BottomSheet>
    </div>
  )
}
