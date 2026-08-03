import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Bell, ChevronDown, ChevronsLeft, ChevronsRight, LogOut, Moon, Search,
  Settings, Sun, Wifi, WifiOff,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Toaster } from 'sonner'
import { useAuth } from '../auth/AuthContext.jsx'
import { MODULOS_REGISTRO } from '../config/modulosRegistry.js'
import { cn } from '../lib/cn.js'
import { Tooltip } from '../components/Tooltip.jsx'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../components/DropdownMenu.jsx'
import { Breadcrumb } from '../components/Breadcrumb.jsx'
import { CommandPalette, useCommandPalette } from '../components/CommandPalette.jsx'
// panel.css se importa una sola vez, globalmente, desde index.css — junto
// con mobileShell.css — para que páginas universales (ej. Reportar daño)
// tengan sus tokens sin importar qué shell (AppShell.jsx) las envuelva.

export const TEMA_KEY = 'skynet-tema'
const SIDEBAR_KEY = 'skynet-sidebar-colapsado'

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

// Solo el sidebar desktop de AppLayout lo usa (MobileShell no tiene noción
// de "colapsado"), así que a diferencia de useTema no hace falta exportarlo.
function useSidebarColapsado() {
  const [colapsado, setColapsado] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1')
  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, colapsado ? '1' : '0')
  }, [colapsado])
  return [colapsado, () => setColapsado((v) => !v)]
}

export function ToggleTema({ tema, onToggle }) {
  const esOscuro = tema === 'dark'
  return (
    <Tooltip label={esOscuro ? 'Modo claro' : 'Modo oscuro'} side="bottom">
      <button
        type="button"
        onClick={onToggle}
        aria-label={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        className="panel-btn-fantasma shrink-0 rounded-lg p-1.5"
      >
        {esOscuro ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
      </button>
    </Tooltip>
  )
}

function EnlaceNav({ to, label, end, onNavigate, sub = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'panel-nav-link relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium',
          sub ? 'pl-9 pr-3' : 'px-3',
          isActive && 'is-active'
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* layoutId compartido entre todos los EnlaceNav activos en el
              árbol: al cambiar de ruta, Framer Motion anima ESTE elemento
              deslizándose desde la posición del anterior en vez de aparecer
              de golpe (solo existe una instancia con este layoutId a la vez,
              porque solo un NavLink puede estar activo). */}
          {isActive && (
            <motion.span
              layoutId="sidebar-active-pill"
              className="absolute inset-0 rounded-lg bg-[var(--panel-navlink-active-bg)]"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
          <span className="relative z-10 truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}

// Colapsado: el grupo se reduce a un ícono con un DropdownMenu al hacer
// click (los items sub no tienen ícono propio en MODULOS_REGISTRO, así que
// un rail de solo-íconos no puede mostrarlos directamente — el flyout
// resuelve eso sin tener que inventarle un ícono a cada uno de los ~35
// items). Expandido: el acordeón de siempre.
function GrupoNav({ modulo, idPrefix, abierto, onToggle, onNavigate, colapsado, activo }) {
  const idGrupo = `grupo-${idPrefix}-${modulo.key}`

  if (colapsado) {
    return (
      <div className="mb-1 flex justify-center">
        <Tooltip label={modulo.label} side="right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={modulo.label}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                  activo
                    ? 'bg-[var(--panel-navlink-active-bg)] text-[var(--panel-navlink-active-color)]'
                    : 'text-slate-500 hover:bg-brand-600/8 dark:text-slate-400 dark:hover:bg-brand-400/8'
                )}
              >
                <modulo.icon className="h-5 w-5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" sideOffset={12}>
              <DropdownMenuLabel>{modulo.label}</DropdownMenuLabel>
              {modulo.items.map((item) => (
                <DropdownMenuItem key={item.to} asChild>
                  <NavLink to={item.to} end={item.end} onClick={onNavigate}>
                    {item.label}
                  </NavLink>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        aria-controls={idGrupo}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-slate-500 transition hover:bg-brand-600/5 hover:text-slate-700 dark:hover:bg-brand-400/5 dark:hover:text-slate-300"
      >
        <modulo.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="panel-mono flex-1 text-[11px] font-semibold uppercase tracking-[0.15em]">
          {modulo.label}
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-150', !abierto && '-rotate-90')}
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

// idPrefix distingue los ids de aria-controls entre los distintos árboles
// que pueden montar NavContent a la vez (sidebar desktop / menú móvil del
// panel admin / hoja "Más" del shell móvil) para que no colisionen.
// colapsado solo lo usa el sidebar desktop de AppLayout — MobileShell nunca
// lo pasa, así que su render no cambia.
export function NavContent({ modulosVisibles, idPrefix, onNavigate, colapsado = false }) {
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
    <nav className={cn('flex flex-col gap-1 p-3', colapsado && 'items-center px-2')}>
      {modulosVisibles.map((m) => (
        <GrupoNav
          key={m.key}
          modulo={m}
          idPrefix={idPrefix}
          abierto={grupoAbierto === m.key}
          onToggle={() => setGrupoAbierto((actual) => (actual === m.key ? null : m.key))}
          onNavigate={onNavigate}
          colapsado={colapsado}
          activo={grupoConRutaActiva === m.key}
        />
      ))}
    </nav>
  )
}

function useBreadcrumbItems(modulosVisibles, pathname) {
  return useMemo(() => {
    for (const grupo of modulosVisibles) {
      const item = grupo.items.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
      if (item) {
        const items = [{ label: grupo.label }]
        if (item.label !== grupo.label) items.push({ label: item.label })
        return items
      }
    }
    return [{ label: 'Panel' }]
  }, [modulosVisibles, pathname])
}

// Pill honesta de conectividad (navigator.onLine): nada de métricas
// inventadas tipo latencia falsa — si no hay un dato real que mostrar, no
// se inventa uno para que la barra "se vea llena".
function EstadoConexion() {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)

  useEffect(() => {
    function marcarOnline() { setEnLinea(true) }
    function marcarOffline() { setEnLinea(false) }
    window.addEventListener('online', marcarOnline)
    window.addEventListener('offline', marcarOffline)
    return () => {
      window.removeEventListener('online', marcarOnline)
      window.removeEventListener('offline', marcarOffline)
    }
  }, [])

  return (
    <Tooltip label={enLinea ? 'Conectado' : 'Sin conexión — algunos datos pueden estar desactualizados'} side="bottom">
      <span className={cn('flex items-center rounded-lg p-2', enLinea ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
        {enLinea ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
      </span>
    </Tooltip>
  )
}

export default function AppLayout() {
  const { usuario, logout, tienePermiso } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)
  // El panel admin arrancaba siempre en modo oscuro (tema HUD) forzando la
  // clase "dark" sin importar preferencia del usuario. Ahora es un toggle
  // persistido: la misma clase "dark" en <html> sigue activando tanto las
  // variables de tema de panel.css como los dark: de Tailwind ya presentes
  // en las páginas de módulos — un solo interruptor para todo el sistema.
  // (El estado inicial ya lo aplica un script inline en index.html, antes
  // del primer render, para no parpadear en claro al cargar con tema oscuro.)
  const [tema, alternarTema] = useTema()
  const [colapsado, alternarColapsado] = useSidebarColapsado()
  const modulosVisibles = useModulosVisibles()
  const [paletaAbierta, setPaletaAbierta] = useCommandPalette()
  const { pathname } = useLocation()
  const prefiereReducido = useReducedMotion()
  const breadcrumbItems = useBreadcrumbItems(modulosVisibles, pathname)
  const modulosApagados = usuario?.modulosDesactivados?.length ?? 0

  const inicialUsuario = (usuario?.nombre || '?').trim().charAt(0).toUpperCase()

  return (
      <div className="panel-shell flex h-svh flex-col md:flex-row">
        <Toaster
          position="bottom-right"
          theme={tema}
          toastOptions={{
            classNames: {
              toast: 'panel-modal !rounded-xl',
              title: '!text-slate-900 dark:!text-white text-sm font-medium',
              description: '!text-slate-500 dark:!text-slate-400 text-xs',
            },
          }}
        />
        <CommandPalette abierto={paletaAbierta} onAbrirCambio={setPaletaAbierta} modulosVisibles={modulosVisibles} />

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
        <aside
          className={cn(
            'panel-sidebar relative hidden shrink-0 border-r transition-[width] duration-200 ease-out md:flex md:flex-col',
            colapsado ? 'w-[4.5rem]' : 'w-60'
          )}
        >
          <div className="panel-grid pointer-events-none absolute inset-0" aria-hidden="true" />
          <div
            className={cn(
              'relative flex items-center border-b border-slate-900/6 px-4 py-4 dark:border-white/8',
              colapsado ? 'justify-center' : 'justify-between'
            )}
          >
            {!colapsado && <span className="panel-mono panel-brand text-lg font-bold tracking-[0.2em]">SKYNET</span>}
            <Tooltip label={colapsado ? 'Expandir' : 'Colapsar'} side="right">
              <button
                onClick={alternarColapsado}
                aria-label={colapsado ? 'Expandir panel lateral' : 'Colapsar panel lateral'}
                className="panel-btn-fantasma shrink-0 rounded-lg p-1.5"
              >
                {colapsado ? (
                  <ChevronsRight className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </Tooltip>
          </div>
          <div className="relative flex-1 overflow-y-auto overscroll-contain">
            <NavContent modulosVisibles={modulosVisibles} idPrefix="escritorio" colapsado={colapsado} />
          </div>
          <div className="relative border-t border-slate-900/6 p-3 dark:border-white/8">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-brand-600/5 dark:hover:bg-brand-400/5',
                    colapsado && 'justify-center'
                  )}
                >
                  <span className="panel-mono flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-xs font-bold text-brand-700 dark:bg-brand-400/10 dark:text-brand-300">
                    {inicialUsuario}
                  </span>
                  {!colapsado && (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                        {usuario?.nombre}
                      </span>
                      <span className="panel-mono block truncate text-[10px] tracking-wide text-brand-700/70 uppercase dark:text-brand-400/60">
                        {usuario?.rol?.nombre}
                      </span>
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-56">
                <DropdownMenuLabel>{usuario?.nombre}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/notificaciones">
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    Preferencias de notificaciones
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructivo onClick={logout}>
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Navbar: no existía antes — cada página pintaba su propio <h1>
              suelto dentro de <main>. Único lugar del panel con
              glassmorphism real (panel-navbar en panel.css): flota sobre el
              contenido al hacer scroll. */}
          <header className="panel-navbar sticky top-0 z-30 hidden items-center justify-between gap-4 border-b px-6 py-3 md:flex">
            <Breadcrumb items={breadcrumbItems} />
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPaletaAbierta(true)}
                className="panel-mono mr-1 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-400 transition hover:border-brand-400/50 hover:text-slate-600 dark:border-white/10 dark:hover:border-brand-400/40 dark:hover:text-slate-300"
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                Buscar
                <kbd className="rounded border border-slate-300 px-1 text-[10px] dark:border-white/15">Ctrl K</kbd>
              </button>
              <EstadoConexion />
              {tienePermiso('sistema:gestionar_modulos') && modulosApagados > 0 && (
                <Tooltip label="Módulos desactivados por el Super Admin" side="bottom">
                  <Link
                    to="/sistema/modulos"
                    className="panel-mono flex items-center gap-1 rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
                  >
                    {modulosApagados} apagado{modulosApagados === 1 ? '' : 's'}
                  </Link>
                </Tooltip>
              )}
              <Tooltip label="Notificaciones" side="bottom">
                <Link to="/notificaciones" className="panel-btn-fantasma rounded-lg p-2">
                  <Bell className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Tooltip>
              <ToggleTema tema={tema} onToggle={alternarTema} />
            </div>
          </header>

          <main className="relative flex-1 overflow-y-auto overscroll-contain p-4 md:p-6">
            {/* Igual que en el sidebar: el grid decorativo va en una capa
                aparte, no en el propio <main> — su mask-image difumina TODO
                lo que pinta el elemento, y aquí eso incluye el contenido
                real de cada módulo. */}
            <div className="panel-grid pointer-events-none absolute inset-0" aria-hidden="true" />
            <motion.div
              key={pathname}
              initial={prefiereReducido ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              <Outlet />
            </motion.div>
          </main>
        </div>
      </div>
  )
}
