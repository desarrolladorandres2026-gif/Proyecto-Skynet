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
  asignar(id, tecnicoId, nota, forzar = false) {
    return request(`/danos/${id}/asignar`, {
      method: 'PATCH',
      body: JSON.stringify({ tecnicoId, nota, forzar }),
    })
  },
  // reparacionFecha/reparacionModulo/evidencias (Files[]) solo aplican al
  // marcar 'resuelto' — si vienen evidencias se manda multipart (igual que
  // reportar()), si no, JSON plano como siempre.
  cambiarEstado(id, { estado, nota, motivoEspera, prioridad, reparacionFecha, reparacionModulo, evidencias }) {
    if (evidencias?.length) {
      const fd = new FormData()
      fd.append('estado', estado)
      if (nota) fd.append('nota', nota)
      if (motivoEspera) fd.append('motivoEspera', motivoEspera)
      if (prioridad) fd.append('prioridad', prioridad)
      if (reparacionFecha) fd.append('reparacionFecha', reparacionFecha)
      if (reparacionModulo) fd.append('reparacionModulo', reparacionModulo)
      for (const foto of evidencias) fd.append('evidencias', foto)
      return request(`/danos/${id}/estado`, { method: 'PATCH', body: fd })
    }
    return request(`/danos/${id}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado, nota, motivoEspera, prioridad, reparacionFecha, reparacionModulo }),
    })
  },
  eliminar(id) {
    return request(`/danos/${id}`, { method: 'DELETE' })
  },
}
