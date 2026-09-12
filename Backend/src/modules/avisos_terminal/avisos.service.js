import mongoose from 'mongoose'
import Usuario from '../../models/Usuario.js'
import Rol from '../../models/Rol.js'
import Dependencia from '../../models/Dependencia.js'
import PushSubscription from '../../models/PushSubscription.js'
import Notificacion from '../../models/Notificacion.js'
import AvisoTerminal from '../../models/AvisoTerminal.js'
import AvisoTerminalEntrega from '../../models/AvisoTerminalEntrega.js'
import webpush from '../../utils/webpush.js'
import { escapeRegex } from '../../utils/regex.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { ErrorValidacion, ErrorNoEncontrado, ErrorAutorizacion } from '../../utils/errores.js'
import { logger } from '../../config/logger.js'
import { generarAudioVoz } from './avisos.tts.js'
import { esVozTtsValida, VOZ_TTS_DEFECTO, VOCES_TTS } from './vocesTts.js'

// Frase fija con la que SIEMPRE arranca la locución, antes del texto que
// escribe el administrador (ver especificación de "Avisos Terminal de
// Neiva"). Vive acá, no en el frontend: el backend es quien guarda
// `textoLocucion` ya resuelto (AvisoTerminal.js) y quien manda el payload de
// voz al Service Worker, así que es la única fuente de verdad de cómo suena
// un aviso.
export const PREFIJO_INSTITUCIONAL = 'El Terminal de Transportes de Neiva informa que:'

const TEXTO_MIN = 3
const TEXTO_MAX = 500

// Defensa en profundidad de contenido (el campo es un <textarea> de texto
// libre escrito por un administrador, no HTML): colapsa espacios/saltos de
// línea repetidos, recorta a un tamaño razonable para una locución (un
// "aviso" de 500 caracteres ya son ~45s hablado) y quita ángulos para que
// nada de lo que se guarde pueda interpretarse como una etiqueta si algún
// día se renderiza sin escapar (defensa extra, React ya escapa por
// defecto). No se usa una librería de sanitización de HTML porque este campo
// nunca acepta HTML, ni siquiera para quitarlo: se rechaza sin más.
export function sanitizarTexto(bruto) {
  if (typeof bruto !== 'string') {
    throw new ErrorValidacion('El mensaje del aviso es obligatorio')
  }
  const limpio = bruto
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (limpio.length < TEXTO_MIN) {
    throw new ErrorValidacion(`El mensaje debe tener al menos ${TEXTO_MIN} caracteres`)
  }
  if (limpio.length > TEXTO_MAX) {
    throw new ErrorValidacion(`El mensaje no puede superar los ${TEXTO_MAX} caracteres`)
  }
  return limpio
}

export function construirLocucion(texto) {
  return `${PREFIJO_INSTITUCIONAL} ${texto}`
}

// Resuelve la audiencia elegida por el admin a una lista de Usuario activos,
// deduplicada. Nunca incluye usuarios inactivos (mismo criterio que
// plataforma.notificaciones.js) — un aviso institucional interrumpe con
// audio a una persona real; no tiene sentido "enviarlo" a una cuenta dada de
// baja.
async function resolverDestinatarios({ tipo, usuarios, rol, dependencia }) {
  if (tipo === 'todos') {
    const docs = await Usuario.find({ estado: 'activo' }).select('_id')
    return { usuariosDocs: docs, etiqueta: 'Todos los usuarios' }
  }

  if (tipo === 'usuario') {
    const ids = [...new Set((usuarios || []).filter((id) => mongoose.Types.ObjectId.isValid(id)))]
    if (!ids.length) throw new ErrorValidacion('Selecciona al menos un usuario destinatario')
    const docs = await Usuario.find({ _id: { $in: ids }, estado: 'activo' }).select('_id nombre')
    return { usuariosDocs: docs, etiqueta: docs.map((d) => d.nombre).join(', ') }
  }

  if (tipo === 'rol') {
    if (!rol || !mongoose.Types.ObjectId.isValid(rol)) {
      throw new ErrorValidacion('Selecciona un rol destinatario válido')
    }
    const rolDoc = await Rol.findOne({ _id: rol, estado: 'activo' }).select('nombre')
    if (!rolDoc) throw new ErrorValidacion('El rol seleccionado no existe o está inactivo')
    const docs = await Usuario.find({ rol, estado: 'activo' }).select('_id')
    return { usuariosDocs: docs, etiqueta: rolDoc.nombre }
  }

  if (tipo === 'dependencia') {
    const valor = (dependencia || '').trim()
    if (!valor) throw new ErrorValidacion('Selecciona una dependencia/grupo destinatario')
    const docs = await Usuario.find({ dependencia: valor, estado: 'activo' }).select('_id')
    return { usuariosDocs: docs, etiqueta: valor }
  }

  throw new ErrorValidacion(`Tipo de destinatario desconocido: "${tipo}"`)
}

// Envía el Web Push real a cada dispositivo activo del usuario y avanza la
// entrega a 'enviado'. Duplicado deliberado (en vez de reutilizar
// notificaciones.service.js#enviarPush/notificar): ese motor encola en
// EnvioNotificacion y lo despacha el worker en su siguiente tick (hasta
// NOTIF_WORKER_INTERVALO_MS después) respetando preferencias de canal — el
// comportamiento correcto para "nuevo requerimiento" o "nuevo daño", pero no
// para un anuncio institucional que debe sonar YA y que no es silenciable
// desde Preferencias (ver requisitos: solo un administrador autorizado
// decide si se transmite, no el destinatario si la recibe). Este módulo
// posee su propio ciclo de entrega end-to-end (enviado/entregado/reproducido)
// sobre las mismas piezas de base (PushSubscription + utils/webpush.js), sin
// duplicar la cola/worker genérico.
//
// Nunca lanza: se llama en "fire and forget" desde transmitirAviso() para no
// hacer esperar al administrador a que salgan todos los push (pueden ser
// cientos con destinatarios:'todos'). Si el push falla para TODOS los
// dispositivos (o no tiene ninguno), la entrega igual queda 'enviado': sigue
// disponible por *polling* en cuanto la persona abra la app (ver
// listarPendientes) — un dispositivo desconectado nunca es un error, solo
// una entrega diferida.
// urgency:'high' le dice al servicio de push del navegador (FCM en
// Android/Chrome, APNs en iOS/Safari) que este mensaje puede despertar al
// dispositivo incluso en modo ahorro de batería/Doze — es la única palanca
// real que expone la Web Push API para pedir entrega prioritaria; no hay
// forma de ir más allá de esto desde una PWA sin código nativo (ver
// AvisoTerminalPlayer.jsx y la nota de arquitectura en avisos.routes.js).
// TTL corto (1h, no las 4 semanas por defecto de la librería): un aviso
// institucional que no se pudo entregar en una hora ya no tiene sentido
// como notificación "en tiempo real" — mejor que el servicio de push lo
// descarte a que aparezca de sorpresa horas después. Coincide con
// VENTANA_AUTOPLAY_MS en listarPendientes(), que aplica el mismo criterio
// del lado del polling.
const TTL_PUSH_SEGUNDOS = 3600

async function enviarPushEntrega(entrega, aviso) {
  try {
    const suscripciones = await PushSubscription.find({ usuario: entrega.usuario, estado: 'activa' })
    const payload = JSON.stringify({
      tipo: 'aviso_terminal',
      title: 'Terminal de Transportes de Neiva',
      body: aviso.texto,
      url: '/avisos-terminal/mios',
      tag: String(entrega._id),
      avisoId: String(aviso._id),
      entregaId: String(entrega._id),
      textoLocucion: aviso.textoLocucion,
    })

    // Un solo bulkWrite para "último uso" en vez de un sub.save() por
    // dispositivo: con destinatarios:'todos' (cientos de personas, varios
    // dispositivos cada una), N escrituras individuales concurrentes abren
    // N conexiones contra Atlas para un campo que no tiene lógica por
    // documento — se acumulan los ids exitosos y se actualizan de una vez.
    const idsExitosos = []
    await Promise.allSettled(
      suscripciones.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { urgency: 'high', TTL: TTL_PUSH_SEGUNDOS }
          )
          idsExitosos.push(sub._id)
        } catch (err) {
          // 404/410 = el navegador descartó la suscripción (mismo criterio
          // que notificaciones.service.js#registrarFallo): se borra para no
          // reintentar contra un endpoint muerto en el próximo aviso.
          if (err.statusCode === 404 || err.statusCode === 410) {
            await PushSubscription.deleteOne({ _id: sub._id })
          }
        }
      })
    )
    if (idsExitosos.length) {
      await PushSubscription.updateMany({ _id: { $in: idsExitosos } }, { $set: { ultimoUsoEn: new Date() } })
    }
  } catch (err) {
    logger.error('No se pudo enviar el push de un Aviso Terminal de Neiva', { error: err.message })
  } finally {
    entrega.estado = 'enviado'
    entrega.enviadoEn = new Date()
    await entrega.save().catch(() => {})
  }
}

export async function crearYTransmitirAviso({ texto, destinatarios, voz, admin }) {
  const textoLimpio = sanitizarTexto(texto)
  const textoLocucion = construirLocucion(textoLimpio)
  const { usuariosDocs, etiqueta } = await resolverDestinatarios(destinatarios || {})

  if (!usuariosDocs.length) {
    throw new ErrorValidacion('No hay destinatarios activos para el criterio seleccionado')
  }

  const vozElegida = esVozTtsValida(voz) ? voz : VOZ_TTS_DEFECTO

  // Se genera el audio institucional ANTES de crear el aviso (así se guarda
  // todo en un solo insert), pero un fallo acá NUNCA debe impedir la
  // transmisión — es lo más importante del requisito de robustez: el motivo
  // más probable es la cuota gratuita del modelo de voz (3/min, ver
  // avisos.ttsCuota.js), y un administrador que transmite varios avisos
  // seguidos no puede quedarse sin poder avisar por eso. Sin audio generado,
  // cada dispositivo simplemente cae a su propia voz local (ver
  // AvisoTerminalPlayer.jsx) — sigue sonando, solo que no con la MISMA voz
  // en todos los celulares.
  let audio
  try {
    audio = await generarAudioVoz(textoLocucion, vozElegida)
  } catch (err) {
    logger.warn('No se pudo generar el audio institucional del Aviso Terminal de Neiva (se transmite sin él)', {
      error: err.message,
    })
  }

  // Un Aviso Terminal es un anuncio EN VIVO, no una bandeja de mensajes:
  // solo debe sonar el más reciente. Sin este paso, alguien que no tuvo la
  // app abierta mientras se transmitían varios avisos seguidos los
  // encontraba TODOS pendientes al volver a entrar (ver listarPendientes,
  // hasta 10 dentro de la última hora) y el reproductor los encolaba uno
  // tras otro apenas conectaba — el bug real reportado: "se acumulan y
  // hablan todos casi al mismo tiempo". Cancelar aquí lo que seguía sin
  // reproducirse de CUALQUIER aviso anterior — sin importar destinatario —
  // garantiza que solo quede pendiente el que se transmite ahora, igual que
  // un sistema de altavoces real: el anuncio nuevo reemplaza al que no
  // alcanzó a sonar, no se hace fila. Debe ejecutarse ANTES de crear las
  // entregas nuevas de abajo (nunca en paralelo con ellas) para no arriesgar
  // que el propio insertMany quede atrapado por este mismo updateMany. No
  // toca 'reproducido' (ya se escuchó, es historia) ni 'fallido' (otro
  // estado terminal): "Mis avisos" sigue mostrando el aviso igual, solo que
  // como no reproducido.
  await AvisoTerminalEntrega.updateMany(
    { estado: { $in: ['pendiente', 'enviado', 'entregado'] } },
    { $set: { estado: 'cancelado', canceladoEn: new Date() } }
  )

  const aviso = await AvisoTerminal.create({
    texto: textoLimpio,
    textoLocucion,
    destinatarios: {
      tipo: destinatarios.tipo,
      usuarios: destinatarios.tipo === 'usuario' ? usuariosDocs.map((u) => u._id) : [],
      rol: destinatarios.tipo === 'rol' ? destinatarios.rol : undefined,
      dependencia: destinatarios.tipo === 'dependencia' ? destinatarios.dependencia : undefined,
      etiqueta,
    },
    totalDestinatarios: usuariosDocs.length,
    creadoPor: {
      usuario: admin.id_usuario,
      nombre: admin.nombre_usuario,
      rolNombre: admin.rol?.nombre,
    },
    voz: vozElegida,
    audio: audio ? { data: audio.data, mimeType: audio.mimeType } : undefined,
  })

  // Las dos inserciones son independientes entre sí (ninguna necesita el
  // resultado de la otra) — se disparan en paralelo. La de Notificacion
  // lleva su propio .catch(): un fallo ahí es "best effort" (la campana es
  // secundaria) y NO debe tumbar la transmisión real, así que no puede
  // esperar a que ambas resuelvan con Promise.all sin envolverla antes.
  const [entregas] = await Promise.all([
    // insertMany + unique index {aviso,usuario}: aunque resolverDestinatarios()
    // ya deduplica, esta es la garantía real contra "Evitar duplicación de
    // mensajes" del requisito de seguridad.
    AvisoTerminalEntrega.insertMany(usuariosDocs.map((u) => ({ aviso: aviso._id, usuario: u._id }))),
    // Notificación interna (campana): reutiliza el centro de notificaciones
    // ya existente para que el aviso también aparezca ahí, sin tocar ese motor.
    Notificacion.insertMany(
      usuariosDocs.map((u) => ({
        usuario: u._id,
        categoria: 'avisos_terminal',
        tipo: 'aviso_transmitido',
        titulo: 'Aviso institucional · Terminal de Transportes de Neiva',
        cuerpo: textoLimpio,
        url: '/avisos-terminal/mios',
      }))
    ).catch((err) => logger.error('No se pudo escribir la notificación interna de un Aviso Terminal de Neiva', { error: err.message })),
  ])

  // Fire-and-forget: el administrador no debe esperar a que salgan N push
  // (puede ser el personal completo del Terminal) para ver "transmitido".
  Promise.allSettled(entregas.map((entrega) => enviarPushEntrega(entrega, aviso))).catch(() => {})

  await registrarAuditoria({
    usuario: admin,
    accion: 'transmitir',
    modulo: 'avisos_terminal',
    entidad: 'AvisoTerminal',
    entidadId: aviso._id,
    descripcion: `Transmitió un Aviso Terminal de Neiva a ${usuariosDocs.length} destinatario(s) (${etiqueta})`,
    cambios: { texto: textoLimpio, destinatarios: aviso.destinatarios },
  })

  return { aviso, totalDestinatarios: usuariosDocs.length, audioGenerado: Boolean(audio) }
}

export async function listarOpcionesDestinatarios() {
  const [roles, dependencias] = await Promise.all([
    Rol.find({ estado: 'activo' }).select('nombre').sort({ nombre: 1 }),
    Dependencia.find({}).select('nombre').sort({ nombre: 1 }),
  ])
  return {
    roles: roles.map((r) => ({ id: r._id, nombre: r.nombre })),
    dependencias: dependencias.map((d) => d.nombre),
    // Catálogo de voces institucionales servido desde acá (no duplicado en el
    // frontend): a diferencia de las voces de SpeechSynthesis del navegador
    // (inherentemente locales a cada dispositivo, nunca "enviables"), estas
    // SÍ son una lista que decide el backend — es la única fuente de verdad
    // de qué nombres acepta generarAudioVoz() (ver vocesTts.js).
    voces: VOCES_TTS,
    vozDefecto: VOZ_TTS_DEFECTO,
  }
}

export async function buscarUsuariosDestino(q) {
  if (!q || q.trim().length < 2) return []
  const usuarios = await Usuario.find({
    estado: 'activo',
    $or: [
      { nombre: { $regex: escapeRegex(q.trim()), $options: 'i' } },
      { nombre_usuario: { $regex: escapeRegex(q.trim()), $options: 'i' } },
    ],
  })
    .select('nombre nombre_usuario dependencia cargo')
    .limit(15)
  return usuarios
}

const PAGE_SIZE_DEFECTO = 20

export async function listarHistorial({ page = 1, limit = PAGE_SIZE_DEFECTO } = {}) {
  const skip = (page - 1) * limit
  const [avisos, total] = await Promise.all([
    AvisoTerminal.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AvisoTerminal.countDocuments({}),
  ])

  const ids = avisos.map((a) => a._id)
  const conteos = await AvisoTerminalEntrega.aggregate([
    { $match: { aviso: { $in: ids } } },
    { $group: { _id: { aviso: '$aviso', estado: '$estado' }, n: { $sum: 1 } } },
  ])
  const conteoPorAviso = new Map()
  for (const c of conteos) {
    const key = String(c._id.aviso)
    if (!conteoPorAviso.has(key)) conteoPorAviso.set(key, {})
    conteoPorAviso.get(key)[c._id.estado] = c.n
  }

  return {
    avisos: avisos.map((a) => ({
      ...a.toObject(),
      conteos: conteoPorAviso.get(String(a._id)) || {},
    })),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  }
}

export async function obtenerDetalle(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ErrorNoEncontrado('Aviso no encontrado')

  // Las entregas solo necesitan `id` (el parámetro), no el resultado de
  // buscar el aviso — se piden en paralelo en vez de encadenadas.
  const [aviso, entregas] = await Promise.all([
    AvisoTerminal.findById(id),
    AvisoTerminalEntrega.find({ aviso: id })
      .populate({ path: 'usuario', select: 'nombre nombre_usuario dependencia' })
      .sort({ estado: 1, createdAt: 1 }),
  ])
  if (!aviso) throw new ErrorNoEncontrado('Aviso no encontrado')

  return { aviso, entregas }
}

// Audio institucional (WAV) de un aviso ya transmitido. Autoriza a dos
// tipos de persona: quien TRANSMITE (puede reescuchar cualquier aviso desde
// el historial) y quien lo RECIBIÓ (tiene una AvisoTerminalEntrega propia) —
// nunca a un tercero sin relación con el aviso. Devuelve null (no error)
// cuando el aviso existe pero no tiene audio generado (falló la síntesis o
// se transmitió antes de que este campo existiera): el reproductor cae a la
// voz local del dispositivo en ese caso, no es un fallo del endpoint.
export async function obtenerAudioParaUsuario(avisoId, usuario) {
  if (!mongoose.Types.ObjectId.isValid(avisoId)) throw new ErrorNoEncontrado('Aviso no encontrado')

  const puedeVerCualquiera = usuario.esSuperAdmin || usuario.permisos?.has('avisos_terminal:transmitir') || usuario.permisos?.has('avisos_terminal:ver_historial')

  const [aviso, tieneEntregaPropia] = await Promise.all([
    AvisoTerminal.findById(avisoId).select('+audio.data audio.mimeType'),
    puedeVerCualquiera ? Promise.resolve(true) : AvisoTerminalEntrega.exists({ aviso: avisoId, usuario: usuario.id_usuario }),
  ])
  if (!aviso) throw new ErrorNoEncontrado('Aviso no encontrado')
  if (!tieneEntregaPropia) throw new ErrorAutorizacion('No tienes acceso al audio de este aviso')
  if (!aviso.audio?.data) return null

  return { data: aviso.audio.data, mimeType: aviso.audio.mimeType || 'audio/wav' }
}

// Genera una muestra corta con una voz institucional SIN guardar nada — para
// el botón "Probar voz" del panel de Transmitir, antes de decidirse. Cuenta
// contra la misma cuota compartida que una transmisión real (ver
// avisos.ttsCuota.js): a propósito no tiene su propio presupuesto aparte,
// para no poder agotar en pruebas la cuota que necesita la transmisión real.
export async function probarVozInstitucional(texto, voz) {
  const textoLimpio = sanitizarTexto(texto)
  return generarAudioVoz(construirLocucion(textoLimpio), voz)
}

// Entregas que el reproductor global (AvisoTerminalPlayer.jsx) todavía no ha
// confirmado como reproducidas — es lo que trae el polling y lo que dispara
// el Service Worker vía postMessage cuando llega un push en primer plano.
// Un Aviso Terminal de Neiva es un anuncio EN VIVO, no un mensaje que deba
// esperar en bandeja: si nadie lo recibió en la primera hora (dispositivo
// apagado, sin señal, app nunca abierta), reproducirlo tarde ya no
// corresponde al momento del aviso original y solo confunde ("¿esto es de
// ahora?"). Mismo criterio y misma ventana que TTL_PUSH_SEGUNDOS en
// enviarPushEntrega(): pasada la hora, la entrega deja de aparecer aquí (no
// se auto-reproduce ni se acumula en la cola del reproductor) aunque siga
// existiendo en la base para el historial/auditoría — nunca se borra ni se
// oculta de "Mis avisos".
const VENTANA_AUTOPLAY_MS = 60 * 60 * 1000

export async function listarPendientes(usuarioId) {
  const corte = new Date(Date.now() - VENTANA_AUTOPLAY_MS)
  const entregas = await AvisoTerminalEntrega.find({
    usuario: usuarioId,
    estado: { $in: ['pendiente', 'enviado', 'entregado'] },
    createdAt: { $gte: corte },
  })
    .populate({ path: 'aviso', select: 'texto textoLocucion createdAt' })
    .sort({ createdAt: 1 })
    .limit(10)

  return entregas.filter((e) => e.aviso)
}

export async function listarMisAvisos(usuarioId, { page = 1, limit = PAGE_SIZE_DEFECTO } = {}) {
  const skip = (page - 1) * limit
  const [entregas, total] = await Promise.all([
    AvisoTerminalEntrega.find({ usuario: usuarioId })
      .populate({ path: 'aviso', select: 'texto textoLocucion createdAt creadoPor' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    AvisoTerminalEntrega.countDocuments({ usuario: usuarioId }),
  ])
  return {
    entregas: entregas.filter((e) => e.aviso),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  }
}

// Orden real del ciclo de vida — usado para impedir que un cliente retroceda
// el estado (p. ej. un reintento de red que reenvía 'entregado' después de
// que ya se confirmó 'reproducido').
const ORDEN_ESTADO = ['pendiente', 'enviado', 'entregado', 'reproducido']

export async function actualizarEstadoEntrega(entregaId, usuarioId, nuevoEstado) {
  if (!['entregado', 'reproducido'].includes(nuevoEstado)) {
    throw new ErrorValidacion(`Estado no permitido: "${nuevoEstado}"`)
  }
  if (!mongoose.Types.ObjectId.isValid(entregaId)) throw new ErrorNoEncontrado('Entrega no encontrada')

  const entrega = await AvisoTerminalEntrega.findById(entregaId)
  if (!entrega) throw new ErrorNoEncontrado('Entrega no encontrada')
  // Nunca se confirma la entrega de otra persona: cada dispositivo solo
  // puede hablar por su propia sesión.
  if (String(entrega.usuario) !== String(usuarioId)) {
    throw new ErrorAutorizacion('No puedes confirmar la entrega de un aviso ajeno')
  }

  if (entrega.estado === 'fallido') return entrega
  if (ORDEN_ESTADO.indexOf(nuevoEstado) <= ORDEN_ESTADO.indexOf(entrega.estado)) return entrega

  entrega.estado = nuevoEstado
  if (nuevoEstado === 'entregado') entrega.entregadoEn = new Date()
  if (nuevoEstado === 'reproducido') entrega.reproducidoEn = new Date()
  await entrega.save()
  return entrega
}
