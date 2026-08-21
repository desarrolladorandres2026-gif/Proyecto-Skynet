import mongoose from 'mongoose'
import ConversacionCopiloto from '../../models/ConversacionCopiloto.js'
import MemoriaCopiloto from '../../models/MemoriaCopiloto.js'
import { cacheConversaciones } from './copiloto.cache.js'
import { ESTADO_INICIAL } from './copiloto.estados.js'

// Memoria del copiloto en tres niveles, cada uno con una vida y un costo
// distintos:
//
//  1. INMEDIATA — los últimos turnos, literales. Vive en la caché en memoria
//     del proceso; es lo que hace que "¿y el segundo?" se entienda.
//  2. CORTA — la conversación completa del día, en Mongo con TTL de 24 h. Solo
//     se leen de ella los últimos turnos; el resto existe para sobrevivir a un
//     reinicio del servidor a mitad de conversación.
//  3. LARGA — hechos que la persona pidió recordar explícitamente, sin
//     caducidad (ver MemoriaCopiloto.js).
//
// Al prompt solo sube el nivel 1 y un extracto del 3. El nivel 2 nunca se
// manda entero: es archivo, no contexto.

// Cuántos turnos literales viajan al modelo. Ocho son cuatro intercambios,
// suficiente para sostener referencias ("ese", "el anterior") sin arrastrar
// una conversación entera en cada petición.
//
// Bajó de 20 a 8 por una razón concreta: 20 turnos de una conversación real
// del Terminal rondan los 1.400 tokens de entrada por mensaje, y de esos, los
// 12 más viejos casi nunca cambian la respuesta. Es prompt que se paga en
// latencia y en cuota compartida a cambio de nada.
const TURNOS_EN_CONTEXTO = 8

// Techo por turno. Existe para acotar el prompt, no para censurar: un mensaje
// legítimo del Terminal no llega ni cerca de 2.000 caracteres.
const MAX_CARACTERES_TURNO = 2000

// Cuántos turnos se conservan en el documento. Más allá es archivo que nadie
// lee y que solo engorda el documento de Mongo.
const MAX_TURNOS_PERSISTIDOS = 40

// Hechos de memoria larga: pocos y cortos. El límite no es técnico sino de
// diseño — una memoria larga que crece sin control termina siendo un prompt
// gigante de datos irrelevantes que empeora las respuestas en vez de mejorarlas.
const MAX_HECHOS = 12

// Controles ASCII salvo tabulador, salto de línea y retorno de carro. Escrito
// con escapes y no con los caracteres literales: ponerlos crudos en el fuente
// convierte el archivo en binario para Git y lo vuelve ilegible en cualquier
// editor.
const CARACTERES_CONTROL = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]', 'g')

function claveCache(id) {
  return `conv:${id}`
}

/**
 * Recorta y limpia un texto antes de que entre a la memoria o al prompt.
 *
 * Los caracteres de control se quitan porque son el vehículo clásico para
 * disfrazar instrucciones dentro de un texto que en pantalla se ve inocente.
 */
export function sanearTexto(texto, maximo = MAX_CARACTERES_TURNO) {
  if (typeof texto !== 'string') return ''
  const limpio = texto.replace(CARACTERES_CONTROL, '').trim()
  return limpio.length > maximo ? `${limpio.slice(0, maximo)}…` : limpio
}

/**
 * Abre (o crea) la conversación de este usuario.
 *
 * `conversacionId` viene del cliente, así que se validan DOS cosas: que sea un
 * ObjectId con forma válida y que el documento sea de ESTE usuario. Sin la
 * segunda, mandar el id de otra persona devolvería su hilo completo — es el
 * IDOR clásico, y aquí expondría conversaciones enteras sobre datos internos.
 */
export async function abrirConversacion(conversacionId, usuario) {
  const usuarioId = String(usuario.id_usuario)

  if (conversacionId && mongoose.isValidObjectId(conversacionId)) {
    const enCache = cacheConversaciones.obtener(claveCache(conversacionId))
    // La comprobación de propiedad se repite sobre lo cacheado: la caché es
    // del proceso y la clave es el id, así que sin esto un id ajeno serviría
    // igual mientras la entrada siga viva.
    if (enCache && enCache.usuarioId === usuarioId) return enCache

    const doc = await ConversacionCopiloto.findOne({
      _id: conversacionId,
      usuario: usuario.id_usuario,
    }).lean()
    if (doc) {
      const conv = {
        id: String(doc._id),
        usuarioId,
        turnos: doc.turnos || [],
        temas: doc.temas || [],
        estado: { ...ESTADO_INICIAL, ...(doc.estado || {}) },
      }
      cacheConversaciones.guardar(claveCache(conv.id), conv)
      return conv
    }
    // Id inválido, ajeno o ya expirado por TTL: se abre uno nuevo en silencio.
    // Devolver un error obligaría al frontend a manejar un caso que no le
    // aporta nada al usuario ("tu conversación caducó, vuelve a empezar").
  }

  const doc = await ConversacionCopiloto.create({ usuario: usuario.id_usuario, turnos: [], temas: [] })
  const conv = { id: String(doc._id), usuarioId, turnos: [], temas: [], estado: { ...ESTADO_INICIAL } }
  cacheConversaciones.guardar(claveCache(conv.id), conv)
  return conv
}

/**
 * Agrega el intercambio recién terminado a la conversación.
 *
 * La escritura en Mongo NO se espera (ver el `.catch()` sin `await`): la
 * respuesta ya se le entregó al usuario y hacerle esperar la persistencia solo
 * agrega latencia a algo que no cambia lo que ve. Si falla, se pierde el hilo
 * de esa conversación, no el mensaje.
 */
export function registrarIntercambio(conv, { pregunta, respuesta, tema }) {
  const nuevos = [
    { rol: 'user', texto: sanearTexto(pregunta) },
    { rol: 'model', texto: sanearTexto(respuesta) },
  ]
  conv.turnos = [...conv.turnos, ...nuevos].slice(-MAX_TURNOS_PERSISTIDOS)
  if (tema && !conv.temas.includes(tema)) {
    conv.temas = [...conv.temas, tema].slice(-6)
  }
  cacheConversaciones.guardar(claveCache(conv.id), conv)

  ConversacionCopiloto.updateOne(
    { _id: conv.id },
    { $set: { turnos: conv.turnos, temas: conv.temas } }
  ).catch((err) => {
    console.error('[copiloto] no se pudo persistir la conversación:', err.message)
  })
}

/** Los turnos que de verdad viajan al modelo. */
export function turnosParaContexto(conv) {
  return conv.turnos.slice(-TURNOS_EN_CONTEXTO)
}

/**
 * Aplica cambios parciales al estado conversacional (flujo, entidad activa,
 * última pregunta, borrador) y los persiste.
 *
 * Igual que `registrarIntercambio`, la escritura en Mongo no se espera: el
 * estado ya vive actualizado en la caché del proceso, que es de donde lo lee
 * el resto del turno y el siguiente mensaje si llega antes de que Mongo
 * confirme.
 *
 * @param {object} conv     La conversación abierta con `abrirConversacion`.
 * @param {Partial<{flujo:string, entidadActiva:object|null, ultimaPregunta:string|null, borrador:object|null}>} cambios
 *        Solo las claves presentes se sobrescriben; el resto del estado
 *        anterior se conserva.
 */
export function actualizarEstado(conv, cambios = {}) {
  conv.estado = { ...ESTADO_INICIAL, ...conv.estado, ...cambios }
  cacheConversaciones.guardar(claveCache(conv.id), conv)

  ConversacionCopiloto.updateOne({ _id: conv.id }, { $set: { estado: conv.estado } }).catch((err) => {
    console.error('[copiloto] no se pudo persistir el estado de la conversación:', err.message)
  })
}

// ── Memoria larga ───────────────────────────────────────────────────────────

export async function obtenerHechos(usuarioId) {
  const doc = await MemoriaCopiloto.findOne({ usuario: usuarioId }).lean()
  return doc?.hechos || []
}

/**
 * Guarda (o reemplaza) un hecho de memoria larga.
 *
 * Reemplazar por clave y no acumular es lo que evita que la memoria se
 * contradiga: si alguien dijo en marzo que su área es Mantenimiento y hoy dice
 * que es Bodega, con acumulación quedan las dos versiones y el modelo elige la
 * que le parezca.
 */
export async function recordarHecho(usuarioId, clave, valor) {
  const claveLimpia = sanearTexto(clave, 60).toLowerCase()
  const valorLimpio = sanearTexto(valor, 300)
  if (!claveLimpia || !valorLimpio) return { guardado: false, motivo: 'Falta la clave o el valor' }

  const doc =
    (await MemoriaCopiloto.findOne({ usuario: usuarioId })) ||
    new MemoriaCopiloto({ usuario: usuarioId, hechos: [] })
  const existente = doc.hechos.find((h) => h.clave === claveLimpia)
  if (existente) {
    existente.valor = valorLimpio
  } else {
    if (doc.hechos.length >= MAX_HECHOS) doc.hechos.shift() // sale el más viejo
    doc.hechos.push({ clave: claveLimpia, valor: valorLimpio })
  }
  await doc.save()
  return { guardado: true, clave: claveLimpia, valor: valorLimpio }
}

export async function olvidarHecho(usuarioId, clave) {
  const claveLimpia = sanearTexto(clave, 60).toLowerCase()
  const res = await MemoriaCopiloto.updateOne(
    { usuario: usuarioId },
    { $pull: { hechos: { clave: claveLimpia } } }
  )
  return { olvidado: res.modifiedCount > 0 }
}
