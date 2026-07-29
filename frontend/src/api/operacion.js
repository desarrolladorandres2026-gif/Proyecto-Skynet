import { request } from './client.js'

export const dashboard = {
  resumen: () => request('/dashboard'),
}

export const rutas = {
  listar: () => request('/rutas'),
  crear: (datos) => request('/rutas', { method: 'POST', body: JSON.stringify(datos) }),
  actualizar: (id, datos) => request(`/rutas/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  eliminar: (id) => request(`/rutas/${id}`, { method: 'DELETE' }),
}

export const horarios = {
  listar: () => request('/horarios'),
  crear: (datos) => request('/horarios', { method: 'POST', body: JSON.stringify(datos) }),
  actualizar: (id, datos) => request(`/horarios/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  eliminar: (id) => request(`/horarios/${id}`, { method: 'DELETE' }),
}

export const despachos = {
  listar: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/despachos${qs ? `?${qs}` : ''}`)
  },
  registrarSalida: (datos) => request('/despachos/salida', { method: 'POST', body: JSON.stringify(datos) }),
  registrarLlegada: (id) => request(`/despachos/${id}/llegada`, { method: 'PATCH' }),
  registrarRetraso: (id, datos) => request(`/despachos/${id}/retraso`, { method: 'PATCH', body: JSON.stringify(datos) }),
}

export const novedades = {
  listar: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/novedades${qs ? `?${qs}` : ''}`)
  },
  crear: (datos) => request('/novedades', { method: 'POST', body: JSON.stringify(datos) }),
  cerrar: (id, observacion) => request(`/novedades/${id}/cerrar`, { method: 'PATCH', body: JSON.stringify({ observacion }) }),
}

export const objetosPerdidos = {
  listar: (estado) => request(`/objetos-perdidos${estado ? `?estado=${estado}` : ''}`),
  registrar: (datos) => request('/objetos-perdidos', { method: 'POST', body: JSON.stringify(datos) }),
  entregar: (id, datos) => request(`/objetos-perdidos/${id}/entregar`, { method: 'PATCH', body: JSON.stringify(datos) }),
}
