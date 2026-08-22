import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import Usuario from '../models/Usuario.js'
import { COOKIE_NAME } from '../utils/cookies.js'
import { estadoEfectivo } from '../modules/plataforma/plataforma.service.js'
import { aEstadoPublico } from '../modules/plataforma/plataforma.dto.js'

// ── El backend ES la autoridad del mantenimiento ────────────────────────────
// Este middleware se monta a nivel de app, ANTES de /storage y de /api (ver
// index.js). No hay forma de esquivarlo tocando el frontend: la pantalla de
// mantenimiento del navegador es cortesía visual, esto es el candado.
//
// Se eligió bloquear aquí en vez de invalidar los JWT (incrementar
// tokenVersion de todos los usuarios) por tres motivos:
//
//   1. Es REVERSIBLE. Al terminar la ventana, las sesiones que estaban
//      abiertas siguen sirviendo y la gente vuelve a trabajar sin reloguearse
//      — que es justamente la "recuperación automática" pedida. Un bump
//      masivo de tokenVersion obligaría a todo el Terminal a autenticarse de
//      nuevo por una ventana de 5 minutos.
//   2. No toca el sistema de autenticación. tokenVersion tiene hoy un
//      significado preciso ("esta contraseña/rol cambió, la sesión vieja ya no
//      vale"); reutilizarlo para "estamos en mantenimiento" mezcla dos
//      conceptos que se van a pisar el día que ambos ocurran juntos.
//   3. Una escritura sobre TODOS los usuarios es una operación destructiva sin
//      vuelta atrás; este gate es un booleano en un documento.
//
// El efecto observable es el mismo: con el mantenimiento activo, una sesión
// existente no puede leer ni escribir absolutamente nada.

// Rutas que SIGUEN vivas durante el mantenimiento, para todo el mundo.
// Cada una está aquí por una razón concreta, no por comodidad:
const SIEMPRE_PERMITIDAS = new Set([
  // Sonda de salud: nginx/PM2/uptime monitors deben poder distinguir "en
  // mantenimiento" de "el servidor se cayó". Si esto devolviera 503, un
  // mantenimiento planificado dispararía las alarmas de caída.
  '/health',
  // El propio estado de la plataforma: es lo que consulta la pantalla de
  // mantenimiento y el login para saber qué pintar. Bloquearlo dejaría al
  // frontend sin forma de enterarse de que puede volver.
  '/api/plataforma/estado',
  // Cerrar sesión debe funcionar siempre (igual que hoy no tiene ni auth ni
  // rate limit): solo borra la cookie del navegador.
  '/api/auth/logout',
  // Identidad del solicitante. El frontend la necesita para decidir si
  // mostrar la pantalla de mantenimiento o el panel de administración, y
  // devuelve únicamente el perfil de quien ya tiene sesión.
  '/api/auth/me',
  // Se deja pasar el INTENTO de login a propósito: el gate real vive dentro
  // del controlador, DESPUÉS de validar credenciales (ver auth.controller.js).
  // Si se bloqueara aquí, un administrador cuya cookie expiró durante la
  // ventana no podría entrar a finalizar el mantenimiento — quedaría
  // encerrado fuera de su propia plataforma.
  '/api/auth/login',
])

// Prefijos permitidos: todos los endpoints administrativos del propio módulo.
// Van protegidos por verificarToken + requierePermiso('plataforma:gestionar'),
// así que abrirlos aquí no expone nada: solo permite que quien puede
// administrar el mantenimiento pueda finalizarlo mientras está activo.
const PREFIJOS_PERMITIDOS = ['/api/plataforma/']

function rutaPermitida(ruta) {
  if (SIEMPRE_PERMITIDAS.has(ruta)) return true
  return PREFIJOS_PERMITIDOS.some((p) => ruta.startsWith(p))
}

// ── Política de excepción: quién puede seguir trabajando ────────────────────
// Decisión deliberada y acotada: solo el Super Admin y quien tenga
// 'plataforma:gestionar'. NO se exceptúa al rol Administrador completo ni a
// "quien inició el mantenimiento", porque el objetivo de la ventana es que
// NADIE esté escribiendo datos mientras se trabaja sobre ellos; cada excepción
// extra es una persona más que puede generar movimientos a mitad de un backup
// o una migración.
//
// Si algún día hace falta ampliarlo, el cambio correcto es asignar el permiso
// 'plataforma:gestionar' a otro rol desde la pantalla Roles — no agregar
// condiciones aquí.
async function esAdministradorDePlataforma(req) {
  const authHeader = req.headers.authorization
  const token = req.cookies?.[COOKIE_NAME] || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null)
  if (!token) return false

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] })
    const usuario = await Usuario.findById(payload.id_usuario)
      .select('estado tokenVersion rol')
      .populate({ path: 'rol', populate: { path: 'permisos', select: 'codigo' } })

    // Se revalidan las MISMAS condiciones que verificarToken. Si esto solo
    // mirara el JWT, un token robado de un administrador —o el de una cuenta
    // desactivada— seguiría abriendo la plataforma durante el mantenimiento,
    // que es exactamente el momento en que menos se puede vigilar.
    if (!usuario || usuario.estado === 'inactivo' || usuario.tokenVersion !== payload.tokenVersion || !usuario.rol) {
      return false
    }
    if (usuario.rol.esSuperAdmin === true) return true
    return (usuario.rol.permisos || []).some((p) => p.codigo === 'plataforma:gestionar')
  } catch {
    // Token inválido/expirado: no es administrador. El 401 correspondiente lo
    // dará verificarToken más adelante si la ruta lo requiere.
    return false
  }
}

export async function bloqueoMantenimiento(req, res, next) {
  try {
    const { doc, enMantenimiento } = await estadoEfectivo()

    // Camino feliz (99.9% del tiempo): una lectura de caché en memoria y
    // fuera. Sin consultas a Mongo, sin verificación de JWT, sin costo
    // medible sobre el resto de la API.
    if (!enMantenimiento) return next()

    if (rutaPermitida(req.path)) return next()
    if (await esAdministradorDePlataforma(req)) return next()

    const estado = aEstadoPublico(doc)

    // 503 (no 403): semánticamente es "el servicio no está disponible
    // temporalmente", que es exactamente lo que pasa. Además es el código que
    // los buscadores y los monitores interpretan como indisponibilidad
    // transitoria y no como un error permanente del recurso.
    if (doc.scheduledEnd) {
      const segundos = Math.max(1, Math.ceil((doc.scheduledEnd - Date.now()) / 1000))
      res.set('Retry-After', String(segundos))
    }

    return res.status(503).json({
      error: 'La plataforma está en mantenimiento',
      // Bandera plana y estable: es por la que pregunta api/client.js en el
      // frontend para disparar la pantalla de mantenimiento sin tener que
      // adivinar por el texto del error.
      mantenimiento: true,
      estado,
    })
  } catch (err) {
    // Fail-OPEN deliberado, y es la decisión más delicada de este archivo.
    //
    // Si Mongo no responde, este middleware no puede saber si hay
    // mantenimiento. Bloquear ante la duda convertiría cualquier hipo de Atlas
    // en una caída total de Skynet, cuando el estado real casi siempre es
    // "operativa". Dejar pasar mantiene la plataforma funcionando; el peor
    // caso es que durante un mantenimiento con Mongo caído entren peticiones
    // que, sin base de datos, tampoco van a poder hacer nada igualmente.
    console.error('No se pudo leer el estado de la plataforma:', err.message)
    return next()
  }
}
