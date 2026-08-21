import {
  Wrench, Users, ShieldCheck, ScrollText, TriangleAlert,
  Gauge, SlidersHorizontal, FileText, Bell, CalendarDays, Mail, Bot, LayoutList, Brain,
} from 'lucide-react'

// Registro único de módulos para el sidebar (AppLayout.jsx) y para decidir
// qué rutas existen (App.jsx). Cada entrada declara EXACTAMENTE una de:
//  - legacyModulo: gobierna su visibilidad Usuario.modulos (esquema binario
//    legado, sin tocar mantenimiento en esta fase).
//  - permiso: gobierna su visibilidad por el RBAC granular nuevo
//    (Rol.permisos / usuario.esSuperAdmin vía tienePermiso()).
// Los módulos de Fase 1+ (vehículos, rutas, ...) se agregan
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
    items: [{ to: '/dashboard', label: 'Panel de Control' }],
  },
  {
    key: 'email',
    label: 'Email',
    icon: Mail,
    // email:ver gobierna el grupo entero; cada item interno se recorta luego
    // por su propio permiso (mismo patrón que 'requerimientos').
    permiso: 'email:ver',
    items: [
      { to: '/email', label: 'Bandeja de entrada', end: true },
      { to: '/email/importantes', label: 'Importantes' },
      { to: '/email/enviados', label: 'Enviados', permiso: 'email:enviar' },
      { to: '/email/borradores', label: 'Borradores', permiso: 'email:enviar' },
      { to: '/email/papelera', label: 'Papelera', permiso: 'email:eliminar' },
      { to: '/email/configuracion', label: 'Configuración', permiso: 'email:configurar' },
    ],
  },
  {
    key: 'danos',
    label: 'Reportes',
    icon: TriangleAlert,
    publico: true,
    items: [
      { to: '/danos/reportar', label: 'Reportar' },
      { to: '/danos/tareas', label: 'Tareas pendientes', permiso: 'danos:gestionar' },
      // Mantenimiento (mantenimiento:ejecutar SIN danos:gestionar): su propia
      // cola, recortada a lo suyo por el backend — ver MisTareasPage.jsx.
      { to: '/danos/mis-tareas', label: 'Mis tareas', permiso: 'mantenimiento:ejecutar' },
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
      // Solo tiene sentido para quien puede aprobar/firmar (Administrativo y
      // Financiero) — Administrador y el resto de roles solo solicitan/ven
      // lo propio, no necesitan registrar una rúbrica que nunca van a usar.
      { to: '/requerimientos/mi-firma', label: 'Mi firma', permiso: 'requerimientos:aprobar_financiero' },
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
    // publico: ver/responder la pregunta del día y el propio progreso son
    // capacidad universal (igual que "Reportar daño"), no un permiso — cada
    // item de gestión (banco, programación, dashboard, plan de refuerzo,
    // configuración) declara su propio permiso y solo lo ve SIG/HSEQ o Super
    // Admin. Se agregan aquí mismo a medida que cada fase se construye.
    key: 'sig_pregunta_dia',
    label: 'Cuestionarios Programados',
    icon: Brain,
    publico: true,
    items: [
      { to: '/sig/pregunta-del-dia', label: 'Pregunta del día' },
      { to: '/sig/mi-historial', label: 'Mi historial' },
      { to: '/sig/banco', label: 'Banco de preguntas', permiso: 'sig_pregunta_dia:gestionar_banco' },
      { to: '/sig/programacion', label: 'Programación', permiso: 'sig_pregunta_dia:programar' },
      { to: '/sig/calendario', label: 'Calendario', permiso: 'sig_pregunta_dia:programar' },
      { to: '/sig/dashboard', label: 'Dashboard', permiso: 'sig_pregunta_dia:ver_reportes' },
      { to: '/sig/reportes/individual', label: 'Reporte individual', permiso: 'sig_pregunta_dia:ver_reportes' },
      { to: '/sig/reportes/plan-refuerzo', label: 'Plan de refuerzo', permiso: 'sig_pregunta_dia:ver_reportes' },
      { to: '/sig/capacitaciones', label: 'Capacitaciones por tema', permiso: 'sig_pregunta_dia:programar' },
      { to: '/sig/configuracion', label: 'Configuración', permiso: 'sig_pregunta_dia:configurar' },
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
    key: 'ia',
    label: 'IA',
    icon: Bot,
    // A diferencia de 'notificaciones', este grupo SÍ tiene módulo propio
    // (activable/desactivable desde Sistema → Módulos): el Super Admin puede
    // apagar el feature entero de avisos proactivos de un clic. "Mis avisos"
    // es universal (publico); "Configuración" exige el permiso maestro.
    publico: true,
    items: [
      { to: '/ia/preferencias', label: 'Mis avisos' },
      { to: '/ia/configuracion', label: 'Configuración', permiso: 'ia:configurar' },
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
    key: 'catalogos',
    label: 'Dependencias y cargos',
    icon: LayoutList,
    permiso: 'catalogos:gestionar',
    items: [{ to: '/catalogos', label: 'Catálogos' }],
  },
  {
    key: 'auditoria',
    label: 'Auditoría',
    icon: ScrollText,
    permiso: 'auditoria:leer',
    items: [{ to: '/auditoria', label: 'Registros' }],
  },
  {
    key: 'notificaciones_historial',
    label: 'Notificaciones',
    icon: Bell,
    permiso: 'notificaciones:ver_historial',
    items: [{ to: '/notificaciones/historial', label: 'Historial de envíos' }],
  },
  {
    key: 'sistema',
    label: 'Sistema',
    icon: SlidersHorizontal,
    permiso: 'sistema:gestionar_modulos',
    items: [
      { to: '/sistema/modulos', label: 'Módulos del sistema' },
      // soloSuperAdmin, no permiso: ver la nota en useModulosVisibles
      // (AppLayout.jsx) — el backup completo no debe quedar delegable.
      { to: '/sistema/backup', label: 'Copia de seguridad', soloSuperAdmin: true },
    ],
  },
]
