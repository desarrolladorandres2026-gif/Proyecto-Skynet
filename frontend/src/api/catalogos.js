import { request } from './client.js'

export const catalogosApi = {
  obtener() {
    return request('/catalogos')
  },
  agregar(tipo, nombre) {
    return request('/catalogos/agregar', { method: 'POST', body: JSON.stringify({ tipo, nombre }) })
  },
  eliminar(tipo, id) {
    return request('/catalogos/eliminar', { method: 'POST', body: JSON.stringify({ tipo, id }) })
  },
  // Jerarquía (padre) de una Dependencia, o la dependencia por defecto de un
  // Cargo. `datos` es un objeto parcial: solo se envían los campos que
  // cambian (padre, o dependencia respectivamente); un string vacío limpia
  // la referencia.
  actualizarDependencia(id, datos) {
    return request(`/catalogos/dependencia/${id}`, { method: 'PATCH', body: JSON.stringify(datos) })
  },
  actualizarCargo(id, datos) {
    return request(`/catalogos/cargo/${id}`, { method: 'PATCH', body: JSON.stringify(datos) })
  },
}
