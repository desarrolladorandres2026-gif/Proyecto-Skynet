import { request } from './client.js'

export const ia = {
  categorias() {
    return request('/ia/categorias')
  },
  avisosPendientes() {
    return request('/ia/avisos')
  },
  marcarAvisosLeidos(ids) {
    return request('/ia/avisos/marcar-leidos', { method: 'POST', body: JSON.stringify({ ids }) })
  },
  // Ojo: gasta el turno del usuario si devuelve algo (ver ia.recordatorios.js).
  recordatorio() {
    return request('/ia/recordatorio')
  },
  preferencias() {
    return request('/ia/preferencias')
  },
  actualizarPreferencias(cambios) {
    return request('/ia/preferencias', { method: 'PUT', body: JSON.stringify(cambios) })
  },
  configuracionGlobal() {
    return request('/ia/configuracion')
  },
  actualizarConfiguracionGlobal(cambios) {
    return request('/ia/configuracion', { method: 'PUT', body: JSON.stringify(cambios) })
  },
}
