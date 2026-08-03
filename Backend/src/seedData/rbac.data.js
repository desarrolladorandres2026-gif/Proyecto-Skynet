// Fuente única de verdad del catálogo RBAC (permisos + roles semilla).
// La usan scripts/seed.js y scripts/migrate-rbac-roles.js para que el
// catálogo nunca diverja entre el primer arranque y una migración posterior.

function permiso(modulo, accion, nombre) {
  return { codigo: `${modulo}:${accion}`, modulo, accion, nombre }
}

export const PERMISOS = [
  // Exclusivos de Super Administrador. No se asignan a ningún Rol del seed
  // porque Rol.esSuperAdmin ya otorga bypass total (ver requierePermiso en
  // middleware/permisos.js); existen en el catálogo para que la matriz de
  // "Roles y permisos" los liste y para que Roles/Administrador puedan
  // referenciarlos si más adelante se decide delegarlos explícitamente.
  permiso('usuarios', 'gestionar', 'Gestionar usuarios'),
  permiso('roles', 'gestionar', 'Crear y editar roles'),
  permiso('roles', 'asignar_permisos', 'Asignar permisos'),
  permiso('configuracion', 'gestionar', 'Configuración general'),
  permiso('auditoria', 'leer', 'Auditoría y registros'),
  permiso('sistema', 'gestionar_modulos', 'Activar/desactivar módulos del sistema'),

  // Catálogos maestros (Fase 1)
  permiso('empresas', 'gestionar', 'Gestionar empresas transportadoras'),
  permiso('empresas', 'ver_estadisticas', 'Ver estadísticas de su empresa'),
  permiso('vehiculos', 'gestionar', 'Gestionar vehículos'),
  permiso('vehiculos', 'consultar', 'Consultar vehículos'),
  permiso('conductores', 'gestionar', 'Gestionar conductores'),
  permiso('conductores', 'consultar', 'Consultar conductores'),
  permiso('plataformas', 'gestionar', 'Gestionar plataformas'),
  permiso('plataformas', 'cambiar', 'Cambiar plataforma'),

  // Planeación operativa (Fase 2)
  permiso('rutas', 'gestionar', 'Gestionar rutas'),
  permiso('horarios', 'gestionar', 'Gestionar horarios'),
  permiso('horarios', 'ver_programacion', 'Ver programación'),

  // Operación diaria (Fase 3)
  permiso('despachos', 'registrar_salida', 'Registrar salidas'),
  permiso('despachos', 'registrar_llegada', 'Registrar llegadas'),
  permiso('despachos', 'registrar_retraso', 'Registrar retrasos'),
  permiso('novedades', 'registrar', 'Registrar novedades'),
  permiso('novedades', 'registrar_incidente', 'Registrar incidentes'),
  permiso('novedades', 'consultar_historial', 'Consultar historial'),
  permiso('objetos_perdidos', 'registrar', 'Registrar objetos perdidos'),
  permiso('objetos_perdidos', 'gestionar', 'Gestionar objetos perdidos'),

  // Atención al ciudadano / contenido (Fase 4)
  permiso('pqrs', 'gestionar', 'Gestionar PQRS'),
  permiso('noticias', 'gestionar', 'Administrar noticias'),
  permiso('eventos', 'gestionar', 'Administrar eventos'),
  permiso('publicaciones', 'gestionar', 'Gestionar publicaciones'),

  // Cierre (Fase 5)
  permiso('reportes', 'ver', 'Ver reportes'),
  permiso('reportes', 'ver_basicos', 'Consultar reportes básicos'),

  // Reportes de daños. Reportar un daño NO es un permiso: cualquier usuario
  // autenticado puede hacerlo (ver modules/danos). Este permiso gobierna la
  // gestión (ver tareas pendientes, cambiar estado).
  permiso('danos', 'gestionar', 'Gestionar reportes de daños'),

  // CMMS de Mantenimiento (evolución del módulo legado, Fase 1: ciclo de vida
  // de la Orden de Trabajo). Reportar un problema tampoco es un permiso —
  // mismo principio que danos:gestionar, universal para todo autenticado.
  permiso('mantenimiento', 'asignar', 'Asignar técnico a una orden de trabajo'),
  permiso('mantenimiento', 'ejecutar', 'Ejecutar órdenes de trabajo asignadas'),
  permiso('mantenimiento', 'ver_todas', 'Ver todas las órdenes de trabajo'),
  permiso('mantenimiento', 'aprobar_cerrar', 'Aprobar y cerrar órdenes de trabajo'),
  permiso('mantenimiento', 'escalar', 'Escalar órdenes de trabajo'),
  permiso('mantenimiento', 'cancelar', 'Cancelar órdenes de trabajo'),
  permiso('mantenimiento', 'reabrir', 'Reabrir órdenes de trabajo cerradas'),
  permiso('mantenimiento', 'gestionar_equipos', 'Gestionar equipos de mantenimiento'),
  permiso('mantenimiento', 'gestionar_catalogos', 'Gestionar catálogos de mantenimiento'),
  // Fase 3: aprobar solicitudes de repuestos es una decisión de presupuesto/
  // disponibilidad distinta de aprobar el cierre de una orden — permiso propio.
  permiso('mantenimiento', 'aprobar_repuestos', 'Aprobar solicitudes de repuestos'),
  // Fase 3.1
  permiso('mantenimiento', 'gestionar_plantillas', 'Gestionar plantillas y checklists de mantenimiento'),
  permiso('mantenimiento', 'gestionar_inventario', 'Gestionar inventario de repuestos'),
  permiso('mantenimiento', 'gestionar_conocimiento', 'Curar la base de conocimiento de mantenimiento'),
  // Fase 4 (módulo del Supervisor)
  permiso('mantenimiento', 'gestionar_activos_criticidad', 'Editar criticidad, garantía y vida útil de equipos'),

  // Requerimientos (compra/servicio, formatos FO-GBS-09/FO-GBS-36). Crear un
  // requerimiento y ver los propios tampoco es un permiso — mismo principio
  // que danos:gestionar/mantenimiento:ejecutar, universal para todo
  // autenticado (ver modules/requerimientos).
  permiso('requerimientos', 'aprobar_financiero', 'Revisar, editar y aprobar/rechazar requerimientos (Financiero)'),
  permiso('requerimientos', 'gestionar_bodega', 'Gestionar requerimientos aprobados: estado, control de recibido e impresión (Bodega)'),
  permiso('requerimientos', 'ver_todos', 'Ver todos los requerimientos de todos los solicitantes (supervisión)'),

  // Ausencias (vacaciones, permisos e incapacidades). Solicitar la propia y
  // ver las propias NO son permisos: son universales para cualquier persona
  // autenticada, mismo principio que reportar un daño o crear un
  // requerimiento. Lo que se gobierna por RBAC es decidir sobre la ausencia
  // de otra persona y ver las de todo el mundo.
  permiso('ausencias', 'aprobar', 'Aprobar o rechazar solicitudes de vacaciones, permisos e incapacidades'),
  permiso('ausencias', 'ver_todas', 'Ver todas las ausencias del personal (supervisión y calendario)'),

  // Genéricos del rol Operador, redactados igual de amplio que en la
  // especificación original ("Registrar información", "Actualizar datos");
  // se recomienda partirlos en permisos concretos por módulo cuando cada
  // módulo del ERP se construya en fases posteriores.
  permiso('general', 'registrar_informacion', 'Registrar información'),
  permiso('general', 'actualizar_datos', 'Actualizar datos'),
]

export const ROLES = [
  {
    nombre: 'Super Administrador',
    slug: 'super_admin',
    descripcion: 'Tiene control absoluto del sistema.',
    esSuperAdmin: true,
    ambito: 'global',
    esSistema: true,
    permisos: [],
  },
  {
    nombre: 'Administrador',
    slug: 'administrador',
    descripcion: 'Administra la operación diaria del sistema.',
    esSuperAdmin: false,
    ambito: 'global',
    esSistema: true,
    permisos: [
      'empresas:gestionar',
      'vehiculos:gestionar',
      'conductores:gestionar',
      'rutas:gestionar',
      'horarios:gestionar',
      'plataformas:gestionar',
      'noticias:gestionar',
      'eventos:gestionar',
      'pqrs:gestionar',
      'reportes:ver',
      'danos:gestionar',
      // Actúa como Supervisor de Mantenimiento hasta que la Fase 4 (módulo
      // del Supervisor) justifique un rol dedicado separado de Administrador.
      'mantenimiento:asignar',
      'mantenimiento:ver_todas',
      'mantenimiento:aprobar_cerrar',
      'mantenimiento:escalar',
      'mantenimiento:cancelar',
      'mantenimiento:reabrir',
      'mantenimiento:gestionar_equipos',
      'mantenimiento:gestionar_catalogos',
      'mantenimiento:aprobar_repuestos',
      'mantenimiento:gestionar_plantillas',
      'mantenimiento:gestionar_inventario',
      'mantenimiento:gestionar_conocimiento',
      'mantenimiento:gestionar_activos_criticidad',
      // Supervisión de solo-lectura sobre Requerimientos — a diferencia de
      // Mantenimiento, aquí sí se pidieron 2 roles dedicados (Financiero,
      // Bodega) para las acciones de gestión, así que Administrador NO
      // recibe aprobar_financiero ni gestionar_bodega.
      'requerimientos:ver_todos',
      // Mismo criterio que en Requerimientos: supervisión de solo lectura.
      // Aprobar ausencias es de Talento Humano (rol dedicado abajo), no del
      // Administrador de la operación.
      'ausencias:ver_todas',
    ],
  },
  {
    nombre: 'Empresa Transportadora',
    slug: 'empresa_transportadora',
    descripcion: 'Cada empresa solo administra su propia información.',
    esSuperAdmin: false,
    // ambito:'empresa' activa el scoping multi-tenant en cargarScopeEmpresa()
    // (middleware/permisos.js): todo usuario con este rol queda restringido
    // a su propio Usuario.empresa en los módulos que lo apliquen.
    ambito: 'empresa',
    esSistema: true,
    permisos: [
      'vehiculos:gestionar',
      'conductores:gestionar',
      'rutas:gestionar',
      'horarios:gestionar',
      'empresas:ver_estadisticas',
      'novedades:registrar',
    ],
  },
  {
    nombre: 'Despachador',
    slug: 'despachador',
    descripcion: 'Es quien controla la salida de los vehículos.',
    esSuperAdmin: false,
    ambito: 'global',
    esSistema: true,
    permisos: [
      'despachos:registrar_salida',
      'despachos:registrar_llegada',
      'plataformas:cambiar',
      'horarios:ver_programacion',
      'despachos:registrar_retraso',
      'novedades:registrar',
      'vehiculos:consultar',
    ],
  },
  {
    nombre: 'Seguridad',
    slug: 'seguridad',
    descripcion: 'Control de acceso y novedades.',
    esSuperAdmin: false,
    ambito: 'global',
    esSistema: true,
    permisos: [
      'vehiculos:consultar',
      'conductores:consultar',
      'novedades:registrar_incidente',
      'objetos_perdidos:registrar',
      'novedades:registrar',
      'novedades:consultar_historial',
    ],
  },
  {
    nombre: 'Operador',
    slug: 'operador',
    descripcion: 'Personal administrativo del terminal.',
    esSuperAdmin: false,
    ambito: 'global',
    esSistema: true,
    permisos: [
      'general:registrar_informacion',
      'general:actualizar_datos',
      'pqrs:gestionar',
      'objetos_perdidos:gestionar',
      'publicaciones:gestionar',
      'reportes:ver_basicos',
    ],
  },
  {
    nombre: 'Usuario Común',
    slug: 'usuario_comun',
    descripcion: 'Usuario general del terminal. Puede reportar daños y consultar sus propios reportes.',
    esSuperAdmin: false,
    ambito: 'global',
    esSistema: true,
    permisos: [],
  },
  {
    nombre: 'Mantenimiento',
    slug: 'mantenimiento',
    descripcion: 'Personal de mantenimiento. Atiende los reportes de daños como tareas pendientes.',
    esSuperAdmin: false,
    ambito: 'global',
    esSistema: true,
    permisos: ['danos:gestionar', 'mantenimiento:ejecutar'],
  },
  {
    nombre: 'Financiero',
    slug: 'financiero',
    descripcion: 'Revisa, edita y aprueba o rechaza los requerimientos de compra y servicio antes de pasar a Bodega.',
    esSuperAdmin: false,
    ambito: 'global',
    esSistema: true,
    permisos: ['requerimientos:aprobar_financiero'],
  },
  {
    nombre: 'Bodega',
    slug: 'bodega',
    descripcion: 'Gestiona los requerimientos ya aprobados por Financiero: estado, control de recibido e impresión.',
    esSuperAdmin: false,
    ambito: 'global',
    esSistema: true,
    permisos: ['requerimientos:gestionar_bodega'],
  },
  {
    nombre: 'Talento Humano',
    slug: 'talento_humano',
    descripcion: 'Decide sobre las solicitudes de vacaciones, permisos e incapacidades del personal y consulta el calendario de ausencias.',
    esSuperAdmin: false,
    ambito: 'global',
    // No es esSistema: no viene de la especificación original de 6 roles, así
    // que sí puede renombrarse o eliminarse desde la pantalla de Roles.
    esSistema: false,
    permisos: ['ausencias:aprobar', 'ausencias:ver_todas'],
  },
]
