import { request, requestBlob } from './client.js'

// "Avisos Terminal de Neiva": anuncios institucionales por voz. Ver
// Backend/src/modules/avisos_terminal — mismo patrón que api/notificaciones.js.
export const avisosTerminal = {
  transmitir({ texto, destinatarios, voz }) {
    return request('/avisos-terminal', { method: 'POST', body: JSON.stringify({ texto, destinatarios, voz }) })
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

  // Voz institucional generada en el servidor (ver
  // Backend/src/modules/avisos_terminal/avisos.tts.js) — mismo audio para
  // TODOS los destinatarios, a diferencia de la voz local de cada
  // dispositivo. requestBlob() (no request()) porque la respuesta es audio
  // binario, no JSON.
  obtenerAudio(avisoId) {
    return requestBlob(`/avisos-terminal/${avisoId}/audio`)
  },
  probarVoz({ texto, voz }) {
    return requestBlob('/avisos-terminal/voz/probar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, voz }),
      timeoutMs: 25_000, // la síntesis de voz puede tardar más que un request normal
    })
  },
}
