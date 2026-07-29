import { env } from '../config/env.js'
import { duracionAMs } from './duration.js'

export const COOKIE_NAME = 'skynet_token'

// httpOnly: JavaScript del frontend NUNCA puede leer esta cookie -> un XSS ya
// no puede robar el token (a diferencia de guardarlo en localStorage).
// sameSite:'strict': el navegador no envía la cookie en peticiones originadas
// desde otro sitio -> mitiga CSRF además de robo de token cross-site.
// secure: true exige HTTPS. En NODE_ENV=development se desactiva para poder
// probar en http://localhost; en producción DEBE servirse por HTTPS o la
// cookie no se guardará nunca (fallo silencioso y visible: el login "no persiste").
function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  }
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: duracionAMs(env.JWT_EXPIRES_IN),
  })
}

export function clearAuthCookie(res) {
  // Las opciones deben coincidir con las usadas al crearla (salvo maxAge) para
  // que el navegador la identifique como la misma cookie y la borre.
  res.clearCookie(COOKIE_NAME, cookieOptions())
}
