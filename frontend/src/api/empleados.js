import { request } from './client.js'

export const empleadosApi = {
  listar({ estado } = {}) {
    const params = new URLSearchParams()
    if (estado) params.set('estado', estado)
    const qs = params.toString()
    return request(`/empleados${qs ? `?${qs}` : ''}`)
  },
  usuariosDisponibles() {
    return request('/empleados/usuarios-disponibles')
  },
  obtener(id) {
    return request(`/empleados/${id}`)
  },
  crear(datos) {
    return request('/empleados', { method: 'POST', body: JSON.stringify(datos) })
  },
  actualizar(id, datos) {
    return request(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
  },
  desvincular(id, motivo) {
    return request(`/empleados/${id}/desvincular`, { method: 'POST', body: JSON.stringify({ motivo }) })
  },
  reactivar(id) {
    return request(`/empleados/${id}/reactivar`, { method: 'POST' })
  },
}
