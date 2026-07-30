import { request } from './client.js'

export const notificaciones = {
  vapidPublicKey() {
    return request('/notificaciones/push/vapid-public-key')
  },
  suscribirPush(subscription) {
    return request('/notificaciones/push/suscribir', { method: 'POST', body: JSON.stringify(subscription) })
  },
  desuscribirPush(endpoint) {
    return request('/notificaciones/push/desuscribir', { method: 'POST', body: JSON.stringify({ endpoint }) })
  },
  misDispositivos() {
    return request('/notificaciones/dispositivos')
  },
  olvidarDispositivo(id) {
    return request(`/notificaciones/dispositivos/${id}`, { method: 'DELETE' })
  },
  categorias() {
    return request('/notificaciones/categorias')
  },
  preferencias() {
    return request('/notificaciones/preferencias')
  },
  actualizarPreferencias(cambios) {
    return request('/notificaciones/preferencias', { method: 'PUT', body: JSON.stringify(cambios) })
  },
}
