import { request } from './client.js'

export const danos = {
  // formData: { fecha, descripcion, foto (File) }
  reportar(formData) {
    return request('/danos', { method: 'POST', body: formData })
  },
  mios() {
    return request('/danos/mios')
  },
  // filtros: { estado, tipo, prioridad, asignado } — asignado acepta
  // 'mi' (mi cola), 'sin' (sin responsable) o el id de un técnico.
  listar(filtros = {}) {
    const params = new URLSearchParams()
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor) params.set(clave, valor)
    }
    const qs = params.toString()
    return request(`/danos${qs ? `?${qs}` : ''}`)
  },
  detalle(id) {
    return request(`/danos/${id}`)
  },
  // Equipo de mantenimiento con su carga de trabajo actual.
  tecnicos() {
    return request('/danos/tecnicos')
  },
  asignar(id, tecnicoId, nota) {
    return request(`/danos/${id}/asignar`, {
      method: 'PATCH',
      body: JSON.stringify({ tecnicoId, nota }),
    })
  },
  cambiarEstado(id, { estado, nota, motivoEspera, prioridad }) {
    return request(`/danos/${id}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado, nota, motivoEspera, prioridad }),
    })
  },
  eliminar(id) {
    return request(`/danos/${id}`, { method: 'DELETE' })
  },
}
