import { useAuth, usaPanelDenso } from '../auth/AuthContext.jsx'
import { useEsMovil } from './useEsMovil.js'
import AppLayout from './AppLayout.jsx'
import MobileShell from './MobileShell.jsx'
import PushOnboardingPrompt from '../pwa/PushOnboardingPrompt.jsx'
import CopilotoWidget from '../components/copiloto/CopilotoWidget.jsx'
import { TooltipProvider } from '../components/Tooltip.jsx'

// Único punto de bifurcación de interfaz: rol Y dispositivo (decisión del
// usuario 2026-08-05). usaPanelDenso(usuario) (ver AuthContext.jsx) sigue
// diciendo QUIÉN es elegible para el panel denso — Admin, Super Admin,
// Bodega y Dir. Administrativo y Gestión — pero ahora esa elegibilidad
// también exige estar en un computador (useEsMovil): ese mismo usuario ve el
// shell móvil si abre desde el celular (incluida la PWA instalada, que ya
// tiene ancho de celular). Los roles NO elegibles (Seguridad, Operador,
// Mantenimiento, Usuario Común, y cualquier otro) ven el shell móvil
// SIEMPRE, sin importar el dispositivo — no está pensado para pantallas
// grandes todavía. Ninguna ruta hija cambia — ambos shells renderizan las
// mismas rutas vía <Outlet/>.
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
  const esMovil = useEsMovil()
  const mostrarPanelDenso = usaPanelDenso(usuario) && !esMovil
  return (
    <TooltipProvider>
      {mostrarPanelDenso ? <AppLayout /> : <MobileShell />}
      <PushOnboardingPrompt />
      <CopilotoWidget />
    </TooltipProvider>
  )
}
