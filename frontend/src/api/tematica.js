import { request } from './client.js'

export const tematicaApi = {
  // Público (también lo usa el login). Devuelve { modo }: 'auto' | 'ninguna' | id.
  // suppressAuthEvent: sin sesión no debe disparar el cierre de sesión global.
  obtener() {
    return request('/tematica', { suppressAuthEvent: true })
  },
  // Permiso 'tematica:gestionar'.
  cambiar(modo) {
    return request('/tematica', { method: 'PUT', body: JSON.stringify({ modo }) })
  },
}
