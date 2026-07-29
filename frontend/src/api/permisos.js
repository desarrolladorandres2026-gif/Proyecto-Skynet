import { request } from './client.js'

export const permisos = {
  listarAgrupados() {
    return request('/permisos')
  },
}
