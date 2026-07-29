import { request } from './client.js'

export const sigittnApi = {
  catalogos: {
    obtener() {
      return request('/sigittn/catalogos')
    },
  },

  tickets: {
    listar({ id_modulo_origen, estados, id_usuario, page = 1, limit = 9 } = {}) {
      const p = new URLSearchParams()
      if (id_modulo_origen) p.set('id_modulo_origen', id_modulo_origen)
      if (estados?.length) p.set('estados', estados.join(','))
      if (id_usuario) p.set('id_usuario', id_usuario)
      p.set('page', page)
      p.set('limit', limit)
      return request(`/sigittn/tickets?${p}`)
    },
    contadores() {
      return request('/sigittn/tickets/contadores')
    },
    metricas({ id_usuario, desde, hasta } = {}) {
      const p = new URLSearchParams()
      p.set('id_usuario', id_usuario)
      if (desde) p.set('desde', desde)
      if (hasta) p.set('hasta', hasta)
      return request(`/sigittn/tickets/metricas?${p}`)
    },
    obtener(id) {
      return request(`/sigittn/tickets/${id}`)
    },
    crear(datos) {
      return request('/sigittn/tickets', { method: 'POST', body: JSON.stringify(datos) })
    },
    actualizar(id, datos) {
      return request(`/sigittn/tickets/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
    },
    cambiarEstado(id, id_estado) {
      return request(`/sigittn/tickets/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ id_estado }) })
    },
  },

  notificaciones: {
    noLeidos() {
      return request('/sigittn/mensajes/no-leidos')
    },
    marcarTodosLeidos(ticketId) {
      return request(`/sigittn/tickets/${ticketId}/mensajes/leidos`, { method: 'PATCH' })
    },
  },

  mensajes: {
    listar(ticketId) {
      return request(`/sigittn/tickets/${ticketId}/mensajes`)
    },
    enviarTexto(ticketId, texto_mensaje) {
      return request(`/sigittn/tickets/${ticketId}/mensajes`, {
        method: 'POST',
        body: JSON.stringify({ texto_mensaje }),
      })
    },
    enviarImagen(ticketId, url_imagen_mensaje) {
      return request(`/sigittn/tickets/${ticketId}/mensajes`, {
        method: 'POST',
        body: JSON.stringify({ url_imagen_mensaje }),
      })
    },
    marcarLeido(ticketId, idMensaje) {
      return request(`/sigittn/tickets/${ticketId}/mensajes/${idMensaje}/leido`, { method: 'PATCH' })
    },
  },

  push: {
    getVapidPublicKey() {
      return request('/sigittn/push/vapid-public-key')
    },
    suscribir(subscription) {
      return request('/sigittn/push/suscribir', { method: 'POST', body: JSON.stringify(subscription) })
    },
    desuscribir(endpoint) {
      return request('/sigittn/push/desuscribir', { method: 'POST', body: JSON.stringify({ endpoint }) })
    },
  },

  archivos: {
    async subir(file) {
      const form = new FormData()
      form.append('file', file)
      return request('/sigittn/upload', { method: 'POST', body: form })
    },
  },
}
