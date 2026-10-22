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
export async function wpRequest(metodo, ruta, { query, body } = {}) {
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
