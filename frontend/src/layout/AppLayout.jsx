import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChevronDown, GraduationCap, Moon, Sun } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { MODULOS_REGISTRO } from '../config/modulosRegistry.js'
// panel.css se importa una sola vez, globalmente, desde index.css — junto
// con mobileShell.css — para que páginas universales (ej. Reportar daño)
// tengan sus tokens sin importar qué shell (AppShell.jsx) las envuelva.

export const TEMA_KEY = 'skynet-tema'

function temaGuardado() {
  return localStorage.getItem(TEMA_KEY) === 'light' ? 'light' : 'dark'
}

// Compartido por AppLayout (panel admin) y MobileShell (roles no-admin):
// misma clase "dark" en <html>, mismo storage key — un solo interruptor de
// tema para toda la app sin importar qué shell esté montado.
export function useTema() {
  const [tema, setTema] = useState(temaGuardado)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark')
    localStorage.setItem(TEMA_KEY, tema)
  }, [tema])

  useEffect(() => {
    return () => document.documentElement.classList.remove('dark')
  }, [])

  return [tema, () => setTema((t) => (t === 'dark' ? 'light' : 'dark'))]
}

export function ToggleTema({ tema, onToggle }) {
  const esOscuro = tema === 'dark'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={esOscuro ? 'Modo claro' : 'Modo oscuro'}
      className="panel-btn-fantasma shrink-0 rounded-lg p-1.5"
    >
      {esOscuro ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  )
}

function EnlaceNav({ to, label, end, onNavigate, sub = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `panel-nav-link flex items-center gap-3 rounded-lg py-2 text-sm font-medium ${sub ? 'pl-9 pr-3' : 'px-3'} ${
          isActive ? 'is-active' : ''
        }`
      }
    >
      {label}
    </NavLink>
  )
}

function GrupoNav({ modulo, idPrefix, abierto, onToggle, onNavigate }) {
  const idGrupo = `grupo-${idPrefix}-${modulo.key}`
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        aria-controls={idGrupo}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-slate-500 transition hover:bg-cyan-600/5 hover:text-slate-700 dark:hover:bg-cyan-400/5 dark:hover:text-slate-300"
      >
        <modulo.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="panel-mono flex-1 text-[11px] font-semibold uppercase tracking-[0.15em]">
          {modulo.label}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${abierto ? '' : '-rotate-90'}`}
          aria-hidden="true"
        />
      </button>
      {/* hidden (no desmontar) para que aria-controls siempre apunte a un id
          que existe en el DOM, aunque el grupo esté colapsado. */}
      <div id={idGrupo} className="flex flex-col gap-1" hidden={!abierto}>
        {modulo.items.map((item) => (
          <EnlaceNav key={item.to} {...item} sub onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  )
}

// Se filtran los items por su permiso propio (string o array de
// alternativas); luego el módulo entero por su gate — o, si no declara
// ninguno, por si le sobrevivió al menos un item. Un módulo desactivado por
// el Super Admin (/sistema/modulos) desaparece para todos los roles.
// Exportado porque tanto AppLayout (panel admin) como MobileShell (roles
// no-admin) necesitan la misma lista filtrada para su navegación.
export function useModulosVisibles() {
  const { tieneModulo, tienePermiso, moduloActivo } = useAuth()

  return MODULOS_REGISTRO.map((m) => ({
    ...m,
    items: m.items.filter(
      (item) => !item.permiso || [].concat(item.permiso).some((p) => tienePermiso(p))
    ),
  })).filter((m) => {
    if (!moduloActivo(m.key)) return false
    if (m.items.length === 0) return false
    if (m.publico) return true
    if (m.legacyModulo) return tieneModulo(m.legacyModulo)
    // Igual que el filtro de items arriba: m.permiso puede ser un string o
    // un array de alternativas (ver mantenimiento_ordenes en
    // modulosRegistry.js). Pasar el array directo a tienePermiso siempre
    // daba false (Array.includes compara por referencia) — el grupo
    // "Órdenes de trabajo" nunca aparecía en NINGÚN sidebar para nadie.
    if (m.permiso) return [].concat(m.permiso).some((p) => tienePermiso(p))
    return true
  })
}

export function NavContent({ modulosVisibles, idPrefix, onNavigate }) {
  const { pathname } = useLocation()

  // El grupo que contiene la ruta activa se auto-expande; el resto arranca
  // colapsado. Es un acordeón de un solo grupo abierto a la vez: mostrar
  // todos los items de todos los módulos simultáneamente era lo que hacía
  // crecer el sidebar mucho más allá del alto de la pantalla.
  const grupoConRutaActiva = modulosVisibles.find((m) =>
    m.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
  )?.key

  const [grupoAbierto, setGrupoAbierto] = useState(grupoConRutaActiva)

  useEffect(() => {
    if (grupoConRutaActiva) setGrupoAbierto(grupoConRutaActiva)
  }, [grupoConRutaActiva])

  return (
    <nav className="flex flex-col gap-1 p-3">
      {/* Inducción es contenido de onboarding, no un módulo asignable: se ve
          siempre, incluso para un usuario recién creado sin módulos aún. */}
      <div className="mb-1">
        <p className="panel-mono flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
          Inducción
        </p>
        <EnlaceNav to="/induccion" label="Inducción" end sub onNavigate={onNavigate} />
      </div>

      {modulosVisibles.map((m) => (
        <GrupoNav
          key={m.key}
          modulo={m}
          idPrefix={idPrefix}
          abierto={grupoAbierto === m.key}
          onToggle={() => setGrupoAbierto((actual) => (actual === m.key ? null : m.key))}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}

export default function AppLayout() {
  const { usuario, logout } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)
  // El panel admin arrancaba siempre en modo oscuro (tema HUD) forzando la
  // clase "dark" sin importar preferencia del usuario. Ahora es un toggle
  // persistido: la misma clase "dark" en <html> sigue activando tanto las
  // variables de tema de panel.css como los dark: de Tailwind ya presentes
  // en las páginas de módulos — un solo interruptor para todo el sistema.
  // (El estado inicial ya lo aplica un script inline en index.html, antes
  // del primer render, para no parpadear en claro al cargar con tema oscuro.)
  const [tema, alternarTema] = useTema()
  const modulosVisibles = useModulosVisibles()

  return (
    <div className="panel-shell flex h-svh flex-col md:flex-row">
      {/* Header móvil */}
      <header className="panel-sidebar flex items-center justify-between border-b px-4 py-3 md:hidden">
        <span className="panel-mono panel-brand text-sm font-bold tracking-[0.2em]">SKYNET</span>
        <div className="flex items-center gap-2">
          <ToggleTema tema={tema} onToggle={alternarTema} />
          <button
            onClick={() => setMenuAbierto((v) => !v)}
            className="panel-btn-secundario rounded-lg px-3 py-1.5 text-sm"
          >
            Menú
          </button>
        </div>
      </header>
      {menuAbierto && (
        <div className="panel-sidebar max-h-[70svh] overflow-y-auto overscroll-contain border-b md:hidden">
          <NavContent modulosVisibles={modulosVisibles} idPrefix="movil" onNavigate={() => setMenuAbierto(false)} />
        </div>
      )}

      {/* Sidebar desktop */}
      <aside className="panel-sidebar relative hidden w-60 shrink-0 border-r md:flex md:flex-col">
        <div className="panel-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative flex items-center justify-between border-b border-cyan-600/15 px-4 py-4 dark:border-cyan-400/10">
          <span className="panel-mono panel-brand text-lg font-bold tracking-[0.2em]">SKYNET</span>
          <ToggleTema tema={tema} onToggle={alternarTema} />
        </div>
        <div className="relative flex-1 overflow-y-auto overscroll-contain">
          <NavContent modulosVisibles={modulosVisibles} idPrefix="escritorio" />
        </div>
        <div className="relative border-t border-cyan-600/15 p-3 dark:border-cyan-400/10">
          <p className="truncate px-3 text-sm font-medium text-slate-700 dark:text-slate-200">{usuario?.nombre}</p>
          <p className="panel-mono truncate px-3 text-[11px] uppercase tracking-wide text-cyan-700/70 dark:text-cyan-400/60">{usuario?.rol?.nombre}</p>
          <button
            onClick={logout}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="relative flex-1 overflow-y-auto overscroll-contain p-4 md:p-6">
        {/* Igual que en el sidebar: el grid decorativo va en una capa aparte,
            no en el propio <main> — su mask-image difumina TODO lo que pinta
            el elemento, y aquí eso incluye el contenido real de cada módulo. */}
        <div className="panel-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
