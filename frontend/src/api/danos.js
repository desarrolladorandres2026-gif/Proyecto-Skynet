import { request } from './client.js'

export const danos = {
  // formData: { fecha, descripcion, foto (File) }
  reportar(formData) {
    return request('/danos', { method: 'POST', body: formData })
  },
  mios() {
    return request('/danos/mios')
  },
  listar(estado, tipo) {
    const params = new URLSearchParams()
    if (estado) params.set('estado', estado)
    if (tipo) params.set('tipo', tipo)
    const qs = params.toString()
    return request(`/danos${qs ? `?${qs}` : ''}`)
  },
  cambiarEstado(id, estado, observacion) {
    return request(`/danos/${id}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado, observacion }),
    })
  },
  eliminar(id) {
    return request(`/danos/${id}`, { method: 'DELETE' })
  },
}
