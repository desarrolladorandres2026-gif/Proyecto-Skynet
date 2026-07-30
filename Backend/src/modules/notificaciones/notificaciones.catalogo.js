// Catálogo de categorías de notificación: gobierna qué checkboxes ve el
// usuario en la pantalla de preferencias (frontend/src/modules/notificaciones)
// y qué claves acepta PreferenciaNotificacion.categorias. No es una colección
// Mongo (como sí lo es ModuloSistema) porque no necesita estado mutable por
// entorno: agregar una categoría es un cambio de código, igual que agregar un
// tipo de evento nuevo en cualquier módulo.
//
// Al conectar un módulo nuevo al NotificationService: si encaja en una
// categoría existente, reutilízala; si no, agrégala aquí primero.
export const CATEGORIAS_NOTIFICACION = [
  {
    key: 'mantenimiento',
    nombre: 'Mantenimiento de equipos',
    descripcion: 'Órdenes de trabajo, hallazgos y solicitudes de repuestos.',
  },
  {
    key: 'danos',
    nombre: 'Reportes de daños',
    descripcion: 'Reportes nuevos, asignaciones y cambios de estado.',
  },
  {
    key: 'requerimientos',
    nombre: 'Requerimientos',
    descripcion: 'Solicitudes de compra/servicio: aprobaciones y rechazos en cada etapa.',
  },
]

export const CLAVES_CATEGORIA = new Set(CATEGORIAS_NOTIFICACION.map((c) => c.key))

export function esCategoriaValida(categoria) {
  return CLAVES_CATEGORIA.has(categoria)
}
