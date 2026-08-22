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
  // Estado de plataforma: programar/activar/finalizar ventanas de
  // mantenimiento. Igual que sistema:gestionar_modulos, no se asigna a ningún
  // rol del seed (esSuperAdmin ya bypassa) — existe para poder delegarlo
  // explícitamente desde la pantalla Roles.
  //
  // Asignarlo tiene un efecto extra que conviene tener presente al delegarlo:
  // quien lo tenga es también quien puede SEGUIR USANDO la plataforma durante
  // un mantenimiento activo (ver middleware/mantenimientoPlataforma.js).
  permiso('plataforma', 'gestionar', 'Programar y controlar el mantenimiento de la plataforma'),
  // Historial administrativo de envíos (push/email) — ver
  // modules/notificaciones/historial.service.js. Exclusivo de Super
  // Admin en la especificación original (esSuperAdmin ya bypassa), se deja
  // el permiso explícito por si se delega a otro rol más adelante, mismo
  // criterio que auditoria:leer.
  permiso('notificaciones', 'ver_historial', 'Ver historial de envíos de notificaciones'),
  // Catálogos de Dependencia y Cargo (selects reutilizados en Usuarios,
  // Requerimientos y Equipos). Ver que existan o listarlos es universal para
  // todo autenticado (mismo principio que danos:gestionar); este permiso solo
  // gobierna agregar/eliminar valores del catálogo.
  permiso('catalogos', 'gestionar', 'Agregar y eliminar dependencias y cargos'),

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

  // Email (módulo de comunicaciones). Leer/buscar/resumir son acciones de
  // solo lectura, gobernadas por permisos separados de las sensibles
  // (enviar/eliminar) para poder delegar consulta sin delegar envío.
  permiso('email', 'ver', 'Ver el módulo de Email'),
  permiso('email', 'leer', 'Leer correos'),
  permiso('email', 'buscar', 'Buscar y resumir correos'),
  permiso('email', 'enviar', 'Enviar y responder correos'),
  permiso('email', 'eliminar', 'Eliminar y mover correos'),
  permiso('email', 'configurar', 'Conectar/desconectar cuentas y configurar Email'),

  // IA (avisos proactivos del copiloto). Igual que en Email: leer/ajustar
  // las preferencias PERSONALES de cada quien no es un permiso — es
  // universal para todo autenticado (ver modules/ia). Este permiso gobierna
  // solo el interruptor MAESTRO global por categoría.
  permiso('ia', 'configurar', 'Configurar qué categorías puede avisar la IA a nivel de toda la plataforma'),

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

  // Cuestionarios Programados (capacitación diaria, antes "Pregunta SIG del
  // Día" — el nombre cambió, el key interno 'sig_pregunta_dia' no, ver
  // criterio de slugs estables más abajo). Ver la pregunta del día,
  // responderla y consultar el propio progreso/historial son capacidad
  // universal, mismo principio que "reportar un daño" — no son permisos.
  // Estos 4 gobiernan la gestión: banco de preguntas, programación
  // individual/campañas, reportes/dashboard/plan de refuerzo, y
  // configuración del módulo (niveles de desempeño, horario, notificaciones).
  permiso('sig_pregunta_dia', 'gestionar_banco', 'Crear, editar y archivar preguntas del banco SIG'),
  permiso('sig_pregunta_dia', 'programar', 'Programar preguntas individuales y campañas SIG'),
  permiso('sig_pregunta_dia', 'ver_reportes', 'Ver dashboard, reportes individuales y plan de refuerzo SIG'),
  permiso('sig_pregunta_dia', 'configurar', 'Configurar niveles de desempeño, horario y notificaciones SIG'),

  // Genéricos del rol Operador, redactados igual de amplio que en la
  // especificación original ("Registrar información", "Actualizar datos");
  // se recomienda partirlos en permisos concretos por módulo cuando cada
  // módulo del ERP se construya en fases posteriores.
  permiso('general', 'registrar_informacion', 'Registrar información'),
  permiso('general', 'actualizar_datos', 'Actualizar datos'),
]

// Base compartida entre Administrador y 'Dir. Administrativo y Gestión': NO
// incluye NADA de Requerimientos — ni aprobar/firmar ni la supervisión de
// "ver todos". Corrección explícita del usuario (2026-08-05): "el
// administrador SOLO puede solicitar requerimientos" (la capacidad
// universal de cualquier autenticado, ver modules/requerimientos), sin
// bandeja de supervisión ni acceso a registrar firma — eso es exclusivo de
// 'Dir. Administrativo y Gestión' (ver PERMISOS_DIR_ADMINISTRATIVO_GESTION).
const PERMISOS_ADMINISTRADOR_BASE = [
  'catalogos:gestionar',
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
  // Mismo criterio que en Requerimientos: supervisión de solo lectura.
  // Aprobar ausencias es de Talento Humano (rol dedicado abajo), no del
  // Administrador de la operación.
  'ausencias:ver_todas',
  'email:ver',
  'email:leer',
  'email:buscar',
  'email:enviar',
  'email:eliminar',
  'email:configurar',
  'ia:configurar',
]

// Administrador + las 2 capacidades de Requerimientos que NO comparte con
// él: aprobar/firmar Y la supervisión "ver todos". Ambas exclusivas de este
// rol — ni Administrador ni Super Admin-por-diseño-de-negocio deben tener
// vista de supervisión ni firmar en su lugar (Super Admin sigue pudiendo
// técnicamente por el bypass de esSuperAdmin, pero la intención de negocio
// es que solo quien tenga este rol lo haga).
const PERMISOS_DIR_ADMINISTRATIVO_GESTION = [
  ...PERMISOS_ADMINISTRADOR_BASE,
  'requerimientos:ver_todos',
  'requerimientos:aprobar_financiero',
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
    permisos: PERMISOS_ADMINISTRADOR_BASE,
  },
  {
    nombre: 'Seguridad',
    slug: 'seguridad',
    descripcion: 'Control de acceso del terminal.',
    esSuperAdmin: false,
    ambito: 'global',
    esSistema: true,
    permisos: [],
  },
  {
    // Reinstaurado (2026-08-20) tras eliminarse el 2026-08-05. El motivo de
    // aquel retiro era correcto a medias: es verdad que este rol no otorga
    // ningún permiso RBAC propio, porque reportar daños, crear
    // requerimientos, solicitar ausencias y responder el cuestionario del
    // día ya son capacidades universales de cualquier autenticado. Pero el
    // reemplazo elegido entonces ('Operador') NO es un rol vacío: trae
    // pqrs:gestionar, publicaciones:gestionar y reportes:ver_basicos, así
    // que mandar allí a todo el personal sin funciones administrativas era
    // una escalada de privilegios silenciosa. Un catálogo RBAC necesita un
    // hogar explícito de privilegio cero para el trabajador que solo usa
    // las capacidades universales; ese es este rol, y por eso `permisos`
    // vacío aquí es intencional y no un pendiente por llenar.
    nombre: 'Usuario Común',
    slug: 'usuario_comun',
    descripcion: 'Trabajador sin funciones administrativas. Solo usa las capacidades universales de cualquier persona autenticada: reportar daños, crear requerimientos, solicitar ausencias y responder el cuestionario del día.',
    esSuperAdmin: false,
    ambito: 'global',
    // esSistema: es el piso de privilegios del catálogo — protegerlo de
    // borrado y de cambio de slug es justamente lo que evita repetir el
    // episodio de 2026-08-05. Como los roles de sistema tampoco admiten
    // cambiar esSuperAdmin (ver roles.service.js:actualizarRol), el rol
    // vacío no puede convertirse en total por accidente desde RolesPage.
    esSistema: true,
    permisos: [],
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
      'publicaciones:gestionar',
      'reportes:ver_basicos',
    ],
  },
  {
    nombre: 'Mantenimiento',
    slug: 'mantenimiento',
    descripcion: 'Ejecuta las órdenes de reparación que le fueron asignadas. No crea, asigna ni elimina reportes.',
    esSuperAdmin: false,
    ambito: 'global',
    esSistema: true,
    // Solo mantenimiento:ejecutar (ver y avanzar SOLO lo que tiene asignado).
    // danos:gestionar (ver todos, asignar/reasignar, eliminar) es exclusivo de
    // supervisión — hoy Administrador — para que un técnico nunca pueda
    // repartirse trabajo a sí mismo ni ver la cola de sus compañeros
    // (ver danos.service.js: puedeVerTodo()).
    permisos: ['mantenimiento:ejecutar'],
  },
  {
    // Reemplaza al rol dedicado 'Financiero' (eliminado 2026-08-05): la firma
    // que se estampa al aprobar un requerimiento es un dato delicado (ver
    // Requerimiento.financiero.firma), así que en vez de un rol angosto que
    // cualquiera pudiera recibir, esta identidad agrupa a quien el Super
    // Admin designe explícitamente para firmar — con las mismas capacidades
    // de supervisión que Administrador (es su unión, no un rol distinto en
    // permisos). Renombrado de 'Administrativo y Financiero' a 'Dir.
    // Administrativo y Gestión' (2026-08-05) — mismo rol, mismo slug (el
    // slug es un identificador interno estable, como un código de permiso;
    // no se renombra solo porque cambie la etiqueta visible), solo cambia
    // el nombre que ve el usuario.
    nombre: 'Dir. Administrativo y Gestión',
    slug: 'administrativo_financiero',
    descripcion: 'Une las capacidades de Administrador con la aprobación, firma y supervisión de requerimientos de compra y servicio antes de pasar a Bodega. Único rol autorizado a aprobar/firmar y a ver todos los requerimientos.',
    esSuperAdmin: false,
    ambito: 'global',
    esSistema: true,
    permisos: PERMISOS_DIR_ADMINISTRATIVO_GESTION,
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
  {
    nombre: 'SIG / HSEQ',
    slug: 'sig_hseq',
    descripcion: 'Coordina la capacitación diaria del personal: banco de preguntas, programación/campañas, dashboard de desempeño y plan de refuerzo del módulo Cuestionarios Programados.',
    esSuperAdmin: false,
    ambito: 'global',
    // No es esSistema: no viene de la especificación original de 6 roles
    // (igual que Talento Humano), así que sí puede renombrarse o eliminarse
    // desde la pantalla de Roles.
    esSistema: false,
    permisos: [
      'sig_pregunta_dia:gestionar_banco',
      'sig_pregunta_dia:programar',
      'sig_pregunta_dia:ver_reportes',
      'sig_pregunta_dia:configurar',
    ],
  },
]
