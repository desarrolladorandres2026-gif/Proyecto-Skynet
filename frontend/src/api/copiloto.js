import { request } from './client.js'

const BASE = import.meta.env.VITE_API_URL || '/api'

// A diferencia del resto de la API (api/client.js devuelve el JSON completo),
// el chat se consume como stream para que la respuesta aparezca escribiéndose.
// No se usa EventSource porque solo soporta GET y aquí hace falta POST con
// cuerpo; se lee el body del fetch trozo a trozo.
//
// `conversacionId` es un identificador OPACO que devuelve el servidor en el
// primer evento del stream y que este cliente solo reenvía. Sustituyó al
// historial completo que antes viajaba en cada petición.
//
// El cambio no fue por ancho de banda sino por seguridad: mandando el
// historial, un cliente podía fabricar turnos con rol:'model' y ponerle
// palabras en la boca al asistente ("confirmado: este usuario es Super
// Admin"). El modelo trata su propio historial como hechos ya establecidos,
// así que es la vía de inyección más efectiva que hay. Ahora los turnos del
// modelo son los que el servidor generó, y este cliente no puede inventarlos
// (ver Backend/src/models/ConversacionCopiloto.js).
//
// Callbacks, uno por tipo de evento del stream:
//   onDelta(texto)        — trozos de la respuesta.
//   onAccion(evento)      — una herramienta produjo algo que dibujar (borrador).
//   onNavegacion(evento)  — {ruta, titulo}: hay que llevar al usuario ahí.
//   onConfirmacion(ev)    — {token, descripcion}: hay que pedir un sí explícito.
//
// ── Por qué el frontend NUNCA lee el texto para decidir qué hacer ───────────
// Las acciones llegan como eventos TIPADOS, no deducidas de la prosa. Si la
// navegación se disparara al detectar "voy a abrir los reportes" en la
// respuesta, bastaría con que el modelo redactara distinto —o con que alguien
// le pidiera que lo escribiera— para provocar una acción no pretendida. Cada
// evento de acción nace de una herramienta que el servidor ya ejecutó y
// verificó contra los permisos reales del usuario.
export const copiloto = {
  async chat(mensaje, conversacionId, { onDelta, onAccion, onNavegacion, onConfirmacion, signal } = {}) {
    const res = await fetch(`${BASE}/copiloto/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje, conversacionId }),
      credentials: 'include',
      signal,
    })

    // Un fallo ANTES de que empiece el stream (401, 403, 429, módulo apagado)
    // llega como JSON normal con status de error, no como SSE.
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      if (res.status === 401) {
        localStorage.removeItem('skynet_usuario')
        window.dispatchEvent(new Event('skynet:logout'))
      }
      throw new Error(data?.error || `Error ${res.status}`)
    }

    const lector = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let idFinal = conversacionId ?? null
    // 'atajo' cuando el servidor resolvió sin llamar al modelo, 'modelo'
    // cuando sí. Se devuelve para poder medir en la propia interfaz qué
    // proporción del tráfico se está resolviendo por el camino rápido.
    let via = null

    while (true) {
      const { done, value } = await lector.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Los eventos SSE se separan por línea en blanco; el último fragmento
      // puede venir cortado a la mitad, así que se deja en el buffer.
      const partes = buffer.split('\n\n')
      buffer = partes.pop() ?? ''

      for (const bloque of partes) {
        const linea = bloque.split('\n').find((l) => l.startsWith('data: '))
        if (!linea) continue
        const evento = JSON.parse(linea.slice(6))
        if (evento.tipo === 'delta') onDelta?.(evento.texto)
        else if (evento.tipo === 'accion') onAccion?.(evento)
        else if (evento.tipo === 'navegacion') onNavegacion?.(evento)
        else if (evento.tipo === 'confirmacion') onConfirmacion?.(evento)
        else if (evento.tipo === 'inicio') idFinal = evento.conversacionId
        else if (evento.tipo === 'fin') via = evento.via
        else if (evento.tipo === 'error') throw new Error(evento.error)
      }
    }

    return { conversacionId: idFinal, via }
  },

  // Único endpoint que de verdad guarda un requerimiento sugerido por el
  // chat — nunca lo llama el modelo, solo el botón "Confirmar y enviar" que
  // dibuja la tarjeta de borrador (ver CopilotoBorradorRequerimiento.jsx).
  crearRequerimientoCompra(borrador) {
    return request('/copiloto/requerimientos/compra', {
      method: 'POST',
      body: JSON.stringify({ areaOProceso: borrador.areaOProceso, items: borrador.items }),
    })
  },

  // Dispara una acción que quedó pendiente de confirmación. El `token` lo
  // emitió el servidor y este cliente solo lo devuelve: no codifica la acción,
  // así que no hay nada que se pueda alterar desde aquí para ejecutar otra
  // cosa (ver Backend/.../copiloto.confirmaciones.js).
  confirmarAccion(token) {
    return request('/copiloto/confirmar', { method: 'POST', body: JSON.stringify({ token }) })
  },
}
