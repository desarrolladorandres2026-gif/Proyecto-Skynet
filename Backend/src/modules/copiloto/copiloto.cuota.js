import { ErrorAplicacion } from '../../utils/errores.js'

// Marcapasos de la cuota de Gemini.
//
// ── El recurso que se está racionando ──────────────────────────────────────
// La capa gratuita de Gemini limita a 15 peticiones POR MINUTO y POR PROYECTO
// (quotaId GenerateRequestsPerMinutePerProjectPerModel-FreeTier, verificado
// contra la API real el 2026-08-23; al pasarse responde 429 con
// RetryInfo.retryDelay = 19s). No es una cuota por usuario: es el techo de TODO
// el Terminal a la vez.
//
// Y cada mensaje que usa una herramienta gasta DOS peticiones, no una: la
// vuelta en que el modelo pide la herramienta y la vuelta en que redacta con el
// resultado. Así que el techo real son ~7 mensajes por minuto entre todos los
// usuarios.
//
// ── Por qué esto es un problema de LATENCIA y no solo de errores ───────────
// Medido bajo carga: dentro de la cuota, el modelo responde entre 400 ms y
// 1,2 s de forma muy estable. Rozándola aparecen dos cosas distintas: 429
// inmediatos (rápidos, molestos pero honestos) y, de forma intermitente,
// peticiones que se sirven MUY despacio y terminan devolviendo 200 —se
// observaron vueltas de 8 s, 29 s y 31 s con apenas 20-40 tokens de salida, lo
// que descarta que fuera generación. Ese segundo caso es el que producía los
// "Request lento: POST /chat" de 7 a 30 segundos que terminaban en 200.
//
// La lentitud, entonces, no está en el código de Skynet (su parte son ~350 ms
// a 1 s por mensaje) sino en el servicio, y aparece cuando se empuja por encima
// del ritmo que la capa gratuita tolera. Este módulo evita empujar: lleva la
// cuenta de las peticiones del último minuto y decide ANTES de salir a la red.
// Si hay presupuesto, pasa sin costo medible. Si no, espera un poco (una
// ventana corta se libera sola) y, si ni así alcanza, responde en milisegundos
// con un mensaje que el usuario entiende, en vez de dejarlo esperando medio
// minuto por una respuesta que va a llegar mal o tarde.
//
// No es un rate limiter de seguridad (ese es copilotoLimiter, por IP, con un
// tope de 12/min que además queda por debajo de este presupuesto): es un
// regulador de un recurso externo escaso y compartido por todo el sistema.

// El techo real de la capa gratuita. Se deja configurable porque el día que se
// active facturación en el proyecto de Google este número sube muchísimo (y con
// él desaparece la espera): basta cambiar la variable, sin tocar código.
const LIMITE_POR_MINUTO = Number(process.env.GEMINI_RPM) || 15

// Margen de seguridad: se reserva una petición del presupuesto. Las ventanas de
// Google y la nuestra no arrancan en el mismo instante, así que apuntar al
// límite exacto garantiza rozarlo.
const PRESUPUESTO = Math.max(1, LIMITE_POR_MINUTO - 1)

const VENTANA_MS = 60_000

// Cuánto se acepta esperar a que se libere un turno. Es corto A PROPÓSITO: el
// objetivo de todo este trabajo es que el chat se sienta inmediato, así que
// esperar más de un segundo y pico ya es peor que decir la verdad. Cuando la
// ventana está realmente saturada, la espera que haría falta son los 19 s que
// pide Google — y eso no se le hace a un usuario en silencio.
const ESPERA_MAXIMA_MS = 1200

// Marcas de tiempo de las peticiones del último minuto. Un array simple basta:
// nunca tiene más de LIMITE_POR_MINUTO elementos.
let marcas = []

function purgar(ahora) {
  const corte = ahora - VENTANA_MS
  // Están en orden creciente, así que basta con recortar por el frente.
  let i = 0
  while (i < marcas.length && marcas[i] <= corte) i++
  if (i > 0) marcas = marcas.slice(i)
}

/**
 * Reserva un turno para UNA petición al modelo.
 *
 * @param {AbortSignal} [signal] Para no seguir esperando si el usuario ya cerró
 *        el chat: sin esto, una petición cancelada seguiría ocupando su turno.
 * @throws {ErrorAplicacion} 429 con mensaje presentable si no hay presupuesto.
 */
export async function reservarTurno(signal) {
  const ahora = Date.now()
  purgar(ahora)

  if (marcas.length < PRESUPUESTO) {
    marcas.push(ahora)
    return { espera: 0 }
  }

  // La más vieja de la ventana es la que libera el siguiente turno.
  const esperaMs = marcas[0] + VENTANA_MS - ahora

  if (esperaMs > ESPERA_MAXIMA_MS) {
    throw new ErrorAplicacion(
      'Estoy atendiendo muchas preguntas ahora mismo y me quedé sin turno. ' +
        `Vuelve a preguntarme en ${Math.ceil(esperaMs / 1000)} segundos.`,
      429
    )
  }

  await new Promise((resolver, rechazar) => {
    const temporizador = setTimeout(() => {
      signal?.removeEventListener('abort', alAbortar)
      resolver()
    }, esperaMs)
    function alAbortar() {
      clearTimeout(temporizador)
      rechazar(Object.assign(new Error('cancelado'), { name: 'AbortError' }))
    }
    signal?.addEventListener('abort', alAbortar, { once: true })
  })

  const despues = Date.now()
  purgar(despues)
  marcas.push(despues)
  return { espera: esperaMs }
}

/**
 * Registra que Google respondió 429 aunque nosotros creíamos tener turno.
 *
 * Pasa cuando otra instancia del proceso (o un script) consume del mismo
 * proyecto: nuestra cuenta es local y la de Google es global. Se satura la
 * ventana a propósito para que los siguientes mensajes fallen rápido y con
 * mensaje claro, en vez de repetir el mismo choque contra la API.
 */
export function registrarRechazoExterno() {
  const ahora = Date.now()
  purgar(ahora)
  while (marcas.length < PRESUPUESTO) marcas.push(ahora)
}

/** Estado del presupuesto. Lo usan las métricas y las pruebas. */
export function estadoCuota() {
  purgar(Date.now())
  return { usadas: marcas.length, presupuesto: PRESUPUESTO, limitePorMinuto: LIMITE_POR_MINUTO }
}

/** Solo para las pruebas: deja la ventana como recién arrancada. */
export function reiniciarCuota() {
  marcas = []
}
