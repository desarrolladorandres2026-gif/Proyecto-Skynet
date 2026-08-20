import { request } from './client.js'

// API del módulo "Cuestionarios Programados". Un solo archivo cubre tanto la
// gestión (SIG/HSEQ) como la experiencia del trabajador, mismo criterio que
// api/ausencias.js.
export const sig = {
  configuracion: {
    obtener() {
      return request('/sig_pregunta_dia/configuracion')
    },
    actualizar(datos) {
      return request('/sig_pregunta_dia/configuracion', { method: 'PATCH', body: JSON.stringify(datos) })
    },
  },
  banco: {
    listar({ estado, componenteSig, texto, etiqueta } = {}) {
      const params = new URLSearchParams()
      if (estado) params.set('estado', estado)
      if (componenteSig) params.set('componenteSig', componenteSig)
      if (texto) params.set('texto', texto)
      if (etiqueta) params.set('etiqueta', etiqueta)
      const qs = params.toString()
      return request(`/sig_pregunta_dia/banco${qs ? `?${qs}` : ''}`)
    },
    detalle(id) {
      return request(`/sig_pregunta_dia/banco/${id}`)
    },
    crear(datos) {
      return request('/sig_pregunta_dia/banco', { method: 'POST', body: JSON.stringify(datos) })
    },
    editar(id, datos) {
      return request(`/sig_pregunta_dia/banco/${id}`, { method: 'PATCH', body: JSON.stringify(datos) })
    },
    archivar(id, archivar) {
      return request(`/sig_pregunta_dia/banco/${id}/archivar`, { method: 'PATCH', body: JSON.stringify({ archivar }) })
    },
    eliminar(id) {
      return request(`/sig_pregunta_dia/banco/${id}`, { method: 'DELETE' })
    },
  },
  programacion: {
    crearIndividual(datos) {
      return request('/sig_pregunta_dia/programacion/individual', { method: 'POST', body: JSON.stringify(datos) })
    },
    calendario({ desde, hasta }) {
      const params = new URLSearchParams({ desde, hasta })
      return request(`/sig_pregunta_dia/programacion/calendario?${params}`)
    },
    listarIndividual({ desde, hasta, estado } = {}) {
      const params = new URLSearchParams()
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      if (estado) params.set('estado', estado)
      const qs = params.toString()
      return request(`/sig_pregunta_dia/programacion/individual${qs ? `?${qs}` : ''}`)
    },
    cancelarIndividual(id, motivo) {
      return request(`/sig_pregunta_dia/programacion/individual/${id}/cancelar`, {
        method: 'POST',
        body: JSON.stringify({ motivo }),
      })
    },
    previsualizarCampana(datos) {
      return request('/sig_pregunta_dia/programacion/campanas/previsualizar', { method: 'POST', body: JSON.stringify(datos) })
    },
    crearCampana(datos) {
      return request('/sig_pregunta_dia/programacion/campanas', { method: 'POST', body: JSON.stringify(datos) })
    },
    listarCampanas() {
      return request('/sig_pregunta_dia/programacion/campanas')
    },
    detalleCampana(id) {
      return request(`/sig_pregunta_dia/programacion/campanas/${id}`)
    },
    pausarCampana(id) {
      return request(`/sig_pregunta_dia/programacion/campanas/${id}/pausar`, { method: 'POST' })
    },
    reanudarCampana(id) {
      return request(`/sig_pregunta_dia/programacion/campanas/${id}/reanudar`, { method: 'POST' })
    },
    cancelarCampana(id, motivo) {
      return request(`/sig_pregunta_dia/programacion/campanas/${id}/cancelar`, {
        method: 'POST',
        body: JSON.stringify({ motivo }),
      })
    },
  },
  // Experiencia del trabajador: universal, sin permiso (ver
  // sig-respuestas.routes.js).
  preguntaDelDia() {
    return request('/sig_pregunta_dia/pregunta-del-dia')
  },
  responder(programacionId, opcionIndice) {
    return request(`/sig_pregunta_dia/programacion/${programacionId}/responder`, {
      method: 'POST',
      body: JSON.stringify({ opcionIndice }),
    })
  },
  miHistorial({ page, limit } = {}) {
    const params = new URLSearchParams()
    if (page) params.set('page', page)
    if (limit) params.set('limit', limit)
    const qs = params.toString()
    return request(`/sig_pregunta_dia/mi-historial${qs ? `?${qs}` : ''}`)
  },
  miProgreso() {
    return request('/sig_pregunta_dia/mi-progreso')
  },
  // Reportes de gestión (sig_pregunta_dia:ver_reportes).
  dashboard(filtros = {}) {
    return request(`/sig_pregunta_dia/dashboard${aQueryString(filtros)}`)
  },
  trabajadoresParticipantes() {
    return request('/sig_pregunta_dia/reportes/trabajadores')
  },
  reporteTrabajador(usuarioId, filtros = {}) {
    return request(`/sig_pregunta_dia/reportes/trabajador/${usuarioId}${aQueryString(filtros)}`)
  },
  planRefuerzo(filtros = {}) {
    return request(`/sig_pregunta_dia/reportes/plan-refuerzo${aQueryString(filtros)}`)
  },
  // Descarga binaria (xlsx): no usa request() de client.js, igual criterio
  // que requerimientos.exportar().
  async exportarExcel(filtros = {}) {
    const BASE = import.meta.env.VITE_API_URL || '/api'
    const res = await fetch(`${BASE}/sig_pregunta_dia/reportes/exportar${aQueryString(filtros)}`, { credentials: 'include' })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(data?.error || `Error ${res.status}`)
    }
    const blob = await res.blob()
    const nombreCabecera = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
    return { blob, nombre: nombreCabecera || 'pregunta-sig-respuestas.xlsx' }
  },
}

function aQueryString(filtros) {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor) params.set(clave, valor)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}
