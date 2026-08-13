import { request } from './client.js'

export const catalogosApi = {
  obtener() {
    return request('/catalogos')
  },
  agregar(tipo, nombre) {
    return request('/catalogos/agregar', { method: 'POST', body: JSON.stringify({ tipo, nombre }) })
  },
  eliminar(tipo, id) {
    return request('/catalogos/eliminar', { method: 'POST', body: JSON.stringify({ tipo, id }) })
  },
}
