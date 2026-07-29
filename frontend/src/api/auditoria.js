import { request } from './client.js'

export const auditoria = {
  listar({ page = 1, limit = 20, modulo, usuario, accion, desde, hasta } = {}) {
    const params = new URLSearchParams({ page, limit })
    if (modulo) params.set('modulo', modulo)
    if (usuario) params.set('usuario', usuario)
    if (accion) params.set('accion', accion)
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    return request(`/auditoria?${params.toString()}`)
  },
}
