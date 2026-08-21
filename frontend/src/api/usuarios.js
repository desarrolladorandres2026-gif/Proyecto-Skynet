import { request } from './client.js'

export const usuarios = {
  listar({ esPrueba = false } = {}) {
    return request(`/usuarios?esPrueba=${esPrueba}`)
  },
  buscar(q, { esPrueba = false } = {}) {
    return request(`/usuarios/buscar?q=${encodeURIComponent(q)}&esPrueba=${esPrueba}`)
  },
  crear(datos) {
    return request('/usuarios', { method: 'POST', body: JSON.stringify(datos) })
  },
  actualizar(id, datos) {
    return request(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
  },
  convertirReal(id) {
    return request(`/usuarios/${id}/convertir-real`, { method: 'POST' })
  },
  eliminar(id) {
    return request(`/usuarios/${id}`, { method: 'DELETE' })
  },
}
