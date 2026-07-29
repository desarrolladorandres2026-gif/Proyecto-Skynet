import { request } from './client.js'

// Acceso reducido a SIGITTN para cualquier usuario autenticado: crear una
// "solicitud de soporte" y conversar por chat sobre ella, sin el flag legado
// que reserva la bandeja completa de tickets al personal de TI — ver
// Backend/src/modules/sigittn/soporte.routes.js.
export const soporte = {
  crear(datos) {
    return request('/soporte/tickets', { method: 'POST', body: JSON.stringify(datos) })
  },
  mios() {
    return request('/soporte/tickets/mios')
  },
  obtener(id) {
    return request(`/soporte/tickets/${id}`)
  },
  mensajes: {
    enviarTexto(id, texto_mensaje) {
      return request(`/soporte/tickets/${id}/mensajes`, {
        method: 'POST',
        body: JSON.stringify({ texto_mensaje }),
      })
    },
    enviarImagen(id, url_imagen_mensaje) {
      return request(`/soporte/tickets/${id}/mensajes`, {
        method: 'POST',
        body: JSON.stringify({ url_imagen_mensaje }),
      })
    },
    marcarTodosLeidos(id) {
      return request(`/soporte/tickets/${id}/mensajes/leidos`, { method: 'PATCH' })
    },
  },
  archivos: {
    subir(file) {
      const fd = new FormData()
      fd.append('file', file)
      return request('/soporte/upload', { method: 'POST', body: fd })
    },
  },
}
