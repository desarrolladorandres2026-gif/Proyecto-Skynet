import { UserPlus, FileText, TriangleAlert, ScrollText, Settings, ClipboardList, CalendarDays } from 'lucide-react'

// Atajos curados para el panel denso (Admin/Super Admin/Bodega/Administrativo
// y Financiero) — la contraparte de escritorio de MOBILE_NAV_POR_ROL
// (mobileNavPorRol.js): en vez de obligar a ese rol a navegar el sidebar
// completo para su tarea más frecuente, se la deja a un clic desde el
// Dashboard. Igual que allí, DashboardPage filtra cada entrada contra
// useModulosVisibles() antes de pintarla, así un atajo nunca apunta a una
// ruta que el rol no tiene permiso de ver.
export const ACCESOS_RAPIDOS_PANEL_DENSO = {
  administrador: [
    { to: '/usuarios', label: 'Usuarios', icon: UserPlus },
    { to: '/requerimientos/todos', label: 'Requerimientos', icon: FileText },
    { to: '/danos/tareas', label: 'Daños pendientes', icon: TriangleAlert },
    { to: '/auditoria', label: 'Auditoría', icon: ScrollText },
  ],
  super_admin: [
    { to: '/usuarios', label: 'Usuarios', icon: UserPlus },
    { to: '/requerimientos/todos', label: 'Requerimientos', icon: FileText },
    { to: '/danos/tareas', label: 'Daños pendientes', icon: TriangleAlert },
    { to: '/sistema/modulos', label: 'Módulos', icon: Settings },
  ],
  bodega: [
    { to: '/requerimientos/bodega', label: 'Bandeja Bodega', icon: ClipboardList },
  ],
  administrativo_financiero: [
    { to: '/requerimientos/financiero', label: 'Bandeja Financiero', icon: ClipboardList },
    { to: '/ausencias/bandeja', label: 'Ausencias por decidir', icon: CalendarDays },
  ],
}
