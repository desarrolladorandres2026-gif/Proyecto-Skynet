import {
  Home, Wrench, TriangleAlert, GraduationCap, Send, LayoutGrid,
  AlertTriangle, PackageSearch, CalendarClock, Bus, IdCard,
  FileText,
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
export const MOBILE_NAV_POR_ROL = {
  mantenimiento: [
    { to: '/mantenimiento/ordenes', label: 'Órdenes', icon: Wrench },
    { to: '/danos/reportar', label: 'Reportar', icon: TriangleAlert },
  ],
  usuario_comun: [
    { to: '/danos/reportar', label: 'Reportar', icon: TriangleAlert },
    { to: '/requerimientos/nuevo', label: 'Requerimientos', icon: FileText },
    { to: '/induccion', label: 'Inducción', icon: GraduationCap },
  ],
  despachador: [
    { to: '/operacion/despachos', label: 'Despachos', icon: Send },
    { to: '/flota/plataformas', label: 'Plataformas', icon: LayoutGrid },
  ],
  seguridad: [
    { to: '/operacion/novedades', label: 'Novedades', icon: AlertTriangle },
    { to: '/operacion/objetos-perdidos', label: 'Objetos', icon: PackageSearch },
  ],
  operador: [
    { to: '/operacion/rutas', label: 'Rutas', icon: CalendarClock },
    { to: '/operacion/novedades', label: 'Novedades', icon: AlertTriangle },
  ],
  empresa_transportadora: [
    { to: '/flota/vehiculos', label: 'Vehículos', icon: Bus },
    { to: '/flota/conductores', label: 'Conductores', icon: IdCard },
  ],
}

export const INICIO_ITEM = { to: '/dashboard', label: 'Inicio', icon: Home, end: true }
