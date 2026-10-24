import { env } from '../../config/env.js'
import { ErrorAplicacion } from '../../utils/errores.js'

// Errores propios de este módulo: sus mensajes son seguros para mostrar al
// usuario aunque sean 5xx (ver `expose` en middleware/errorHandler.js).
function errorWp(mensaje, status) {
  const err = new ErrorAplicacion(mensaje, status)
  err.expose = true
  return err
}

// Cliente mínimo de la API REST de WordPress del sitio público
// (elterminalneiva.com). Autentica con una "contraseña de aplicación" por
// Basic Auth: es revocable desde WordPress y no sirve para iniciar sesión,
// a diferencia de la clave del usuario.
//
// Los fallos de WordPress se traducen a 502 con un mensaje propio: el
// `message` crudo de WP puede traer rutas internas del servidor y no es algo
// que deba llegarle tal cual a un usuario de Skynet.

const TIMEOUT_MS = 20_000

export function wpConfigurado() {
  return Boolean(env.WP_URL && env.WP_USER && env.WP_APP_PASSWORD)
}

function cabeceraAuth() {
  const credencial = Buffer.from(`${env.WP_USER}:${env.WP_APP_PASSWORD}`).toString('base64')
  return `Basic ${credencial}`
}

function construirUrl(ruta, query) {
  const url = new URL(`/wp-json${ruta}`, env.WP_URL)
  for (const [clave, valor] of Object.entries(query || {})) {
    if (valor !== undefined && valor !== null && valor !== '') url.searchParams.set(clave, String(valor))
  }
  return url
}

// Devuelve { data, total, totalPaginas }; los dos últimos salen de las
// cabeceras X-WP-Total / X-WP-TotalPages (solo existen en los listados).
async function pedir(metodo, ruta, { query, body } = {}) {
  if (!wpConfigurado()) {
    throw errorWp('La conexión con el sitio web no está configurada en el servidor', 503)
  }

  let respuesta
  try {
    respuesta = await fetch(construirUrl(ruta, query), {
      method: metodo,
      headers: {
        Authorization: cabeceraAuth(),
        Accept: 'application/json',
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    const agotado = err.name === 'TimeoutError' || err.name === 'AbortError'
    throw errorWp(
      agotado ? 'El sitio web tardó demasiado en responder' : 'No se pudo conectar con el sitio web',
      504,
    )
  }

  const texto = await respuesta.text()
  let data = null
  try {
    data = texto ? JSON.parse(texto) : null
  } catch {
    data = null
  }

  if (!respuesta.ok) {
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw errorWp('El sitio web rechazó las credenciales de Skynet. Revisa la contraseña de aplicación', 502)
    }
    if (respuesta.status === 404) {
      throw errorWp('El contenido ya no existe en el sitio web', 404)
    }
    throw errorWp(`El sitio web respondió con un error (${respuesta.status})`, 502)
  }

  return {
    data,
    total: Number(respuesta.headers.get('x-wp-total')) || 0,
    totalPaginas: Number(respuesta.headers.get('x-wp-totalpages')) || 0,
  }
}

// Caché de lecturas. Cada petición a WordPress cuesta ~0,6 s (1-3 s si el
// sitio estaba frío) y una pantalla como el Resumen hace ~10 seguidas; sin
// caché cada visita de cada persona las repetía todas. Dura poco (20 s) para
// que lo publicado directo en WordPress aparezca casi enseguida, y cualquier
// escritura hecha desde Skynet la vacía entera para que nadie vea datos
// viejos tras guardar. En pruebas está apagada: los tests simulan WordPress
// con un fetch falso y comparten URLs.
let ttlLecturaMs = env.NODE_ENV === 'test' ? 0 : 20_000
const MAX_ENTRADAS = 200
const lecturas = new Map()
const enVuelo = new Map()
// Una lectura que empezó antes de una escritura no debe guardarse después de
// ella: traería el dato anterior al cambio.
let generacion = 0

// Solo para pruebas del propio caché.
export function fijarTtlCacheWp(ms) {
  ttlLecturaMs = ms
  limpiarCacheWp()
}

export function limpiarCacheWp() {
  generacion += 1
  lecturas.clear()
  enVuelo.clear()
}

export async function wpRequest(metodo, ruta, opciones = {}) {
  if (metodo !== 'GET') {
    limpiarCacheWp()
    try {
      return await pedir(metodo, ruta, opciones)
    } finally {
      limpiarCacheWp()
    }
  }
  if (!ttlLecturaMs || !wpConfigurado()) return pedir(metodo, ruta, opciones)

  const clave = construirUrl(ruta, opciones.query).href
  const guardada = lecturas.get(clave)
  if (guardada && guardada.expira > Date.now()) return structuredClone(guardada.valor)
  if (enVuelo.has(clave)) return structuredClone(await enVuelo.get(clave))

  const nacida = generacion
  const promesa = pedir(metodo, ruta, opciones)
    .then((valor) => {
      if (nacida === generacion) {
        if (lecturas.size >= MAX_ENTRADAS) lecturas.delete(lecturas.keys().next().value)
        lecturas.set(clave, { valor, expira: Date.now() + ttlLecturaMs })
      }
      return valor
    })
    .finally(() => {
      if (enVuelo.get(clave) === promesa) enVuelo.delete(clave)
    })
  enVuelo.set(clave, promesa)
  return structuredClone(await promesa)
}
