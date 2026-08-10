import { request } from './client.js'

const BASE = import.meta.env.VITE_API_URL || '/api'

export const email = {
  // Navegación de página completa (no fetch): el backend redirige al
  // consentimiento de Google, que a su vez redirige de vuelta al backend y
  // este a /email/configuracion. No es una llamada a la API JSON normal.
  urlConectarGmail() {
    return `${BASE}/email/oauth/gmail/iniciar`
  },
  desconectar() {
    return request('/email/oauth/gmail', { method: 'DELETE' })
  },
  estado() {
    return request('/email/estado')
  },
  listar(carpeta = 'entrada') {
    return request(`/email?carpeta=${encodeURIComponent(carpeta)}`)
  },
  buscar(query) {
    return request(`/email/buscar?q=${encodeURIComponent(query)}`)
  },
  detalle(id) {
    return request(`/email/${id}`)
  },
  enviar(mensaje) {
    return request('/email', { method: 'POST', body: JSON.stringify({ ...mensaje, confirmar: true }) })
  },
  eliminar(id) {
    return request(`/email/${id}`, { method: 'DELETE' })
  },
  marcarLeido(id, leido = true) {
    return request(`/email/${id}/leido`, { method: 'PATCH', body: JSON.stringify({ leido }) })
  },
  archivar(id) {
    return request(`/email/${id}/archivar`, { method: 'PATCH' })
  },
}
