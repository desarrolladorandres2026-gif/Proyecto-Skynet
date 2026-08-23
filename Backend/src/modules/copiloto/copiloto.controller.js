import * as service from './copiloto.service.js'
import * as requerimientosService from '../requerimientos/requerimientos.service.js'

// Server-Sent Events en vez de un JSON al final: el usuario ve la respuesta
// escribiéndose desde el primer token (~1.1 s) en lugar de mirar un "Pensando…"
// hasta que esté completa. No se usa la clase EventSource del navegador porque
// solo hace GET; el frontend lee el cuerpo del POST como stream (ver
// api/copiloto.js).
export async function chat(req, res) {
  const { mensaje, conversacionId } = req.body

  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Evita que un proxy inverso (nginx) acumule la respuesta en un búfer y
    // anule justo el efecto de streaming que buscamos.
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  // Si el usuario cierra el chat, navega a otra pantalla o pregunta otra cosa
  // encima, el navegador corta la conexión pero el servidor seguía leyendo el
  // stream de Gemini hasta el final y escribiendo en un socket muerto. Con
  // esto se corta la lectura y se libera el proceso.
  //
  // Lo que NO hace, para no venderlo de más: la generación sigue corriendo del
  // lado de Google y la cuota se consume igual (es una limitación explícita
  // del SDK, documentada en copiloto.service.js). El ahorro es de recursos
  // locales y de tiempo de proceso, no de cuota.
  const controlador = new AbortController()
  let terminado = false
  // 'close' también salta en el cierre normal, después de res.end(): sin la
  // bandera, cada respuesta exitosa terminaría llamando abort() sobre un
  // stream ya consumido.
  res.on('close', () => {
    if (!terminado) controlador.abort()
  })

  const enviar = (evento) => res.write(`data: ${JSON.stringify(evento)}\n\n`)

  // Latido de la conexión. index.js pone `server.timeout = 30_000`, que es un
  // timeout de INACTIVIDAD del socket: si una vuelta del modelo o una
  // herramienta lenta (una búsqueda web, un lote de correos) pasa medio minuto
  // sin escribir nada, Node mata la conexión y el usuario ve el chat cortado
  // sin explicación. Un comentario SSE cada 10 s mantiene el socket vivo y, de
  // paso, obliga a cualquier proxy intermedio a soltar lo que tenga en búfer.
  //
  // Es un COMENTARIO del protocolo (línea que empieza por ':'), no un evento:
  // el lector del frontend busca líneas 'data: ' y descarta el bloque entero
  // si no la encuentra (ver api/copiloto.js), así que no puede confundirse con
  // una respuesta ni llegar nunca a la conversación.
  const latido = setInterval(() => {
    if (!res.writableEnded) res.write(': keepalive\n\n')
  }, 10_000)
  // unref: un temporizador de 10 s no debe impedir que el proceso termine.
  latido.unref?.()

  try {
    const entrada = { mensaje, conversacionId, signal: controlador.signal, ip: req.ip }
    for await (const evento of service.responderStream(entrada, req.usuario)) {
      enviar(evento)
    }
  } catch (err) {
    // Las cabeceras ya salieron, así que no se puede responder con un status
    // HTTP de error: el fallo viaja como un evento más del stream y el
    // frontend lo pinta en el banner de error del chat.
    enviar({ tipo: 'error', error: err.status < 500 ? err.message : 'Error interno del servidor' })
  } finally {
    clearInterval(latido)
    terminado = true
    res.end()
  }
}

// El único punto por el que un requerimiento sugerido por el copiloto puede
// llegar a guardarse. Nunca lo invoca el modelo: lo llama el botón "Confirmar
// y enviar" que el frontend dibuja a partir del evento {tipo:'accion'} del
// chat (ver responderStream). Reutiliza crearRequerimiento tal cual —MISMA
// validación, MISMA notificación a Financiero, MISMO registro de auditoría—
// que si el usuario hubiera llenado el formulario a mano; lo único que
// cambia es de dónde vinieron los datos.
export async function confirmarRequerimientoCompra(req, res) {
  const { areaOProceso, items } = req.body
  const requerimiento = await requerimientosService.crearRequerimiento(
    { tipo: 'compra', areaOProceso, itemsCompra: items },
    req.usuario
  )
  res.status(201).json({ requerimiento })
}

// Ejecuta una acción marcada como `requiereConfirmacion` que el usuario acaba
// de aprobar pulsando un botón. Igual que el endpoint de arriba, NO pasa por
// Gemini: el modelo propuso la acción, pero quien la dispara es esta petición,
// nacida de un clic real (ver copiloto.confirmaciones.js).
export async function confirmarAccion(req, res) {
  const { token } = req.body
  const resultado = await service.ejecutarConfirmada(token, req.usuario, { ip: req.ip })
  res.json(resultado)
}
