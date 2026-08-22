import { request } from './client.js'

export const plataforma = {
  // Público: no requiere sesión. Es lo que consulta la pantalla de login y el
  // sondeo global de estado.
  //
  // suppressAuthEvent evita que, si algún día este endpoint respondiera 401
  // por un cambio de configuración, la sonda anónima dispare skynet:logout y
  // saque de la app a un usuario que sí tenía sesión válida (mismo criterio
  // que la sonda inicial de /auth/me — ver client.js).
  estado() {
    return request('/plataforma/estado', { suppressAuthEvent: true })
  },

  // ── Administrativas (permiso 'plataforma:gestionar') ────────────────────
  estadoAdmin() {
    return request('/plataforma/admin')
  },
  historial(pagina = 1, porPagina = 20) {
    return request(`/plataforma/historial?pagina=${pagina}&porPagina=${porPagina}`)
  },
  programar(datos) {
    return request('/plataforma/programar', { method: 'POST', body: JSON.stringify(datos) })
  },
  editar(datos) {
    return request('/plataforma/programar', { method: 'PUT', body: JSON.stringify(datos) })
  },
  cancelar() {
    return request('/plataforma/programar', { method: 'DELETE' })
  },
  activar(datos) {
    return request('/plataforma/activar', { method: 'POST', body: JSON.stringify(datos) })
  },
  finalizar() {
    return request('/plataforma/finalizar', { method: 'POST' })
  },
}
