import {
  Wrench, Users, ShieldCheck, ScrollText, TriangleAlert,
  Gauge, Bus, Send, SlidersHorizontal, FileText, Bell, CalendarDays,
} from 'lucide-react'

// Registro único de módulos para el sidebar (AppLayout.jsx) y para decidir
// qué rutas existen (App.jsx). Cada entrada declara EXACTAMENTE una de:
//  - legacyModulo: gobierna su visibilidad Usuario.modulos (esquema binario
//    legado, sin tocar mantenimiento en esta fase).
//  - permiso: gobierna su visibilidad por el RBAC granular nuevo
//    (Rol.permisos / usuario.esSuperAdmin vía tienePermiso()).
// Los módulos de Fase 1+ (vehículos, conductores, rutas, ...) se agregan
// aquí mismo cuando se construyan, siguiendo el mismo patrón.
// Un módulo con `publico: true` se muestra a todo usuario autenticado (como
// "Reportar daño": capacidad universal, no gobernada por RBAC).
// Cada ITEM puede además declarar su propio `permiso` (string o array de
// alternativas): así un módulo agrupa páginas con permisos distintos y cada
// rol ve solo los items suyos (el módulo desaparece si no le queda ninguno).
export const MODULOS_REGISTRO = [
  {
    key: 'dashboard',
    label: 'Panel',
    icon: Gauge,
    publico: true,
    items: [{ to: '/dashboard', label: 'Dashboard' }],
  },
  {
    key: 'danos',
    label: 'Reportes',
    icon: TriangleAlert,
    publico: true,
    items: [
      { to: '/danos/reportar', label: 'Reportar' },
      { to: '/danos/tareas', label: 'Tareas pendientes', permiso: 'danos:gestionar' },
    ],
  },
  {
    key: 'requerimientos',
    label: 'Requerimientos',
    icon: FileText,
    publico: true,
    items: [
      { to: '/requerimientos/nuevo', label: 'Nuevo requerimiento' },
      { to: '/requerimientos/mios', label: 'Mis requerimientos' },
      { to: '/requerimientos/financiero', label: 'Bandeja Financiero', permiso: 'requerimientos:aprobar_financiero' },
      { to: '/requerimientos/bodega', label: 'Bandeja Bodega', permiso: 'requerimientos:gestionar_bodega' },
      { to: '/requerimientos/todos', label: 'Todos (supervisión)', permiso: 'requerimientos:ver_todos' },
    ],
  },
  {
    key: 'ausencias',
    label: 'Vacaciones',
    icon: CalendarDays,
    // publico: solicitar las propias no depende de ningún permiso; los items
    // de gestión sí declaran el suyo y desaparecen para quien no lo tenga.
    publico: true,
    items: [
      { to: '/ausencias/mias', label: 'Mis ausencias' },
      { to: '/ausencias/bandeja', label: 'Por decidir', permiso: 'ausencias:aprobar' },
      { to: '/ausencias/calendario', label: 'Calendario', permiso: ['ausencias:aprobar', 'ausencias:ver_todas'] },
    ],
  },
  {
    key: 'notificaciones',
    label: 'Notificaciones',
    icon: Bell,
    // Página de cuenta, no un módulo de negocio: no lleva legacyModulo ni
    // permiso — cada usuario administra sus propias preferencias, sin
    // depender del gate de /sistema/modulos (nadie debería quedar sin poder
    // ajustar cómo se le avisa solo porque un módulo de negocio esté apagado).
    publico: true,
    items: [{ to: '/notificaciones', label: 'Preferencias' }],
  },
  {
    key: 'flota',
    label: 'Flota',
    icon: Bus,
    items: [
      { to: '/flota/empresas', label: 'Empresas', permiso: 'empresas:gestionar' },
      { to: '/flota/vehiculos', label: 'Vehículos', permiso: ['vehiculos:gestionar', 'vehiculos:consultar'] },
      { to: '/flota/conductores', label: 'Conductores', permiso: ['conductores:gestionar', 'conductores:consultar'] },
      { to: '/flota/plataformas', label: 'Plataformas', permiso: ['plataformas:gestionar', 'plataformas:cambiar'] },
    ],
  },
  {
    key: 'operacion',
    label: 'Operación',
    icon: Send,
    items: [
      { to: '/operacion/rutas', label: 'Rutas y horarios', permiso: ['rutas:gestionar', 'horarios:gestionar', 'horarios:ver_programacion'] },
      { to: '/operacion/despachos', label: 'Despachos', permiso: ['despachos:registrar_salida', 'despachos:registrar_llegada', 'reportes:ver', 'empresas:ver_estadisticas'] },
      { to: '/operacion/novedades', label: 'Novedades', permiso: ['novedades:registrar', 'novedades:registrar_incidente', 'novedades:consultar_historial'] },
      { to: '/operacion/objetos-perdidos', label: 'Objetos perdidos', permiso: ['objetos_perdidos:registrar', 'objetos_perdidos:gestionar'] },
    ],
  },
  {
    key: 'mantenimiento',
    label: 'Mantenimiento',
    icon: Wrench,
    legacyModulo: 'mantenimiento',
    items: [
      { to: '/mantenimiento', label: 'Panel', end: true },
      { to: '/mantenimiento/equipos', label: 'Equipos' },
      { to: '/mantenimiento/mantenimientos', label: 'Mantenimientos' },
      { to: '/mantenimiento/catalogos', label: 'Catálogos' },
    ],
  },
  {
    // Grupo aparte del de arriba a propósito: este usa el RBAC granular
    // nuevo (permiso), no el legacyModulo binario — ver la auditoría/diseño
    // del CMMS de Mantenimiento. No comparten `key` porque ambos conviven
    // simultáneamente en el sidebar y React exige keys únicas entre hermanos.
    key: 'mantenimiento_ordenes',
    label: 'Órdenes de trabajo',
    icon: Wrench,
    permiso: ['mantenimiento:ejecutar', 'mantenimiento:ver_todas', 'mantenimiento:asignar', 'mantenimiento:aprobar_cerrar'],
    items: [
      { to: '/mantenimiento/ordenes', label: 'Órdenes de trabajo', end: true },
      { to: '/mantenimiento/seguimiento', label: 'Seguimiento en tiempo real', permiso: 'mantenimiento:ver_todas' },
      { to: '/mantenimiento/supervisor', label: 'Supervisor', permiso: 'mantenimiento:ver_todas' },
    ],
  },
  {
    key: 'usuarios',
    label: 'Usuarios',
    icon: Users,
    permiso: 'usuarios:gestionar',
    items: [{ to: '/usuarios', label: 'Usuarios' }],
  },
  {
    key: 'roles',
    label: 'Roles y permisos',
    icon: ShieldCheck,
    permiso: 'roles:gestionar',
    items: [{ to: '/roles', label: 'Roles' }],
  },
  {
    key: 'auditoria',
    label: 'Auditoría',
    icon: ScrollText,
    permiso: 'auditoria:leer',
    items: [{ to: '/auditoria', label: 'Registros' }],
  },
  {
    key: 'sistema',
    label: 'Sistema',
    icon: SlidersHorizontal,
    permiso: 'sistema:gestionar_modulos',
    items: [{ to: '/sistema/modulos', label: 'Módulos del sistema' }],
  },
]
