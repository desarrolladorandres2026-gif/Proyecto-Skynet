import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Toaster } from 'sonner'
import { useAuth } from '../auth/AuthContext.jsx'
import { MODULOS_REGISTRO } from '../config/modulosRegistry.js'
import BarraLateral from './BarraLateral.jsx'
import BarraSuperior from './BarraSuperior.jsx'
import ContenidoRuta from './ContenidoRuta.jsx'
import { Tooltip } from '../components/Tooltip.jsx'
import { CommandPalette, useCommandPalette } from '../components/CommandPalette.jsx'
// panel.css se importa una sola vez, globalmente, desde index.css — junto
// con mobileShell.css — para que páginas universales (ej. Reportar daño)
// tengan sus tokens sin importar qué shell (AppShell.jsx) las envuelva.

export const TEMA_KEY = 'skynet-tema'

function temaGuardado() {
  // Por defecto institucional: claro. Solo 'dark' si el usuario lo eligió.
  return localStorage.getItem(TEMA_KEY) === 'dark' ? 'dark' : 'light'
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
    <Tooltip label={esOscuro ? 'Modo claro' : 'Modo oscuro'} side="bottom">
      <button
        type="button"
        onClick={onToggle}
        aria-label={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        className="group relative flex shrink-0 items-center justify-center rounded-xl p-2 transition-all duration-300 bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-brand-500/30 text-slate-700 dark:text-brand-300 hover:border-brand-400 dark:hover:border-brand-400 dark:shadow-[0_0_15px_rgba(31,77,143,0.3)] hover:scale-105 active:scale-95"
      >
        {esOscuro ? (
          <Sun className="h-4 w-4 text-warn-400 group-hover:rotate-45 transition-transform duration-300" aria-hidden="true" />
        ) : (
          <Moon className="h-4 w-4 text-brand-600 group-hover:-rotate-12 transition-transform duration-300" aria-hidden="true" />
        )}
      </button>
    </Tooltip>
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

export default function AppLayout() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const modulosVisibles = useModulosVisibles()
  const [paletaAbierta, setPaletaAbierta] = useCommandPalette()
  const { pathname } = useLocation()
  const prefiereReducido = useReducedMotion()

  // Las barras nuevas son solo claras: se retira la clase "dark" que pudo
  // dejar el toggle anterior (persistido en localStorage).
  useEffect(() => {
    document.documentElement.classList.remove('dark')
  }, [])

  return (
    <div className="panel-shell flex h-screen overflow-hidden bg-[var(--color-fondo)] text-[var(--color-texto)]">
      <Toaster position="bottom-right" theme="light" />
      <CommandPalette abierto={paletaAbierta} onAbrirCambio={setPaletaAbierta} modulosVisibles={modulosVisibles} />
      <BarraLateral modulosVisibles={modulosVisibles} abierta={menuAbierto} onCerrar={() => setMenuAbierto(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperior onAbrirMenu={() => setMenuAbierto(true)} onBuscar={() => setPaletaAbierta(true)} />
        <main className="relative flex-1 overflow-y-auto overscroll-contain p-6 lg:p-8">
          <motion.div
            key={pathname}
            initial={prefiereReducido ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="relative space-y-6"
          >
            <ContenidoRuta />
          </motion.div>
        </main>
      </div>
    </div>
  )
}
