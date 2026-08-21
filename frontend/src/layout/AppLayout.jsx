import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  Bell, ChevronDown, ChevronsLeft, ChevronsRight, FileText, LogOut, Moon, Search,
  Settings, Sun, Wifi, WifiOff,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { useAuth } from '../auth/AuthContext.jsx'
import { MODULOS_REGISTRO } from '../config/modulosRegistry.js'
import ContenidoRuta from './ContenidoRuta.jsx'
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
        className="group relative flex shrink-0 items-center justify-center rounded-xl p-2 transition-all duration-300 bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-cyan-500/30 text-slate-700 dark:text-cyan-300 hover:border-cyan-400 dark:hover:border-cyan-400 dark:shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:scale-105 active:scale-95"
      >
        {esOscuro ? (
          <Sun className="h-4 w-4 text-amber-400 group-hover:rotate-45 transition-transform duration-300" aria-hidden="true" />
        ) : (
          <Moon className="h-4 w-4 text-cyan-600 group-hover:-rotate-12 transition-transform duration-300" aria-hidden="true" />
        )}
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
          'panel-nav-link group relative flex items-center gap-3 rounded-lg py-1.5 text-[13px] font-normal transition-all duration-300',
          sub ? 'pl-9 pr-3' : 'px-3',
          isActive
            ? 'is-active text-cyan-700 dark:text-cyan-300 font-semibold shadow-sm'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10'
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Pastilla activa animada con resplandor neón estilo Copiloto */}
          {isActive && (
            <motion.span
              layoutId="sidebar-active-pill"
              className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/15 to-sky-500/10 dark:from-cyan-500/25 dark:to-sky-500/15 border border-cyan-500/30 dark:border-cyan-400/40 shadow-[0_0_20px_rgba(6,182,212,0.25)] backdrop-blur-sm"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative z-10 truncate flex-1">{label}</span>

          {isActive && (
            <span className="relative z-10 flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400"></span>
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

// Colapsado: el grupo se reduce a un ícono con un DropdownMenu al hacer
// click. Expandido: el acordeón con estilo cibernético neón.
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
                  'relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 group',
                  activo
                    ? 'bg-gradient-to-br from-cyan-500/20 to-sky-600/20 text-cyan-600 dark:text-cyan-300 border border-cyan-500/40 shadow-[0_0_18px_rgba(6,182,212,0.35)]'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-cyan-200 hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10'
                )}
              >
                {/* Resplandor Neón flotante */}
                <span
                  className={cn(
                    'absolute inset-0 rounded-xl transition-all duration-500 opacity-0 group-hover:opacity-100 pointer-events-none',
                    'bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                  )}
                />

                <modulo.icon
                  className={cn(
                    'h-4 w-4 relative z-10 transition-transform duration-300 group-hover:scale-110',
                    activo && 'animate-[copilot-pulse_3s_ease-in-out_infinite]'
                  )}
                  aria-hidden="true"
                />

                {activo && (
                  <span className="absolute top-1 right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
                  </span>
                )}
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
        className={cn(
          'group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-all duration-300',
          activo
            ? 'bg-cyan-500/10 dark:bg-cyan-400/15 text-cyan-700 dark:text-cyan-300 font-medium border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
            : 'text-slate-500 hover:text-slate-900 dark:hover:text-cyan-200 hover:bg-cyan-500/8 dark:hover:bg-cyan-400/8'
        )}
      >
        {/* Contenedor del ícono con resplandor neón estilo Copiloto */}
        <div
          className={cn(
            'relative flex h-5 w-5 items-center justify-center rounded-md transition-transform duration-300 group-hover:scale-110',
            activo
              ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border border-cyan-400/40 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
              : 'bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 group-hover:text-cyan-500'
          )}
        >
          <modulo.icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        </div>

        {/* Sobrio: tipografía sans del resto de la app (antes panel-mono,
            JetBrains Mono estilo HUD) en peso medio y tracking más cerrado —
            ya no compite en peso visual con el contenido de cada página. */}
        <span className="flex-1 text-[12px] font-medium tracking-[0.03em] uppercase">
          {modulo.label}
        </span>

        {activo && (
          <span className="flex h-1.5 w-1.5 relative mr-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400"></span>
          </span>
        )}

        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 transition-transform duration-200 text-slate-400 group-hover:text-cyan-400',
            !abierto && '-rotate-90'
          )}
          aria-hidden="true"
        />
      </button>
      <div id={idGrupo} className="flex flex-col gap-1 mt-1 pl-1" hidden={!abierto}>
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
  const { usuario, tieneModulo, tienePermiso, moduloActivo } = useAuth()

  return MODULOS_REGISTRO.map((m) => ({
    ...m,
    // item.soloSuperAdmin: a diferencia de item.permiso (que tienePermiso()
    // deja pasar a esSuperAdmin O a quien tenga ese código puntual), exige
    // el bypass en sí — para herramientas como el backup completo que no
    // deben aparecer aunque alguien delegue el permiso del grupo a otro rol.
    items: m.items.filter((item) => {
      if (item.soloSuperAdmin) return Boolean(usuario?.esSuperAdmin)
      return !item.permiso || [].concat(item.permiso).some((p) => tienePermiso(p))
    }),
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
    <Tooltip label={enLinea ? 'Conectado al servidor' : 'Sin conexión — algunos datos pueden estar desactualizados'} side="bottom">
      <span
        className={cn(
          'relative flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-mono border transition-all duration-300',
          enLinea
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 dark:shadow-[0_0_10px_rgba(16,185,129,0.3)]'
            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 animate-pulse'
        )}
      >
        <span className="flex h-2 w-2 relative">
          {enLinea && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span
            className={cn(
              'relative inline-flex rounded-full h-2 w-2',
              enLinea ? 'bg-emerald-400' : 'bg-rose-500'
            )}
          ></span>
        </span>
        {enLinea ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
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
          colapsado ? 'w-[4.5rem]' : 'w-60 4xl:w-72'
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
              <DropdownMenuItem asChild>
                <Link to="/legal">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Términos y privacidad
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* logout() ahora espera al backend y devuelve el mensaje de
                    error si la cookie de sesión no se pudo borrar. Sin este
                    aviso, un fallo de red dejaba la sesión viva en el servidor
                    mientras la UI decía que se había cerrado. */}
              <DropdownMenuItem
                destructivo
                onClick={async () => {
                  const error = await logout()
                  if (error) toast.error(error)
                }}
              >
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
        <header className="panel-navbar sticky top-0 z-30 hidden items-center justify-between gap-4 border-b border-slate-200/80 dark:border-cyan-500/25 px-6 py-3 md:flex backdrop-blur-xl bg-white/80 dark:bg-slate-950/80 shadow-[0_4px_25px_rgba(6,182,212,0.08)] transition-colors duration-300">
          <Breadcrumb items={breadcrumbItems} />
          <div className="flex shrink-0 items-center gap-2">
            {/* Botón de Búsqueda (Buscar, Ctrl K) con resplandor cibernético neón */}
            <button
              type="button"
              onClick={() => setPaletaAbierta(true)}
              className="panel-mono group relative flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-cyan-500/30 bg-slate-100/80 dark:bg-slate-900/80 px-3.5 py-1.5 text-xs text-slate-600 dark:text-cyan-300/90 transition-all duration-300 hover:border-cyan-400 dark:hover:border-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-200 dark:shadow-[0_0_15px_rgba(6,182,212,0.25)] hover:shadow-[0_0_22px_rgba(34,211,238,0.4)]"
            >
              <Search className="h-3.5 w-3.5 text-cyan-500 dark:text-cyan-400 transition-transform duration-300 group-hover:scale-110" aria-hidden="true" />
              <span className="font-semibold">Buscar</span>
              <kbd className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-bold text-cyan-600 dark:text-cyan-300 shadow-xs">
                Ctrl K
              </kbd>
            </button>

            <EstadoConexion />

            {tienePermiso('sistema:gestionar_modulos') && modulosApagados > 0 && (
              <Tooltip label="Módulos desactivados por el Super Admin" side="bottom">
                <Link
                  to="/sistema/modulos"
                  className="panel-mono flex items-center gap-1 rounded-full bg-amber-400/10 border border-amber-500/30 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                >
                  {modulosApagados} apagado{modulosApagados === 1 ? '' : 's'}
                </Link>
              </Tooltip>
            )}

            {/* Botón de Notificaciones con efecto flotante neón */}
            <Tooltip label="Notificaciones" side="bottom">
              <Link
                to="/notificaciones"
                className="group relative flex shrink-0 items-center justify-center rounded-xl p-2 transition-all duration-300 bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-cyan-500/30 text-slate-700 dark:text-cyan-300 hover:border-cyan-400 dark:hover:border-cyan-400 dark:shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:scale-105 active:scale-95"
              >
                <Bell className="h-4 w-4 text-cyan-600 dark:text-cyan-400 group-hover:rotate-12 transition-transform duration-300" aria-hidden="true" />
              </Link>
            </Tooltip>
            <ToggleTema tema={tema} onToggle={alternarTema} />
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto overscroll-contain p-[var(--ui-content-padding)]">
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
            <ContenidoRuta />
          </motion.div>
        </main>
      </div>
    </div>
  )
}
