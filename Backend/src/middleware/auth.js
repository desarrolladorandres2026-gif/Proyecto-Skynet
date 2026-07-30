import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import Usuario from '../models/Usuario.js'
import { COOKIE_NAME, clearAuthCookie } from '../utils/cookies.js'

// No se apoya en asyncHandler/safeRouter: este middleware se monta con
// router.use() en varios módulos (usuarios, mantenimiento), y
// safeRouter solo envuelve router.get/post/put/patch/delete, NO router.use().
// Como ahora hace una consulta async a la BD, captura sus propios errores y
// los pasa a next(err) explícitamente; si no, un fallo de Mongo aquí dejaría
// la petición colgada sin respuesta hasta el timeout del cliente.
export async function verificarToken(req, res, next) {
  try {
    // El token viaja en una cookie httpOnly (no accesible desde JS del
    // frontend, lo que neutraliza el robo de sesión vía XSS). Se mantiene el
    // soporte de "Authorization: Bearer" como fallback para clientes
    // no-browser (scripts, Postman) que no puedan usar cookies.
    const authHeader = req.headers.authorization
    const token = req.cookies?.[COOKIE_NAME] || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null)

    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' })
    }

    let payload
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] })
    } catch (err) {
      clearAuthCookie(res)
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expirado' })
      }
      return res.status(401).json({ error: 'Token inválido' })
    }

    // Se revalida CADA petición contra la BD en vez de confiar ciegamente en
    // lo que dice el JWT. Esto es más costoso (una consulta extra por
    // request, ahora con populate de rol+permisos) pero es lo único que
    // garantiza que:
    //  - un usuario eliminado o desactivado pierde el acceso al instante,
    //  - un cambio de rol/permisos/módulos por un admin aplica de inmediato,
    //  - un token robado deja de servir en cuanto se detecta y se resetea la
    //    contraseña (tokenVersion), sin esperar a que expire (hasta 8h).
    const usuario = await Usuario.findById(payload.id_usuario)
      .select('nombre_usuario rol modulos estado tokenVersion empresa')
      .populate({ path: 'rol', populate: { path: 'permisos', select: 'codigo' } })

    if (
      !usuario ||
      usuario.estado === 'inactivo' ||
      usuario.tokenVersion !== payload.tokenVersion ||
      !usuario.rol
    ) {
      clearAuthCookie(res)
      return res.status(401).json({ error: 'Sesión inválida' })
    }

    req.usuario = {
      id_usuario: usuario._id,
      nombre_usuario: usuario.nombre_usuario,
      rol: {
        id: usuario.rol._id,
        nombre: usuario.rol.nombre,
        slug: usuario.rol.slug,
        ambito: usuario.rol.ambito,
      },
      esSuperAdmin: usuario.rol.esSuperAdmin === true,
      permisos: new Set(usuario.rol.permisos.map((p) => p.codigo)),
      modulos: usuario.modulos, // legado: gobierna solo mantenimiento
      empresaId: usuario.empresa || null,
    }
    next()
  } catch (err) {
    next(err)
  }
}

// Se conserva tal cual para no tocar mantenimiento/usuarios: ahora se
// apoya en esSuperAdmin (bypass de Rol) en vez del viejo rol==='admin'
// string, con el mismo efecto para las rutas que ya lo usan.
export function soloAdmin(req, res, next) {
  if (!req.usuario?.esSuperAdmin) {
    return res.status(403).json({ error: 'Acceso restringido a administradores' })
  }
  next()
}

export function requireModulo(modulo) {
  return (req, res, next) => {
    if (req.usuario?.esSuperAdmin) return next()
    if (!req.usuario?.modulos?.includes(modulo)) {
      return res.status(403).json({ error: `No tienes acceso al módulo ${modulo}` })
    }
    next()
  }
}
