import { ErrorAplicacion } from '../../utils/errores.js'

// Marcapasos de cuota para el modelo de voz de Gemini (gemini-2.5-flash-preview-tts).
//
// Mismo problema, mismo remedio que copiloto/copiloto.cuota.js (llevar la
// cuenta ANTES de salir a la red, en vez de dejar que Google devuelva el
// 429), pero presupuestos DISTINTOS y separados del modelo de chat: es un
// quotaId de Google aparte (generativelanguage.googleapis.com/
// generate_content_free_tier_requests, model: gemini-2.5-flash-tts), así que
// no compite por presupuesto con el copiloto.
//
// Verificado contra la API real, la capa gratuita de este modelo tiene DOS
// techos independientes — cualquiera de los dos que se alcance primero
// bloquea, aunque el otro tenga margen:
//   - GenerateRequestsPerMinutePerProjectPerModel-FreeTier: 3 por minuto
//   - GenerateRequestsPerDayPerProjectPerModel-FreeTier: 10 por DÍA
// El diario es el que de verdad importa en la práctica: 10 generaciones para
// TODO el Terminal en 24h se agotan fácil solo probando 3-4 voces antes de
// transmitir. Por eso, además de espaciar peticiones (como el de por
// minuto), este módulo RECUERDA cuándo se agotó el diario para fallar rápido
// y con mensaje claro sin volver a golpear la API — Google no devuelve
// cuándo exactamente resetea (es medianoche Pacífico, no una ventana móvil
// como la de por minuto), así que se aproxima bloqueando 24h desde el último
// 429 diario real; es mejor una espera un poco de más que seguir gastando
// peticiones contra una cuota que ya se sabe en cero.
//
// A diferencia del copiloto (una respuesta perdida es una mala experiencia
// pero no rompe nada), acá el llamador SIEMPRE debe poder seguir sin voz
// generada: transmitir un aviso nunca debe fallar solo porque se acabó
// cualquiera de las dos cuotas — ver crearYTransmitirAviso() en
// avisos.service.js, que atrapa el error de este módulo y sigue sin audio
// institucional (cada dispositivo cae a su propia voz local).
const LIMITE_POR_MINUTO = Number(process.env.GEMINI_TTS_RPM) || 3
const PRESUPUESTO_MINUTO = Math.max(1, LIMITE_POR_MINUTO - 1)
const VENTANA_MINUTO_MS = 60_000

const LIMITE_POR_DIA = Number(process.env.GEMINI_TTS_RPD) || 10
// Aproximación de 24h en vez de calcular la medianoche Pacífico exacta: ver
// comentario arriba — la precisión no vale la complejidad de manejar zonas
// horarias solo para esto.
const VENTANA_DIA_MS = 24 * 60 * 60 * 1000

let marcasMinuto = []
let agotadoDiarioHasta = 0 // timestamp ms; 0 = no agotado

function purgarMinuto(ahora) {
  const corte = ahora - VENTANA_MINUTO_MS
  let i = 0
  while (i < marcasMinuto.length && marcasMinuto[i] <= corte) i++
  if (i > 0) marcasMinuto = marcasMinuto.slice(i)
}

/**
 * Reserva un turno para UNA petición de síntesis de voz (valida ambas
 * cuotas: la del minuto y la del día).
 * @throws {ErrorAplicacion} 429 con mensaje presentable si no hay presupuesto.
 */
export function reservarTurnoTts() {
  const ahora = Date.now()

  if (ahora < agotadoDiarioHasta) {
    const horas = Math.ceil((agotadoDiarioHasta - ahora) / (60 * 60 * 1000))
    throw new ErrorAplicacion(
      `Se alcanzó el límite gratuito diario de generación de voz institucional (${LIMITE_POR_DIA} al día para todo el Terminal). ` +
        `Vuelve a intentarlo en unas ${horas} hora(s), o transmite igual: cada dispositivo leerá el aviso con su propia voz.`,
      429
    )
  }

  purgarMinuto(ahora)
  if (marcasMinuto.length >= PRESUPUESTO_MINUTO) {
    const esperaMs = marcasMinuto[0] + VENTANA_MINUTO_MS - ahora
    throw new ErrorAplicacion(
      `Se alcanzó el límite de generación de voz institucional por ahora. Vuelve a intentar en ${Math.ceil(esperaMs / 1000)} segundos.`,
      429
    )
  }

  marcasMinuto.push(ahora)
}

/** Google respondió 429 de la cuota POR MINUTO aunque creíamos tener turno
 * (otra instancia del proceso consumió del mismo proyecto) — se satura la
 * ventana para que el siguiente intento falle rápido con mensaje claro en
 * vez de repetir el mismo choque. */
export function registrarRechazoExternoTts() {
  const ahora = Date.now()
  purgarMinuto(ahora)
  while (marcasMinuto.length < PRESUPUESTO_MINUTO) marcasMinuto.push(ahora)
}

/** Google respondió 429 de la cuota POR DÍA — se recuerda para que ninguna
 * llamada más (ni "probar voz" ni una transmisión real) vuelva a intentarlo
 * contra la API hasta que se estime liberado el cupo. */
export function registrarAgotamientoDiarioTts() {
  agotadoDiarioHasta = Date.now() + VENTANA_DIA_MS
}

/** Solo para las pruebas: deja el estado como recién arrancado. */
export function reiniciarCuotaTts() {
  marcasMinuto = []
  agotadoDiarioHasta = 0
}
