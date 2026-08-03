import { useAuth, esRolAdmin } from '../auth/AuthContext.jsx'
import AppLayout from './AppLayout.jsx'
import MobileShell from './MobileShell.jsx'
import PushOnboardingPrompt from '../pwa/PushOnboardingPrompt.jsx'
import { TooltipProvider } from '../components/Tooltip.jsx'

// Único punto de bifurcación de interfaz por rol (ver plan de rediseño
// móvil): Admin y Super Admin conservan el panel denso de escritorio sin
// ningún cambio; los 6 roles restantes (empresa_transportadora,
// despachador, seguridad, operador, usuario_comun, mantenimiento) ven el
// shell móvil tipo app social. Ninguna ruta hija cambia — ambos shells
// renderizan las mismas rutas vía <Outlet/>.
//
// PushOnboardingPrompt vive aquí (no en App.jsx junto a InstallBanner)
// porque pedir el permiso de notificaciones exige sesión iniciada — a
// diferencia de "instalar la app", que tiene sentido ofrecer incluso en
// /login.
//
// TooltipProvider también vive aquí, no dentro de AppLayout: ToggleTema
// (components/Tooltip ahora lo envuelve) es compartido por AppLayout Y
// MobileShell — si el Provider solo envolviera AppLayout, un rol no-admin
// (MobileShell) tronaría al montar ToggleTema sin un Provider ancestro.
export default function AppShell() {
  const { usuario } = useAuth()
  return (
    <TooltipProvider>
      {esRolAdmin(usuario) ? <AppLayout /> : <MobileShell />}
      <PushOnboardingPrompt />
    </TooltipProvider>
  )
}
