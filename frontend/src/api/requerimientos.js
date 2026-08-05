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
  // body: { password, comentario?, areaOProceso?, itemsCompra?, detalleServicio?, analisisTecnico?, observacion? }
  aprobarFinanciero(id, body) {
    return request(`/requerimientos/${id}/financiero/aprobar`, { method: 'POST', body: JSON.stringify(body) })
  },
  rechazarFinanciero(id, motivoRechazo) {
    return request(`/requerimientos/${id}/financiero/rechazar`, {
      method: 'POST',
      body: JSON.stringify({ motivoRechazo }),
    })
  },
  // password solo es obligatorio cuando estado === 'aprobada' (reautenticación
  // de identidad — Bodega no firma digitalmente el documento).
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
  // No usa request() de client.js: esa función siempre espera JSON
  // (`res.json()`), y esto es una descarga de archivo binario/texto plano
  // con su propio Content-Disposition. Comparte igual credentials:'include'
  // porque la sesión es la misma cookie httpOnly.
  async exportar(desde, hasta) {
    const BASE = import.meta.env.VITE_API_URL || '/api'
    const params = new URLSearchParams({ desde, hasta })
    const res = await fetch(`${BASE}/requerimientos/exportar?${params}`, { credentials: 'include' })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(data?.error || `Error ${res.status}`)
    }
    const blob = await res.blob()
    const nombreCabecera = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
    return { blob, nombre: nombreCabecera || `requerimientos_${desde}_a_${hasta}.csv` }
  },
  eliminarPorRango(desde, hasta, password) {
    return request('/requerimientos', {
      method: 'DELETE',
      body: JSON.stringify({ desde, hasta, password }),
    })
  },
}
