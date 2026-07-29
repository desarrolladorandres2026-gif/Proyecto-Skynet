import { request } from './client.js'

export const empresas = {
  listar: () => request('/empresas'),
  crear: (datos) => request('/empresas', { method: 'POST', body: JSON.stringify(datos) }),
  actualizar: (id, datos) => request(`/empresas/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  eliminar: (id) => request(`/empresas/${id}`, { method: 'DELETE' }),
  estadisticas: (id) => request(`/empresas/${id}/estadisticas`),
}

export const vehiculos = {
  listar: () => request('/vehiculos'),
  crear: (datos) => request('/vehiculos', { method: 'POST', body: JSON.stringify(datos) }),
  actualizar: (id, datos) => request(`/vehiculos/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  eliminar: (id) => request(`/vehiculos/${id}`, { method: 'DELETE' }),
}

export const conductores = {
  listar: () => request('/conductores'),
  crear: (datos) => request('/conductores', { method: 'POST', body: JSON.stringify(datos) }),
  actualizar: (id, datos) => request(`/conductores/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  eliminar: (id) => request(`/conductores/${id}`, { method: 'DELETE' }),
}

export const plataformas = {
  listar: () => request('/plataformas'),
  crear: (datos) => request('/plataformas', { method: 'POST', body: JSON.stringify(datos) }),
  cambiarEstado: (id, datos) => request(`/plataformas/${id}/estado`, { method: 'PATCH', body: JSON.stringify(datos) }),
  eliminar: (id) => request(`/plataformas/${id}`, { method: 'DELETE' }),
}
