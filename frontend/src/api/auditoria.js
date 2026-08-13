import { request } from './client.js'

export const auditoria = {
  listar({ page = 1, limit = 20, modulo, usuario, accion, resultado, desde, hasta } = {}) {
    const params = new URLSearchParams({ page, limit })
    if (modulo) params.set('modulo', modulo)
    if (usuario) params.set('usuario', usuario)
    if (accion) params.set('accion', accion)
    if (resultado) params.set('resultado', resultado)
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    return request(`/auditoria?${params.toString()}`)
  },
  obtenerFiltros() {
    return request('/auditoria/filtros')
  },
  eliminar(id) {
    return request(`/auditoria/${id}`, { method: 'DELETE' })
  },
  eliminarMasivo(ids) {
    return request('/auditoria/lote', { method: 'DELETE', body: JSON.stringify({ ids }) })
  },
}
