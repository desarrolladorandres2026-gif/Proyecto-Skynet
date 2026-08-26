import { request } from './client.js'

export const ausencias = {
  // datos: { tipo, fechaInicio, fechaFin, motivo?, motivoLicencia? } como
  // objeto plano, o un FormData ya armado (incapacidad, con el soporte
  // adjunto en el campo 'soporte') — mismo criterio que api/danos.js.
  crear(datos) {
    const esFormData = datos instanceof FormData
    return request('/ausencias', { method: 'POST', body: esFormData ? datos : JSON.stringify(datos) })
  },
  mias() {
    return request('/ausencias/mias')
  },
  bandeja() {
    return request('/ausencias/bandeja')
  },
  listarTodas({ estado, tipo } = {}) {
    const params = new URLSearchParams()
    if (estado) params.set('estado', estado)
    if (tipo) params.set('tipo', tipo)
    const qs = params.toString()
    return request(`/ausencias${qs ? `?${qs}` : ''}`)
  },
  calendario({ desde, hasta } = {}) {
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    const qs = params.toString()
    return request(`/ausencias/calendario${qs ? `?${qs}` : ''}`)
  },
  detalle(id) {
    return request(`/ausencias/${id}`)
  },
  aprobar(id, observacion) {
    return request(`/ausencias/${id}/aprobar`, { method: 'POST', body: JSON.stringify({ observacion }) })
  },
  rechazar(id, motivoRechazo) {
    return request(`/ausencias/${id}/rechazar`, { method: 'POST', body: JSON.stringify({ motivoRechazo }) })
  },
  cancelar(id) {
    return request(`/ausencias/${id}/cancelar`, { method: 'POST' })
  },
  urlSoporte(id, archivo) {
    return `/api/ausencias/${id}/soporte${archivo ? `/${encodeURIComponent(archivo)}` : ''}`
  },
}
