// Tasas de cambio y conversión de monedas.
//
// Proveedor: open.er-api.com (ExchangeRate-API, plan abierto). Se eligió por
// tres motivos concretos, no por ser el primero que apareció:
//  1. NO exige API key ni cuenta. Una funcionalidad que se cae el día que
//     alguien no renueva una key gratuita no es una funcionalidad.
//  2. Incluye COP. Frankfurter (la otra opción sin key, datos del BCE) NO
//     tiene peso colombiano, que es justo la moneda que se pregunta aquí.
//  3. Devuelve todas las tasas de una base en UNA petición, así que una sola
//     llamada cubre "dólar a peso", "euro a peso" y cualquier cruce.
//
// Lo que hay que saber al usar esto: las tasas son de referencia y se
// actualizan una vez al día. NO son la TRM oficial de la Superintendencia
// Financiera ni sirven para contabilizar — para eso está el área financiera.
// Eso se le dice al modelo en la descripción de la herramienta para que no lo
// presente como un dato oficial.

import { cacheHerramientas } from './copiloto.cache.js'

const TIMEOUT_MS = 6000
const BASE_URL = 'https://open.er-api.com/v6/latest'

// Las tasas se publican una vez al día: repreguntarlas en la misma
// conversación es una petición de red por un dato que no cambió. Se cachean
// aparte de `cacheHerramientas` con TTL propio y clave SIN usuario — a
// diferencia de los datos del ERP, una tasa de cambio es pública e idéntica
// para todos, así que compartir la entrada entre usuarios no filtra nada.
const TTL_TASAS_MS = 60 * 60 * 1000 // 1 hora

// Nombres que la gente dice, mapeados al código ISO 4217. Sin esto el modelo
// tendría que adivinar que "pesos" en este contexto es COP y no MXN o ARS.
const ALIAS_MONEDA = {
  peso: 'COP', pesos: 'COP', 'peso colombiano': 'COP', 'pesos colombianos': 'COP', cop: 'COP',
  dolar: 'USD', dolares: 'USD', 'dolar americano': 'USD', usd: 'USD', 'dolar estadounidense': 'USD',
  euro: 'EUR', euros: 'EUR', eur: 'EUR',
  libra: 'GBP', libras: 'GBP', 'libra esterlina': 'GBP', gbp: 'GBP',
  yen: 'JPY', yenes: 'JPY', jpy: 'JPY',
  'peso mexicano': 'MXN', 'pesos mexicanos': 'MXN', mxn: 'MXN',
  'peso argentino': 'ARS', 'pesos argentinos': 'ARS', ars: 'ARS',
  'peso chileno': 'CLP', 'pesos chilenos': 'CLP', clp: 'CLP',
  real: 'BRL', reales: 'BRL', brl: 'BRL',
  sol: 'PEN', soles: 'PEN', pen: 'PEN',
  bolivar: 'VES', bolivares: 'VES', ves: 'VES',
  'dolar canadiense': 'CAD', cad: 'CAD',
  franco: 'CHF', francos: 'CHF', chf: 'CHF',
  yuan: 'CNY', cny: 'CNY',
  bitcoin: 'BTC', btc: 'BTC',
}

const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Traduce lo que dijo el usuario a un código ISO de moneda.
 *
 * Devuelve `null` si no lo reconoce, en vez de asumir una moneda: convertir a
 * la divisa equivocada devuelve una cifra con toda la apariencia de ser
 * correcta, y nadie la va a verificar.
 */
export function resolverMoneda(entrada) {
  const texto = String(entrada || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .trim()
  if (!texto) return null
  if (ALIAS_MONEDA[texto]) return ALIAS_MONEDA[texto]
  // Código ISO que no está en la lista de alias (SEK, NOK, INR...): el
  // proveedor cubre ~160 monedas y la lista de arriba solo trae las que se
  // nombran en español. Si tiene forma de código, se deja pasar y que el
  // proveedor diga si existe.
  if (/^[a-z]{3}$/.test(texto)) return texto.toUpperCase()
  return null
}

// LANZA en vez de devolver `{error}`, al revés que el resto de este archivo, y
// es a propósito: `CacheLRU.through` borra la entrada cuando la promesa
// rechaza, pero cachearía tal cual un objeto de error durante la hora entera
// del TTL. Un corte de red de tres segundos dejaría la conversión rota el
// resto de la hora. Lanzando, el fallo no se cachea y el siguiente mensaje
// reintenta; `tasaCambio` lo convierte de vuelta en `{error}` para el modelo.
async function traerTasas(base) {
  const controlador = new AbortController()
  const timeout = setTimeout(() => controlador.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}/${encodeURIComponent(base)}`, { signal: controlador.signal })
    if (!res.ok) throw new Error('El servicio de tasas de cambio no respondió')
    const datos = await res.json()
    // El proveedor responde 200 con result:'error' cuando la moneda base no
    // existe, así que no basta con mirar el status HTTP.
    if (datos?.result !== 'success' || !datos?.rates) {
      throw new Error(`No reconozco la moneda "${base}"`)
    }
    return { rates: datos.rates, actualizado: datos.time_last_update_utc }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('El servicio de tasas tardó demasiado')
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

function tasasCacheadas(base) {
  return cacheHerramientas.through(`fx:${base}`, () => traerTasas(base), TTL_TASAS_MS)
}

/**
 * Cuánto vale 1 unidad de `de` en la moneda `a`.
 */
export async function tasaCambio(de, a) {
  const origen = resolverMoneda(de)
  const destino = resolverMoneda(a)
  if (!origen) return { error: `No reconozco la moneda "${de}"` }
  if (!destino) return { error: `No reconozco la moneda "${a}"` }
  if (origen === destino) return { origen, destino, tasa: 1, mensaje: 'Es la misma moneda' }

  let datos
  try {
    datos = await tasasCacheadas(origen)
  } catch (err) {
    return { error: err.message || 'No se pudo consultar la tasa de cambio' }
  }

  const tasa = datos.rates[destino]
  if (typeof tasa !== 'number') return { error: `No hay tasa disponible de ${origen} a ${destino}` }

  return {
    origen,
    destino,
    tasa,
    formateado: `1 ${origen} = ${formatearMoneda(tasa, destino)}`,
    actualizado: datos.actualizado,
    referencia: 'Tasa de referencia del mercado, no es la TRM oficial',
  }
}

/**
 * Convierte una cantidad concreta.
 */
export async function convertirMoneda(cantidad, de, a) {
  const monto = Number(cantidad)
  if (!Number.isFinite(monto)) return { error: 'La cantidad a convertir no es un número' }

  const tasa = await tasaCambio(de, a)
  if (tasa.error) return tasa

  const resultado = monto * tasa.tasa
  return {
    cantidad: monto,
    origen: tasa.origen,
    destino: tasa.destino,
    resultado,
    formateado: `${formatearMoneda(monto, tasa.origen)} = ${formatearMoneda(resultado, tasa.destino)}`,
    tasa: tasa.tasa,
    actualizado: tasa.actualizado,
    referencia: tasa.referencia,
  }
}

// Los pesos no se dicen con decimales ("$4.150" y no "$4.150,00"); el dólar y
// el euro sí. Redondear COP a la unidad no pierde información útil y hace que
// la cifra leída en voz alta sea comprensible.
const SIN_DECIMALES = new Set(['COP', 'CLP', 'JPY', 'VES', 'ARS'])

function formatearMoneda(valor, codigo) {
  const decimales = SIN_DECIMALES.has(codigo) ? 0 : 2
  const numero = valor.toLocaleString('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
  return `${numero} ${codigo}`
}
