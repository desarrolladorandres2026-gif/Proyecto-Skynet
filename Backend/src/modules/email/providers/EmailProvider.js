// Contrato que debe implementar cualquier proveedor de correo (Gmail,
// Outlook/Microsoft 365, IMAP, ...). El resto del módulo Email (service,
// controller, tools de Skynet) programa contra esta interfaz, nunca contra
// un proveedor concreto — así conectar un proveedor real más adelante no
// toca nada fuera de modules/email/providers/.
export class EmailProvider {
  // { conectada: boolean, cuenta: string|null, proveedor: string }
  async estadoConexion() {
    throw new Error('EmailProvider.estadoConexion no implementado')
  }

  // { carpeta, query, limite } -> [{ id, de, asunto, resumen, fecha, leido, importante }]
  async listar(_opciones) {
    throw new Error('EmailProvider.listar no implementado')
  }

  // { query, limite } -> [ mensaje ]
  async buscar(_opciones) {
    throw new Error('EmailProvider.buscar no implementado')
  }

  // id -> mensaje completo (con cuerpo)
  async obtener(_id) {
    throw new Error('EmailProvider.obtener no implementado')
  }

  // { destinatario, asunto, cuerpo, enRespuestaA? } -> { id }
  // Acción sensible: el service exige confirmación explícita antes de llamarla.
  async enviar(_mensaje) {
    throw new Error('EmailProvider.enviar no implementado')
  }

  async marcarLeido(_id, _leido = true) {
    throw new Error('EmailProvider.marcarLeido no implementado')
  }

  async archivar(_id) {
    throw new Error('EmailProvider.archivar no implementado')
  }

  async eliminar(_id) {
    throw new Error('EmailProvider.eliminar no implementado')
  }
}
