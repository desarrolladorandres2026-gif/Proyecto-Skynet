import {
  Home, Wrench, TriangleAlert, GraduationCap, CalendarDays,
  FileText, ClipboardList,
} from 'lucide-react'

// Atajos curados a mano para la barra inferior de MobileShell (roles
// no-admin): a diferencia del sidebar de escritorio (que expone TODO
// MODULOS_REGISTRO en un acordeón), una barra inferior tipo app social solo
// tiene espacio para 3-4 accesos — así que en vez de derivarlos
// automáticamente se eligió a propósito cuál es la tarea principal de cada
// rol en el día a día (ver plan de rediseño móvil). "Inicio" siempre va
// primero y "Más" (el resto de módulos, vía NavContent reutilizado) siempre
// al final; ambos los agrega MobileShell, no este archivo.
// MobileShell filtra cada entrada contra useModulosVisibles() antes de
// pintarla, así un atajo nunca apunta a una ruta que el rol no tiene permiso
// de ver.
//
// Los roles "Despachador" y "Empresa Transportadora" se retiraron del RBAC
// junto con el módulo flota/despachos/horarios/novedades — sus atajos
// (despachos, plataformas, vehículos) ya no tienen ruta a la que apuntar.
//
// "Usuario Común" se eliminó del catálogo RBAC (2026-08-05): no otorgaba
// ningún permiso propio, así que sus usuarios se reasignaron a "Operador"
// (scripts/eliminar-roles-obsoletos.js) y sus atajos se heredan aquí.
export const MOBILE_NAV_POR_ROL = {
  mantenimiento: [
    { to: '/mantenimiento/ordenes', label: 'Órdenes', icon: Wrench },
    // No 'Reportar': el técnico no crea reportes, solo ejecuta lo asignado
    // (ver rol Mantenimiento en seedData/rbac.data.js).
    { to: '/danos/mis-tareas', label: 'Mis tareas', icon: ClipboardList },
  ],
  seguridad: [],
  bodega: [
    { to: '/requerimientos/bodega', label: 'Bandeja', icon: ClipboardList },
  ],
  operador: [
    { to: '/danos/reportar', label: 'Reportar', icon: TriangleAlert },
    { to: '/requerimientos/nuevo', label: 'Requerimientos', icon: FileText },
    { to: '/ausencias/mias', label: 'Vacaciones', icon: CalendarDays },
    { to: '/induccion', label: 'Inducción', icon: GraduationCap },
  ],
}

export const INICIO_ITEM = { to: '/dashboard', label: 'Inicio', icon: Home, end: true }
