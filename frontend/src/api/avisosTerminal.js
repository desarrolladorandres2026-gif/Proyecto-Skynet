import { request } from './client.js'

// "Avisos Terminal de Neiva": anuncios institucionales por voz. Ver
// Backend/src/modules/avisos_terminal — mismo patrón que api/notificaciones.js.
export const avisosTerminal = {
  transmitir({ texto, destinatarios }) {
    return request('/avisos-terminal', { method: 'POST', body: JSON.stringify({ texto, destinatarios }) })
  },
  opcionesDestinatarios() {
    return request('/avisos-terminal/destinatarios/opciones')
  },
  buscarUsuarios(q) {
    const params = new URLSearchParams({ q })
    return request(`/avisos-terminal/destinatarios/usuarios?${params.toString()}`)
  },
  historial({ page = 1, limit = 20 } = {}) {
    const params = new URLSearchParams({ page, limit })
    return request(`/avisos-terminal?${params.toString()}`)
  },
  detalle(id) {
    return request(`/avisos-terminal/${id}`)
  },

  // Lado destinatario: siempre sobre el usuario de la sesión — ningún
  // parámetro identifica a quién consultar (mismo criterio que
  // notificaciones.mias*).
  pendientes() {
    return request('/avisos-terminal/pendientes')
  },
  misAvisos({ page = 1, limit = 20 } = {}) {
    const params = new URLSearchParams({ page, limit })
    return request(`/avisos-terminal/mias?${params.toString()}`)
  },
  confirmarEstadoEntrega(entregaId, estado) {
    return request(`/avisos-terminal/entregas/${entregaId}/estado`, {
      method: 'PUT',
      body: JSON.stringify({ estado }),
    })
  },
}
