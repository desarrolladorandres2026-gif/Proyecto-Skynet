// Datos de la orden de trabajo que acompañan los avisos por correo de
// Mantenimiento (ver notificaciones.service.js#notificar, campo `detalles`):
// el correo los muestra como filas "etiqueta / valor" bajo el cuerpo, igual
// que en Requerimientos y Ausencias.
//
// `ot` llega de obtenerOT() (comun.js), así que `ot.equipo` viene poblado
// (numero_inventario, tipo.nombre, marca.nombre, modelo, ubicacion,
// dependencia, criticidad...) y `ot.tecnico_asignado` también (nombre,
// nombre_usuario). Una fila con valor vacío se descarta sola al encolar, y
// el correo muestra como mucho ocho.
export function detallesDeOrden(ot) {
  // TODO(tú): devuelve las filas que un técnico o un supervisor necesita para
  // saber de qué orden se trata sin abrir la plataforma. Forma esperada:
  //   return [{ etiqueta: 'Equipo', valor: ot.equipo?.numero_inventario }, ...]
  return []
}
