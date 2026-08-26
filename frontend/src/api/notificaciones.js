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

  // Historial administrativo de envíos (push/email) — exige el permiso
  // notificaciones:ver_historial en el backend.
  historialEnvios({ page = 1, limit = 25, usuario, categoria, canal, estado, desde, hasta, soloErrores } = {}) {
    const params = new URLSearchParams({ page, limit })
    if (usuario) params.set('usuario', usuario)
    if (categoria) params.set('categoria', categoria)
    if (canal) params.set('canal', canal)
    if (estado) params.set('estado', estado)
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (soloErrores) params.set('soloErrores', 'true')
    return request(`/notificaciones/admin/envios?${params.toString()}`)
  },
  historialFiltros() {
    return request('/notificaciones/admin/envios/filtros')
  },

  // Elección y configuración administrativa de canales (Email / Push)
  configuracionCanales() {
    return request('/notificaciones/admin/canales')
  },
  actualizarConfiguracionCanales(cambios) {
    return request('/notificaciones/admin/canales', { method: 'PUT', body: JSON.stringify(cambios) })
  },
}
