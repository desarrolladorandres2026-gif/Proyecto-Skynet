// Catálogo de destinos navegables del panel.
//
// ── Por qué el catálogo vive en el BACKEND ──────────────────────────────────
// El frontend ya tiene uno (frontend/src/config/modulosRegistry.js) y la
// tentación obvia es que el modelo devuelva una ruta cualquiera y que React
// decida si el usuario puede entrar. No se hace así por dos razones:
//
//  1. Lo que el modelo VE determina lo que puede pedir. Si se le declara la
//     lista completa de rutas, va a ofrecerle a un usuario de Bodega que abra
//     "Roles y permisos" y a chocar contra un 403. El usuario no lee eso como
//     "no tengo permiso", lo lee como "el asistente está roto".
//  2. El principio que ya rige el resto de este módulo: el alcance no lo pone
//     el prompt, lo pone lo que se declara. Filtrar aquí es la misma garantía
//     que aplica `construirHerramientas` a los datos.
//
// ── Esto NO reemplaza los guardas de ruta ───────────────────────────────────
// `PermissionRoute` / `ModuloActivoRoute` de App.jsx siguen mandando: son la
// verificación real cuando el navegador llega a la ruta. Este catálogo decide
// qué se le OFRECE al modelo; aquellos deciden qué se puede ABRIR. Son dos
// capas independientes a propósito — si esta lista se desactualiza respecto de
// App.jsx, el peor caso es que Skynet ofrezca una página que el guarda después
// bloquea, no que alguien entre donde no debe.
//
// ── Al agregar una ruta nueva a App.jsx ─────────────────────────────────────
// Agrégala también aquí con su mismo permiso/módulo. Si se olvida, la ruta
// simplemente no es navegable por voz — se degrada, no se rompe.

import { estaModuloActivo } from '../sistema/sistema.service.js'

/**
 * Cada destino declara:
 *  - `clave`: identificador estable que usa el modelo. NO es la ruta, para que
 *    cambiar una URL no obligue a reeducar al modelo ni rompa conversaciones.
 *  - `ruta`: lo que recibe react-router en el frontend.
 *  - `permiso`: código RBAC exigido. Un array significa "cualquiera de estos".
 *    `null` = capacidad universal (solo hace falta sesión).
 *  - `modulo`: interruptor de /sistema/modulos que debe estar encendido.
 *  - `legacyModulo`: esquema binario viejo (Usuario.modulos), solo
 *    mantenimiento — ver middleware/auth.js.
 *  - `alias`: cómo lo llama la gente al hablar. Van en la descripción que ve
 *    el modelo, porque nadie dice "navega a requerimientos_bandeja_bodega".
 */
const DESTINOS = [
  {
    clave: 'dashboard',
    ruta: '/dashboard',
    titulo: 'Panel principal',
    permiso: null,
    alias: ['dashboard', 'panel', 'inicio', 'tablero', 'resumen'],
  },
  {
    clave: 'notificaciones',
    ruta: '/notificaciones',
    titulo: 'Preferencias de notificaciones',
    permiso: null,
    alias: ['notificaciones', 'avisos', 'alertas', 'correos'],
  },

  // ── Daños / Reportes ──────────────────────────────────────────────────────
  {
    clave: 'reportar_dano',
    ruta: '/danos/reportar',
    titulo: 'Reportar un daño o novedad',
    permiso: null,
    modulo: 'danos',
    alias: ['reportar daño', 'reportar novedad', 'nuevo reporte', 'avería'],
  },
  {
    clave: 'danos_tareas',
    ruta: '/danos/tareas',
    titulo: 'Tareas de daños pendientes',
    permiso: 'danos:gestionar',
    modulo: 'danos',
    alias: ['tareas pendientes', 'daños pendientes', 'bandeja de daños'],
  },
  {
    clave: 'danos_mis_tareas',
    ruta: '/danos/mis-tareas',
    titulo: 'Mis tareas asignadas',
    permiso: 'mantenimiento:ejecutar',
    modulo: 'danos',
    alias: ['mis tareas', 'lo que tengo asignado', 'mi cola'],
  },

  // ── Requerimientos ────────────────────────────────────────────────────────
  {
    clave: 'requerimiento_nuevo',
    ruta: '/requerimientos/nuevo',
    titulo: 'Nuevo requerimiento',
    permiso: null,
    modulo: 'requerimientos',
    alias: ['nuevo requerimiento', 'pedir algo', 'solicitar compra', 'hacer un pedido'],
  },
  {
    clave: 'requerimientos_mios',
    ruta: '/requerimientos/mios',
    titulo: 'Mis requerimientos',
    permiso: null,
    modulo: 'requerimientos',
    alias: ['mis requerimientos', 'mis pedidos', 'mis solicitudes'],
  },
  {
    clave: 'requerimientos_mi_firma',
    ruta: '/requerimientos/mi-firma',
    titulo: 'Mi firma digital',
    permiso: 'requerimientos:aprobar_financiero',
    modulo: 'requerimientos',
    alias: ['mi firma', 'firma digital', 'registrar mi firma'],
  },
  {
    clave: 'requerimientos_financiero',
    ruta: '/requerimientos/financiero',
    titulo: 'Bandeja de Financiero',
    permiso: 'requerimientos:aprobar_financiero',
    modulo: 'requerimientos',
    alias: ['bandeja financiero', 'requerimientos por aprobar', 'lo que tengo que aprobar'],
  },
  {
    clave: 'requerimientos_bodega',
    ruta: '/requerimientos/bodega',
    titulo: 'Bandeja de Bodega',
    permiso: 'requerimientos:gestionar_bodega',
    modulo: 'requerimientos',
    alias: ['bandeja bodega', 'por despachar', 'entregas pendientes'],
  },
  {
    clave: 'requerimientos_todos',
    ruta: '/requerimientos/todos',
    titulo: 'Todos los requerimientos (supervisión)',
    permiso: 'requerimientos:ver_todos',
    modulo: 'requerimientos',
    alias: ['todos los requerimientos', 'supervisión de requerimientos'],
  },

  // ── Ausencias ─────────────────────────────────────────────────────────────
  {
    clave: 'ausencias_mias',
    ruta: '/ausencias/mias',
    titulo: 'Mis ausencias',
    permiso: null,
    modulo: 'ausencias',
    alias: ['mis vacaciones', 'mis ausencias', 'mis permisos', 'pedir vacaciones'],
  },
  {
    clave: 'ausencias_bandeja',
    ruta: '/ausencias/bandeja',
    titulo: 'Ausencias por decidir',
    permiso: 'ausencias:aprobar',
    modulo: 'ausencias',
    alias: ['bandeja de ausencias', 'vacaciones por aprobar', 'permisos por decidir'],
  },
  {
    clave: 'ausencias_calendario',
    ruta: '/ausencias/calendario',
    titulo: 'Calendario de ausencias',
    permiso: ['ausencias:aprobar', 'ausencias:ver_todas'],
    modulo: 'ausencias',
    alias: ['calendario de vacaciones', 'quién está de vacaciones'],
  },

  // ── Mantenimiento (esquema legado binario) ────────────────────────────────
  {
    clave: 'mantenimiento_panel',
    ruta: '/mantenimiento',
    titulo: 'Panel de Mantenimiento',
    legacyModulo: 'mantenimiento',
    alias: ['mantenimiento', 'panel de mantenimiento'],
  },
  {
    clave: 'mantenimiento_equipos',
    ruta: '/mantenimiento/equipos',
    titulo: 'Equipos',
    legacyModulo: 'mantenimiento',
    alias: ['equipos', 'maquinaria', 'activos'],
  },
  {
    clave: 'mantenimiento_mantenimientos',
    ruta: '/mantenimiento/mantenimientos',
    titulo: 'Mantenimientos programados',
    legacyModulo: 'mantenimiento',
    alias: ['mantenimientos', 'programados', 'preventivos'],
  },
  {
    clave: 'mantenimiento_catalogos',
    ruta: '/mantenimiento/catalogos',
    titulo: 'Catálogos de mantenimiento',
    legacyModulo: 'mantenimiento',
    alias: ['catálogos', 'repuestos', 'materiales'],
  },

  // ── Órdenes de trabajo (RBAC granular) ────────────────────────────────────
  {
    clave: 'ordenes_trabajo',
    ruta: '/mantenimiento/ordenes',
    titulo: 'Órdenes de trabajo',
    permiso: ['mantenimiento:ejecutar', 'mantenimiento:ver_todas', 'mantenimiento:asignar', 'mantenimiento:aprobar_cerrar'],
    modulo: 'mantenimiento',
    alias: ['órdenes de trabajo', 'ordenes', 'OT'],
  },
  {
    clave: 'mantenimiento_seguimiento',
    ruta: '/mantenimiento/seguimiento',
    titulo: 'Seguimiento en tiempo real',
    permiso: 'mantenimiento:ver_todas',
    modulo: 'mantenimiento',
    alias: ['seguimiento', 'tiempo real', 'monitoreo'],
  },
  {
    clave: 'mantenimiento_supervisor',
    ruta: '/mantenimiento/supervisor',
    titulo: 'Vista de supervisor',
    permiso: 'mantenimiento:ver_todas',
    modulo: 'mantenimiento',
    alias: ['supervisor', 'vista de supervisor'],
  },

  // ── Administración ────────────────────────────────────────────────────────
  {
    clave: 'usuarios',
    ruta: '/usuarios',
    titulo: 'Usuarios',
    permiso: 'usuarios:gestionar',
    alias: ['usuarios', 'personal', 'cuentas'],
  },
  {
    clave: 'roles',
    ruta: '/roles',
    titulo: 'Roles y permisos',
    permiso: 'roles:gestionar',
    alias: ['roles', 'permisos', 'perfiles'],
  },
  {
    clave: 'auditoria',
    ruta: '/auditoria',
    titulo: 'Registros de auditoría',
    permiso: 'auditoria:leer',
    alias: ['auditoría', 'registros', 'historial del sistema', 'logs'],
  },
  {
    clave: 'sistema_modulos',
    ruta: '/sistema/modulos',
    titulo: 'Módulos del sistema',
    permiso: 'sistema:gestionar_modulos',
    alias: ['módulos', 'activar módulos', 'configuración del sistema'],
  },

  // ── Inducción ─────────────────────────────────────────────────────────────
  {
    clave: 'induccion',
    ruta: '/induccion',
    titulo: 'Inducción',
    permiso: null,
    alias: ['inducción', 'capacitación', 'curso'],
  },
  {
    clave: 'induccion_certificado',
    ruta: '/induccion/certificado',
    titulo: 'Certificado de inducción',
    permiso: null,
    alias: ['certificado', 'mi certificado'],
  },
]

/**
 * ¿Este usuario tiene el permiso exigido?
 *
 * Réplica exacta de la semántica de `PermissionRoute` y de `tienePermiso()`
 * del frontend: Super Admin pasa siempre, y un array de permisos significa
 * "cualquiera de estos", no "todos".
 */
function tienePermiso(usuario, permiso) {
  if (!permiso) return true
  if (usuario?.esSuperAdmin) return true
  const codigos = Array.isArray(permiso) ? permiso : [permiso]
  return codigos.some((c) => usuario?.permisos?.has(c))
}

function tieneLegacy(usuario, modulo) {
  if (!modulo) return true
  return usuario?.esSuperAdmin === true || usuario?.modulos?.includes(modulo) === true
}

/**
 * Destinos a los que ESTE usuario puede navegar ahora mismo.
 *
 * Se resuelven los módulos activos en paralelo y una sola vez por destino
 * distinto: `estaModuloActivo` consulta la configuración del sistema, y sin
 * agrupar se harían ~25 consultas para armar una lista de 25 entradas.
 */
export async function destinosDisponibles(usuario) {
  const porPermiso = DESTINOS.filter(
    (d) => tienePermiso(usuario, d.permiso) && tieneLegacy(usuario, d.legacyModulo)
  )

  const modulos = [...new Set(porPermiso.map((d) => d.modulo).filter(Boolean))]
  const estados = await Promise.all(modulos.map(async (m) => [m, await estaModuloActivo(m)]))
  const activo = new Map(estados)

  return porPermiso.filter((d) => !d.modulo || activo.get(d.modulo))
}

/**
 * Resuelve la clave que pidió el modelo contra lo que este usuario puede abrir.
 *
 * Devuelve `{error}` en vez de lanzar porque el que llama es una herramienta:
 * el modelo necesita un texto que pueda convertir en una explicación útil.
 */
export async function resolverDestino(clave, usuario) {
  const pedida = String(clave || '').trim()
  if (!pedida) return { error: 'Falta indicar a dónde navegar' }

  const disponibles = await destinosDisponibles(usuario)
  const destino = disponibles.find((d) => d.clave === pedida)

  if (destino) {
    return { ruta: destino.ruta, titulo: destino.titulo, clave: destino.clave }
  }

  // Distinguir "no existe" de "no puedes" importa para lo que responde el
  // asistente: en el segundo caso hay que decir que le falta permiso, no que
  // la página no existe. Si no, un usuario de Bodega concluye que el módulo de
  // Roles no está implementado.
  const existe = DESTINOS.some((d) => d.clave === pedida)
  return {
    error: existe
      ? 'No tienes permiso para abrir esa sección, o su módulo está desactivado.'
      : `No existe una sección llamada "${pedida}".`,
  }
}

/** Solo para las pruebas y la documentación. */
export const CATALOGO_DESTINOS = DESTINOS
