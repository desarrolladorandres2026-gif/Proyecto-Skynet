import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import Usuario from '../models/Usuario.js'
import Rol from '../models/Rol.js'
import Permiso from '../models/Permiso.js'
import { COOKIE_NAME, clearAuthCookie } from '../utils/cookies.js'

// Los nombres reales de colección se leen de los modelos y NO se escriben a
// mano ('rols', 'permisos'): un $lookup con el nombre equivocado no falla, solo
// devuelve un array vacío — y aquí eso significaría dejar sin permisos a todo
// el mundo de forma silenciosa. Que lo derive Mongoose lo hace imposible.
const COLECCION_ROLES = Rol.collection.name
const COLECCION_PERMISOS = Permiso.collection.name

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
    //
    // ── Por qué una agregación y no findById().populate().populate() ────────
    // Mongoose resuelve cada nivel de `populate` con una consulta APARTE y
    // SECUENCIAL: usuario → rol → permisos son tres viajes de ida y vuelta.
    // Contra Atlas cada viaje cuesta ~95 ms medidos, así que la autenticación
    // sola gastaba 190-450 ms de CADA petición del sistema (no solo del chat).
    // Un `$lookup` en la misma agregación trae lo mismo en UN viaje: ~95 ms.
    //
    // Lo que NO cambia, y es lo importante: se sigue leyendo de la base en cada
    // petición, sin caché. Las tres garantías que documenta el comentario de
    // arriba —usuario desactivado, cambio de rol/permisos, token revocado—
    // siguen aplicando al instante, porque la lectura es igual de fresca. Lo
    // único que se elimina son dos vueltas de red redundantes.
    if (!mongoose.isValidObjectId(payload.id_usuario)) {
      clearAuthCookie(res)
      return res.status(401).json({ error: 'Sesión inválida' })
    }

    const [usuario] = await Usuario.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(String(payload.id_usuario)) } },
      {
        $lookup: {
          from: COLECCION_ROLES,
          let: { rolId: '$rol' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$rolId'] } } },
            {
              $lookup: {
                from: COLECCION_PERMISOS,
                localField: 'permisos',
                foreignField: '_id',
                as: 'permisos',
                pipeline: [{ $project: { _id: 0, codigo: 1 } }],
              },
            },
            { $project: { nombre: 1, slug: 1, ambito: 1, esSuperAdmin: 1, permisos: 1 } },
          ],
          as: 'rol',
        },
      },
      { $unwind: { path: '$rol', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          nombre_usuario: 1,
          rol: 1,
          modulos: 1,
          estado: 1,
          tokenVersion: 1,
          empresa: 1,
          sesionesActivas: 1,
        },
      },
    ])

    if (
      !usuario ||
      usuario.estado === 'inactivo' ||
      usuario.tokenVersion !== payload.tokenVersion ||
      !usuario.rol
    ) {
      clearAuthCookie(res)
      return res.status(401).json({ error: 'Sesión inválida' })
    }

    // Revocación por sesión individual (logout de un solo dispositivo, ver
    // auth.controller.js#logout). Un token sin `jti` es de un formato anterior
    // a este cambio: sigue gobernado solo por tokenVersion (arriba) hasta que
    // expire de forma natural, para no forzar un cierre de sesión masivo de
    // golpe el día que esto se despliegue — en unas horas (JWT_EXPIRES_IN) ya
    // no quedará ninguno.
    if (payload.jti) {
      const ahora = new Date()
      const sesionVigente = (usuario.sesionesActivas || []).some(
        (s) => s.jti === payload.jti && s.expiraEn > ahora
      )
      if (!sesionVigente) {
        clearAuthCookie(res)
        return res.status(401).json({ error: 'Sesión inválida' })
      }
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
