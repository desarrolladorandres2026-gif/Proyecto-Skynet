import * as service from './copiloto.service.js'

// Server-Sent Events en vez de un JSON al final: el usuario ve la respuesta
// escribiéndose desde el primer token (~1.1 s) en lugar de mirar un "Pensando…"
// hasta que esté completa. No se usa la clase EventSource del navegador porque
// solo hace GET; el frontend lee el cuerpo del POST como stream (ver
// api/copiloto.js).
export async function chat(req, res) {
  const { mensaje, historial } = req.body

  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Evita que un proxy inverso (nginx) acumule la respuesta en un búfer y
    // anule justo el efecto de streaming que buscamos.
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  const enviar = (evento) => res.write(`data: ${JSON.stringify(evento)}\n\n`)

  try {
    for await (const evento of service.responderStream({ mensaje, historial }, req.usuario)) {
      enviar(evento)
    }
  } catch (err) {
    // Las cabeceras ya salieron, así que no se puede responder con un status
    // HTTP de error: el fallo viaja como un evento más del stream y el
    // frontend lo pinta en el banner de error del chat.
    enviar({ tipo: 'error', error: err.status < 500 ? err.message : 'Error interno del servidor' })
  } finally {
    res.end()
  }
}
