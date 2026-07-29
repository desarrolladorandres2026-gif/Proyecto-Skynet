import { request } from './client.js'

export const sistema = {
  listarModulos() {
    return request('/sistema/modulos')
  },
  cambiarEstadoModulo(key, activo) {
    return request(`/sistema/modulos/${key}`, {
      method: 'PATCH',
      body: JSON.stringify({ activo }),
    })
  },
}
