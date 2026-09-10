import { ErrorAplicacion } from '../../utils/errores.js'

// Marcapasos de cuota para el modelo de voz de Gemini (gemini-2.5-flash-preview-tts).
//
// Mismo problema, mismo remedio que copiloto/copiloto.cuota.js (llevar la
// cuenta ANTES de salir a la red, en vez de dejar que Google devuelva el
// 429), pero un presupuesto DISTINTO y separado: verificado contra la API
// real, este modelo de voz tiene su propia cuota gratuita de solo 3
// peticiones por minuto por proyecto — mucho más estrecha que las ~15/min
// del modelo de chat que usa el copiloto, y es un quotaId de Google
// aparte (...generate_content_free_tier_requests, model:
// gemini-2.5-flash-tts), así que no compite por presupuesto con el chat.
//
// A diferencia del copiloto (una respuesta perdida es una mala experiencia
// pero no rompe nada), acá el llamador SIEMPRE debe poder seguir sin voz
// generada: transmitir un aviso nunca debe fallar solo porque se acabó la
// cuota de este modelo — ver crearYTransmitirAviso() en avisos.service.js,
// que atrapa el 429 de este módulo y sigue sin audio institucional (cada
// dispositivo cae a su propia voz local).
const LIMITE_POR_MINUTO = Number(process.env.GEMINI_TTS_RPM) || 3
const PRESUPUESTO = Math.max(1, LIMITE_POR_MINUTO - 1)
const VENTANA_MS = 60_000

let marcas = []

function purgar(ahora) {
  const corte = ahora - VENTANA_MS
  let i = 0
  while (i < marcas.length && marcas[i] <= corte) i++
  if (i > 0) marcas = marcas.slice(i)
}

/**
 * Reserva un turno para UNA petición de síntesis de voz.
 * @throws {ErrorAplicacion} 429 con mensaje presentable si no hay presupuesto.
 */
export function reservarTurnoTts() {
  const ahora = Date.now()
  purgar(ahora)

  if (marcas.length < PRESUPUESTO) {
    marcas.push(ahora)
    return
  }

  const esperaMs = marcas[0] + VENTANA_MS - ahora
  throw new ErrorAplicacion(
    `Se alcanzó el límite de generación de voz institucional por ahora. Vuelve a intentar en ${Math.ceil(esperaMs / 1000)} segundos.`,
    429
  )
}

/** Igual que copiloto.cuota.js#registrarRechazoExterno: Google respondió 429
 * aunque creíamos tener turno (otra instancia del proceso consumió del mismo
 * proyecto) — se satura la ventana para que el siguiente intento falle
 * rápido con mensaje claro en vez de repetir el mismo choque. */
export function registrarRechazoExternoTts() {
  const ahora = Date.now()
  purgar(ahora)
  while (marcas.length < PRESUPUESTO) marcas.push(ahora)
}
