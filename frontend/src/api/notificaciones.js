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

  // Centro de notificaciones (campana): siempre sobre el usuario de la
  // sesión — ningún parámetro de aquí identifica a quién consultar, eso lo
  // decide el backend a partir de la cookie.
  misNotificaciones({ page = 1, limit = 20 } = {}) {
    const params = new URLSearchParams({ page, limit })
    return request(`/notificaciones/mias?${params.toString()}`)
  },
  noLeidas() {
    return request('/notificaciones/mias/no-leidas')
  },
  marcarLeida(id) {
    return request(`/notificaciones/mias/${id}/leida`, { method: 'PUT' })
  },
  marcarTodasLeidas() {
    return request('/notificaciones/mias/leidas', { method: 'PUT' })
  },

  // Elección y configuración administrativa de canales (Email / Push)
  configuracionCanales() {
    return request('/notificaciones/admin/canales')
  },
  coberturaPush() {
    return request('/notificaciones/admin/cobertura-push')
  },
  actualizarConfiguracionCanales(cambios) {
    return request('/notificaciones/admin/canales', { method: 'PUT', body: JSON.stringify(cambios) })
  },
}
