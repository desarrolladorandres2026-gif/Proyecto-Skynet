import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, Menu as MenuIcon, LogOut, FileText, Search } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useModulosVisibles, useTema, ToggleTema } from './AppLayout.jsx'
import ContenidoRuta from './ContenidoRuta.jsx'
import { MOBILE_NAV_POR_ROL, INICIO_ITEM } from '../config/mobileNavPorRol.js'
import { BottomSheet, ListRow } from '../components/mobileUi.jsx'
import { AvatarUsuario } from '../components/AvatarUsuario.jsx'
import claroLogo from '../assets/claro.png'
// panel.css y mobileShell.css se cargan globalmente desde index.css (ver
// comentario ahí) — las páginas que todavía no pasaron por su etapa de
// rediseño móvil siguen usando Card/Btn/Input/TablaWrap de components/ui.jsx
// (variables --panel-*), y este shell necesita sus propias --mobile-*.

import { cn } from '../lib/cn.js'

// Quita tildes tras descomponer NFD (p. ej. "ó" -> "o" + marca de acento
// U+0301) para que buscar "ordenes" encuentre "Órdenes de trabajo".
function normalizarTexto(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Contenido de la hoja "Más": a diferencia del acordeón de escritorio
// (NavContent/GrupoNav en AppLayout.jsx), acá cada módulo arranca CERRADO
// — un rol con muchos módulos (Email trae 6 sub-páginas, por ejemplo) no
// debe desplegar todo su contenido de una sola vez, solo para navegar a una
// página. Un tap en el módulo lo abre (y cierra el que estuviera abierto:
// un solo grupo desplegado a la vez, igual que el sidebar de escritorio),
// otro tap en su ítem navega. La búsqueda es la excepción: si el usuario ya
// escribió qué busca, sí queremos la fila final visible sin un tap extra.
export function MasSheetContent({ modulosVisibles, rutasOcultas, onNavigate }) {
  const { pathname } = useLocation()
  const [busqueda, setBusqueda] = useState('')

  // 'dashboard' (→ /dashboard) y cualquier atajo curado de mobileNavPorRol.js
  // ya viven en la barra inferior a un tap — repetirlos acá sería la misma
  // ruta dos veces en dos menús distintos.
  const gruposBase = modulosVisibles
    .filter((m) => m.key !== 'dashboard')
    .map((m) => ({ ...m, items: m.items.filter((item) => !rutasOcultas.has(item.to)) }))
    .filter((m) => m.items.length > 0)

  const totalItems = gruposBase.reduce((n, m) => n + m.items.length, 0)
  // Un módulo con un solo item de por sí (Usuarios, Roles, Auditoría...) es
  // "único" sin importar la búsqueda. Ojo: esto NO debe recalcularse sobre
  // la lista ya filtrada por búsqueda — si "Email" (6 items) queda en 1 tras
  // escribir "bandeja de entrada", sigue siendo un módulo multi-item, solo
  // que con un resultado; debe seguir mostrando su encabezado + esa fila con
  // SU propia etiqueta, no colapsar al link con la etiqueta del módulo.
  const gruposUnicos = new Set(gruposBase.filter((m) => m.items.length === 1).map((m) => m.key))

  // El módulo que contiene la ruta actual arranca abierto (igual que el
  // sidebar de escritorio) — si estás en "Bandeja Bodega", "Requerimientos"
  // ya aparece desplegado en vez de obligarte a buscarlo y abrirlo tú mismo.
  const grupoConRutaActiva = gruposBase.find((m) =>
    m.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
  )?.key
  const [grupoAbierto, setGrupoAbierto] = useState(grupoConRutaActiva)
  useEffect(() => {
    if (grupoConRutaActiva) setGrupoAbierto(grupoConRutaActiva)
  }, [grupoConRutaActiva])

  const query = normalizarTexto(busqueda.trim())
  const buscando = query.length > 0
  const grupos = buscando
    ? gruposBase
        .map((m) => ({
          ...m,
          items: m.items.filter(
            (item) => normalizarTexto(item.label).includes(query) || normalizarTexto(m.label).includes(query)
          ),
        }))
        .filter((m) => m.items.length > 0)
    : gruposBase

  return (
    <div className="flex flex-col gap-2">
      {/* Con pocos módulos visibles (Bodega, Seguridad, Mantenimiento...) la
          lista entera ya cabe de un vistazo — el buscador ahí solo sería
          ruido. Con muchos (Admin, Super Admin...) es la salida rápida a no
          tener que abrir módulo por módulo para dar con uno. */}
      {totalItems > 8 && (
        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--mobile-text-dim)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar módulo..."
            className="m-row w-full rounded-2xl py-2.5 pr-3 pl-10 text-sm text-[var(--mobile-text)] placeholder:text-[var(--mobile-text-dim)] focus:outline-none"
          />
        </div>
      )}

      {grupos.length === 0 && (
        <p className="py-6 text-center text-sm text-[var(--mobile-text-dim)]">
          Sin resultados para &quot;{busqueda}&quot;
        </p>
      )}

      {grupos.map((m) => {
        const abierto = buscando || grupoAbierto === m.key
        return (
          <div key={m.key}>
            {/* Un solo item (p. ej. "Usuarios" o "Roles"): nada que
                desplegar, así que el módulo entero navega directo y no
                finge ser un acordeón de una sola fila. */}
            {gruposUnicos.has(m.key) ? (
              <Link to={m.items[0].to} onClick={onNavigate}>
                <ListRow icon={m.icon} title={m.label} />
              </Link>
            ) : (
              <>
                <ListRow
                  icon={m.icon}
                  title={m.label}
                  onClick={buscando ? undefined : () => setGrupoAbierto((actual) => (actual === m.key ? null : m.key))}
                  trailing={
                    buscando ? undefined : (
                      <ChevronDown
                        className={cn('h-4 w-4 shrink-0 text-[var(--mobile-text-dim)] transition-transform', !abierto && '-rotate-90')}
                        aria-hidden="true"
                      />
                    )
                  }
                />
                {abierto && (
                  <div className="mt-1 mb-1 flex flex-col gap-1 pl-4">
                    {m.items.map((item) => (
                      <Link key={item.to} to={item.to} onClick={onNavigate}>
                        <ListRow title={item.label} className="!border-0 !bg-transparent !shadow-none" />
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

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
  // Todo lo que ya es un tap directo en la barra inferior (Inicio + los
  // atajos curados de este rol) no necesita repetirse en la hoja "Más".
  const rutasEnBarra = new Set([INICIO_ITEM.to, ...accesos.map((item) => item.to)])

  return (
    <div className="m-shell flex h-svh flex-col">
      <header className="m-bar flex shrink-0 items-center justify-between border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={claroLogo} alt="Logo Terminal" className="h-6 w-6 object-contain shrink-0" />
          <span className="panel-mono panel-brand text-xs sm:text-sm font-bold tracking-[0.12em] truncate">TERMINAL DE NEIVA</span>
        </div>
        <div className="flex items-center gap-2">
          <ToggleTema tema={tema} onToggle={alternarTema} />
          <button
            type="button"
            onClick={() => setCuentaAbierta(true)}
            aria-label="Cuenta"
            className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden border border-brand-500/30 shadow-2xs"
          >
            <AvatarUsuario usuario={usuario} className="h-full w-full object-cover" />
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
        <MasSheetContent
          modulosVisibles={modulosVisibles}
          rutasOcultas={rutasEnBarra}
          onNavigate={() => setMasAbierto(false)}
        />
      </BottomSheet>

      <BottomSheet abierto={cuentaAbierta} titulo="Cuenta" onCerrar={() => setCuentaAbierta(false)}>
        <div className="flex items-center gap-3 mb-3">
          <AvatarUsuario usuario={usuario} className="h-12 w-12 shadow-sm shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--mobile-text)] truncate">{usuario?.nombre}</p>
            <p className="panel-mono mt-0.5 text-[11px] tracking-wide text-[var(--mobile-accent)] uppercase truncate">{usuario?.rol?.nombre}</p>
            {usuario?.email && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{usuario?.email}</p>}
          </div>
        </div>
        <NavLink
          to="/legal"
          onClick={() => setCuentaAbierta(false)}
          className="mt-4 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--mobile-text)] hover:bg-[var(--mobile-accent)]/10"
        >
          <FileText className="h-4 w-4" aria-hidden="true" /> Términos y privacidad
        </NavLink>
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
