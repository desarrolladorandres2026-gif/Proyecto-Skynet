import { EmailProvider } from './EmailProvider.js'

// Implementación de referencia usada mientras no hay ningún proveedor real
// conectado (Gmail/Outlook/IMAP): no hay cuenta enlazada, así que devuelve
// listas vacías en vez de datos inventados. Sirve también de plantilla del
// contrato para quien implemente el próximo proveedor real.
export class MockEmailProvider extends EmailProvider {
  async estadoConexion() {
    return { conectada: false, cuenta: null, proveedor: 'ninguno' }
  }

  async listar(_opciones) {
    return []
  }

  async buscar(_opciones) {
    return []
  }

  async obtener(_id) {
    return null
  }

  async enviar(_mensaje) {
    throw new Error('No hay ninguna cuenta de correo conectada todavía')
  }

  async marcarLeido(_id, _leido = true) {
    throw new Error('No hay ninguna cuenta de correo conectada todavía')
  }

  async archivar(_id) {
    throw new Error('No hay ninguna cuenta de correo conectada todavía')
  }

  async eliminar(_id) {
    throw new Error('No hay ninguna cuenta de correo conectada todavía')
  }
}
