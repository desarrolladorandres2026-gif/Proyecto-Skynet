// Instrumentación ligera para detectar endpoints lentos en producción, sin
// depender de infraestructura externa (APM, logs centralizados) que este
// proyecto no tiene. Registra SOLO metadata de la petición (método, ruta,
// status, duración, requestId) — nunca headers, cookies, body ni query, así
// que no hay riesgo de loguear contraseñas/tokens/datos personales.
const UMBRAL_LENTO_MS = Number(process.env.UMBRAL_REQUEST_LENTO_MS) || 500

export function monitorLentos(req, res, next) {
  const inicio = process.hrtime.bigint()

  res.on('finish', () => {
    const duracionMs = Number(process.hrtime.bigint() - inicio) / 1_000_000
    if (duracionMs < UMBRAL_LENTO_MS) return

    console.warn(
      `🐢  Request lento: ${req.method} ${req.path} -> ${res.statusCode} en ${duracionMs.toFixed(0)}ms ` +
        `(requestId=${req.id || '-'})`
    )
  })

  next()
}
