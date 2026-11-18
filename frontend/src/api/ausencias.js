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
  // ── Trámite de incapacidades ──────────────────────────────────────────
  // Bandejas del trámite: solo vienen las de los pasos que le tocan a quien consulta.
  tramiteIncapacidades() {
    return request('/ausencias/incapacidades/tramite')
  },
  supervisionIncapacidades({ etapa, q, desde, hasta } = {}) {
    const params = new URLSearchParams()
    if (etapa) params.set('etapa', etapa)
    if (q) params.set('q', q)
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    const qs = params.toString()
    return request(`/ausencias/incapacidades/supervision${qs ? `?${qs}` : ''}`)
  },
  destinatariosIncapacidades() {
    return request('/ausencias/incapacidades/destinatarios')
  },
  verificarIncapacidad(id, observacion) {
    return request(`/ausencias/${id}/verificar`, { method: 'POST', body: JSON.stringify({ observacion }) })
  },
  devolverIncapacidad(id, motivo) {
    return request(`/ausencias/${id}/devolver`, { method: 'POST', body: JSON.stringify({ motivo }) })
  },
  foliarIncapacidad(id, { numeroFolio, observacion }) {
    return request(`/ausencias/${id}/foliar`, { method: 'POST', body: JSON.stringify({ numeroFolio, observacion }) })
  },
  direccionarIncapacidad(id, { destinatarioId, mensaje }) {
    return request(`/ausencias/${id}/direccionar`, { method: 'POST', body: JSON.stringify({ destinatarioId, mensaje }) })
  },
  completarFolioIncapacidad(id, observacion) {
    return request(`/ausencias/${id}/completar-folio`, { method: 'POST', body: JSON.stringify({ observacion }) })
  },
  tramitarIncapacidad(id, observacion) {
    return request(`/ausencias/${id}/tramitar`, { method: 'POST', body: JSON.stringify({ observacion }) })
  },
  // datos: objeto plano, o FormData si la corrección trae un soporte nuevo.
  reenviarIncapacidad(id, datos) {
    const esFormData = datos instanceof FormData
    return request(`/ausencias/${id}/reenviar`, { method: 'POST', body: esFormData ? datos : JSON.stringify(datos) })
  },
  urlSoporte(id, archivo) {
    return `/api/ausencias/${id}/soporte${archivo ? `/${encodeURIComponent(archivo)}` : ''}`
  },
}
