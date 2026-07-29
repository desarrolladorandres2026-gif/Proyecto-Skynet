import { useAuth, esRolAdmin } from '../auth/AuthContext.jsx'
import AppLayout from './AppLayout.jsx'
import MobileShell from './MobileShell.jsx'

// Único punto de bifurcación de interfaz por rol (ver plan de rediseño
// móvil): Admin y Super Admin conservan el panel denso de escritorio sin
// ningún cambio; los 6 roles restantes (empresa_transportadora,
// despachador, seguridad, operador, usuario_comun, mantenimiento) ven el
// shell móvil tipo app social. Ninguna ruta hija cambia — ambos shells
// renderizan las mismas rutas vía <Outlet/>.
export default function AppShell() {
  const { usuario } = useAuth()
  return esRolAdmin(usuario) ? <AppLayout /> : <MobileShell />
}
