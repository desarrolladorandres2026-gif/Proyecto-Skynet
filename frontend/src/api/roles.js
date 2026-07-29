import { request } from './client.js'

export const roles = {
  listar() {
    return request('/roles')
  },
  obtener(id) {
    return request(`/roles/${id}`)
  },
  crear(datos) {
    return request('/roles', { method: 'POST', body: JSON.stringify(datos) })
  },
  actualizar(id, datos) {
    return request(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
  },
  eliminar(id) {
    return request(`/roles/${id}`, { method: 'DELETE' })
  },
}
