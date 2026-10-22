import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { registrarSlot } from './slotsBarraSuperior.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { NotificacionesBell } from '../components/notificaciones/NotificacionesBell.jsx'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../components/DropdownMenu.jsx'

const refSlotSaludo = (el) => registrarSlot('saludo', el)
const refSlotAcciones = (el) => registrarSlot('acciones', el)

// Barra superior de 40 px: producto, navegación en texto, huecos que las
// páginas llenan por portal, y a la derecha notificaciones, usuario y salida.
export default function BarraSuperior({ onAbrirMenu, onBuscar, tema, onAlternarTema }) {
  const { usuario, logout } = useAuth()

  return (
    <header className="zp-topbar">
      <button type="button" onClick={onAbrirMenu} className="zp-tb-btn zp-tb-menu" aria-label="Abrir menú">
        Menú
      </button>
      <span className="zp-product">Skynet</span>
      <button type="button" onClick={onBuscar} className="zp-tb-btn">Buscar</button>

      <div ref={refSlotSaludo} className="hidden min-w-0 empty:hidden lg:block" />

      <div className="ml-auto flex items-center gap-1">
        <div ref={refSlotAcciones} className="flex items-center gap-1" />
        <NotificacionesBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="zp-tb-btn zp-tb-user" title={usuario?.nombre}>
              {usuario?.nombre}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" sideOffset={4} className="w-56">
            <DropdownMenuLabel className="truncate">{usuario?.nombre}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/notificaciones">Preferencias de notificaciones</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/legal">Términos y privacidad</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className="zp-tb-btn" onClick={onAlternarTema}>
          {tema === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        </button>
        <button
          type="button"
          className="zp-tb-btn"
          onClick={async () => {
            const error = await logout()
            if (error) toast.error(error)
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  )
}
