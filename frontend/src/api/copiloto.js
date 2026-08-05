const BASE = import.meta.env.VITE_API_URL || '/api'

// A diferencia del resto de la API (api/client.js devuelve el JSON completo),
// el chat se consume como stream para que la respuesta aparezca escribiéndose.
// No se usa EventSource porque solo soporta GET y aquí hace falta POST con
// cuerpo; se lee el body del fetch trozo a trozo.
//
// `historial` son los turnos previos ({rol:'user'|'model', texto}) tal cual los
// devolvió la última respuesta — el backend es la fuente de verdad del
// historial (lo recorta y le agrega el turno nuevo), este cliente no lo
// reconstruye ni lo persiste.
//
// `onDelta(textoParcial)` se llama con cada trozo que llega. Resuelve con el
// historial final que devuelve el backend.
export const copiloto = {
  async chat(mensaje, historial, { onDelta, signal } = {}) {
    const res = await fetch(`${BASE}/copiloto/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje, historial }),
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
    let historialFinal = null

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
        else if (evento.tipo === 'fin') historialFinal = evento.historial
        else if (evento.tipo === 'error') throw new Error(evento.error)
      }
    }

    return { historial: historialFinal ?? historial ?? [] }
  },
}
