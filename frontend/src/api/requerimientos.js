import { request } from './client.js'

export const requerimientos = {
  crear(datos) {
    return request('/requerimientos', { method: 'POST', body: JSON.stringify(datos) })
  },
  mios() {
    return request('/requerimientos/mios')
  },
  bandejaFinanciero() {
    return request('/requerimientos/financiero')
  },
  bandejaBodega() {
    return request('/requerimientos/bodega')
  },
  listarTodos({ estado, tipo } = {}) {
    const params = new URLSearchParams()
    if (estado) params.set('estado', estado)
    if (tipo) params.set('tipo', tipo)
    const qs = params.toString()
    return request(`/requerimientos${qs ? `?${qs}` : ''}`)
  },
  detalle(id) {
    return request(`/requerimientos/${id}`)
  },
  editarFinanciero(id, cambios) {
    return request(`/requerimientos/${id}/financiero`, { method: 'PATCH', body: JSON.stringify(cambios) })
  },
  // body: { password, comentario?, areaOProceso?, itemsCompra?, detalleServicio?, analisisTecnico? }
  aprobarFinanciero(id, body) {
    return request(`/requerimientos/${id}/financiero/aprobar`, { method: 'POST', body: JSON.stringify(body) })
  },
  rechazarFinanciero(id, motivoRechazo) {
    return request(`/requerimientos/${id}/financiero/rechazar`, {
      method: 'POST',
      body: JSON.stringify({ motivoRechazo }),
    })
  },
  // password solo es obligatorio cuando estado === 'aprobada' (es la "firma").
  marcarEstadoBodega(id, estado, observacion, password) {
    return request(`/requerimientos/${id}/bodega/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado, observacion, password }),
    })
  },
  marcarControlRecibido(id, itemId, recibido, observacion) {
    return request(`/requerimientos/${id}/bodega/items/${itemId}/recibido`, {
      method: 'PATCH',
      body: JSON.stringify({ recibido, observacion }),
    })
  },
}
