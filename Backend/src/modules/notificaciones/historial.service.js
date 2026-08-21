import EnvioNotificacion from '../../models/EnvioNotificacion.js'
import Usuario from '../../models/Usuario.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { escapeRegex } from '../../utils/regex.js'
import { inicioDelDia, instanteLocal } from '../../utils/fechas.js'

// Historial administrativo de envíos: solo lectura sobre EnvioNotificacion
// (la cola/bitácora real, sin tocar su esquema ni su motor). Pensado para
// responder "¿por qué esta persona no recibió esta notificación?" sin
// necesidad de consultar Mongo a mano.

const LIMITE_MAX = 100
const LIMITE_DEFECTO = 25
const CANALES_VALIDOS = ['email', 'push']
const ESTADOS_VALIDOS = ['pendiente', 'enviado', 'fallido']

// Mismo criterio de zona horaria que auditoria.service.js: los límites de
// fecha se anclan a la medianoche del Terminal (ver utils/fechas.js), no a
// la de UTC ni a la del proceso Node.
function construirRangoFecha(desde, hasta) {
  const rango = {}

  if (desde !== undefined) {
    if (typeof desde !== 'string') throw new ErrorValidacion('desde inválido')
    const fecha = desde.includes('T') ? instanteLocal(desde) : inicioDelDia(desde)
    if (!fecha || Number.isNaN(fecha.getTime())) throw new ErrorValidacion('desde no es una fecha válida')
    rango.$gte = fecha
  }

  if (hasta !== undefined) {
    if (typeof hasta !== 'string') throw new ErrorValidacion('hasta inválido')
    if (hasta.includes('T')) {
      const fecha = instanteLocal(hasta)
      if (Number.isNaN(fecha.getTime())) throw new ErrorValidacion('hasta no es una fecha válida')
      rango.$lte = fecha
    } else {
      const inicioHasta = inicioDelDia(hasta)
      if (!inicioHasta) throw new ErrorValidacion('hasta no es una fecha válida')
      rango.$lt = new Date(inicioHasta.getTime() + 24 * 60 * 60 * 1000)
    }
  }

  return rango
}

// Todos los parámetros deben ser string: bloquea que un operador NoSQL
// (p. ej. {"canal":{"$ne":null}}) llegue vía query string, mismo criterio
// que auditoria.service.js.
async function construirFiltro({ usuario, categoria, canal, estado, desde, hasta, soloErrores }) {
  const filtro = {}

  if (usuario !== undefined) {
    if (typeof usuario !== 'string') throw new ErrorValidacion('usuario inválido')
    const regex = { $regex: escapeRegex(usuario.trim()), $options: 'i' }
    // EnvioNotificacion solo guarda el ObjectId del destinatario, no su
    // nombre/correo: se resuelve primero a una lista de _id y se filtra por
    // eso, en vez de un $lookup — la colección de usuarios es pequeña.
    const usuarios = await Usuario.find({ $or: [{ nombre: regex }, { email: regex }, { nombre_usuario: regex }] }).select('_id')
    filtro.usuario = { $in: usuarios.map((u) => u._id) }
  }
  if (categoria !== undefined) {
    if (typeof categoria !== 'string') throw new ErrorValidacion('categoria inválida')
    filtro.categoria = categoria
  }
  if (canal !== undefined) {
    if (!CANALES_VALIDOS.includes(canal)) throw new ErrorValidacion(`canal debe ser uno de: ${CANALES_VALIDOS.join(', ')}`)
    filtro.canal = canal
  }
  if (estado !== undefined) {
    if (!ESTADOS_VALIDOS.includes(estado)) throw new ErrorValidacion(`estado debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}`)
    filtro.estado = estado
  }
  if (soloErrores === 'true') {
    filtro.error = { $exists: true, $ne: null }
  }
  if (desde !== undefined || hasta !== undefined) {
    filtro.createdAt = construirRangoFecha(desde, hasta)
  }

  return filtro
}

// Selección explícita de campos: EnvioNotificacion no guarda credenciales ni
// claves VAPID (esas viven solo en variables de entorno, ver utils/webpush.js
// y utils/email.js), pero se listan a propósito para que un campo nuevo que
// se agregue mañana al modelo no aparezca aquí sin que alguien lo decida.
const CAMPOS_ENVIO = 'usuario canal categoria tipo estado intentos error createdAt enviadoEn titulo cuerpo url pushSubscription'

export async function listarEnvios(query) {
  const filtro = await construirFiltro(query)
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const limit = Math.min(LIMITE_MAX, Math.max(1, Number.parseInt(query.limit, 10) || LIMITE_DEFECTO))
  const skip = (page - 1) * limit

  const [envios, total] = await Promise.all([
    EnvioNotificacion.find(filtro)
      .select(CAMPOS_ENVIO)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('usuario', 'nombre email')
      .populate('pushSubscription', 'dispositivo navegador'),
    EnvioNotificacion.countDocuments(filtro),
  ])

  return { envios, total, page, pages: Math.ceil(total / limit) || 1 }
}

// Alimenta los selects de "Categoría"/"Canal"/"Estado" del panel con lo que
// de verdad existe en la colección, mismo patrón que
// auditoria.service.js#obtenerFiltrosDisponibles.
export async function obtenerFiltrosDisponibles() {
  const categorias = await EnvioNotificacion.distinct('categoria')
  return { categorias: categorias.sort(), canales: CANALES_VALIDOS, estados: ESTADOS_VALIDOS }
}
