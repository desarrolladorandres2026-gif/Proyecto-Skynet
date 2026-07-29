import { request } from './client.js'

export const usuarios = {
  listar() {
    return request('/usuarios')
  },
  buscar(q) {
    return request(`/usuarios/buscar?q=${encodeURIComponent(q)}`)
  },
  crear(datos) {
    return request('/usuarios', { method: 'POST', body: JSON.stringify(datos) })
  },
  actualizar(id, datos) {
    return request(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
  },
  eliminar(id) {
    return request(`/usuarios/${id}`, { method: 'DELETE' })
  },
}
