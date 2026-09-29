import Usuario from '../../models/Usuario.js'
import PushSubscription from '../../models/PushSubscription.js'
import PreferenciaNotificacion from '../../models/PreferenciaNotificacion.js'
import ConfiguracionCanalesNotificacion from '../../models/ConfiguracionCanalesNotificacion.js'
import Rol from '../../models/Rol.js'
import Permiso from '../../models/Permiso.js'
import EnvioNotificacion from '../../models/EnvioNotificacion.js'
import Notificacion from '../../models/Notificacion.js'
import webpush from '../../utils/webpush.js'
import { env } from '../../config/env.js'
import { enviarEmailGenerico } from '../../utils/email.js'
import { plantillaNotificacion, plantillaNotificacionTexto, headersListaBaja } from './notificaciones.plantillas.js'
import { CATEGORIAS_NOTIFICACION, esCategoriaValida } from './notificaciones.catalogo.js'
import { ErrorValidacion } from '../../utils/errores.js'

// Código del permiso que gobierna quién recibe notificaciones por CORREO.
// Definido en seedData/rbac.data.js; se referencia por string (no se importa
// el catálogo) por el mismo criterio que el resto del sistema: el permiso
// vive en Mongo y puede reasignarse desde la pantalla Roles sin desplegar.
const PERMISO_RECIBIR_EMAIL = 'notificaciones:recibir_email'

// Resuelve los _id de Rol autorizados a recibir correo: los que tienen
// PERMISO_RECIBIR_EMAIL más los esSuperAdmin (bypass total, igual que
// requierePermiso() en middleware/permisos.js).
//
// Devuelve un Set de strings para poder comparar contra Usuario.rol sin
// volver a consultar por destinatario. Se resuelve por ROL y no por Usuario a
// propósito: la consulta es O(roles) — una decena de documentos — en vez de
// O(destinatarios), que en una publicación del SIG son ~100.
//
// Si el permiso todavía no existe en la base (backend nuevo contra una BD que
// aún no corrió el seed ni scripts/otorgar-permiso-recibir-email.js), el
// resultado incluye solo los Super Admin. Se prefiere ese "casi nadie" al
// "todos" opuesto: un correo de menos se nota y se corrige, mientras que
// volver a abrir el canal a los ~85 operativos reventaría otra vez la cuota
// diaria del proveedor SMTP en silencio (ver el comentario del permiso en
// rbac.data.js).
async function rolesQuePuedenRecibirEmail() {
  const permiso = await Permiso.findOne({ codigo: PERMISO_RECIBIR_EMAIL }).select('_id')
  const condiciones = [{ esSuperAdmin: true }]
  if (permiso) condiciones.push({ permisos: permiso._id })
  const roles = await Rol.find({ $or: condiciones, estado: 'activo' }).select('_id')
  return new Set(roles.map((r) => String(r._id)))
}

// Punto de entrada único del sistema de notificaciones. Encola filas en
// EnvioNotificacion (canal por destinatario que corresponda según sus
// preferencias) y retorna de inmediato: el envío real lo hace
// procesarPendientes() en el siguiente tick del worker (ver
// notificaciones.worker.js), para que el request que originó el evento
// (crear un ticket, aprobar un requerimiento...) nunca espere a que salga
// un correo o un push.
//
// `transaccional: true` se salta preferencias por completo (siempre se
// encola para todos los canales que el usuario tenga registrados) — está
// pensado para alertas de seguridad, no para el flujo normal de eventos de
// negocio, que sí debe respetar lo que el usuario configuró.
//
// `incluirEmail`/`incluirPush` acotan de qué canales participa este evento
// en absoluto, ANTES de mirar preferencias. Existe por compatibilidad: los
// ~9 módulos que llamaban a notificarUsuarios() antes de que este servicio
// existiera solo mandaban push (ver utils/sendPush.js) — sin este corte,
// literalmente todo evento del sistema empezaría a mandar también un correo
// en cuanto se conecte, lo cual sería una sorpresa no pedida, no una mejora.
//
// El canal correo tiene además un filtro por ROL que ningún llamador puede
// desactivar: solo recibe email quien tenga notificaciones:recibir_email (o
// esSuperAdmin) — ver rolesQuePuedenRecibirEmail() arriba. Para todos los
// demás el evento sigue saliendo por push y queda en la campana interna; lo
// único que no se genera es la fila de canal 'email'.
export async function notificar({
  usuarios, categoria, tipo, titulo, cuerpo, url,
  transaccional = false, incluirEmail = true, incluirPush = true,
}) {
  const idsUnicos = [...new Set((usuarios || []).map(String))].filter(Boolean)
  if (!idsUnicos.length) return []
  if (!transaccional && !esCategoriaValida(categoria)) {
    throw new Error(`Categoría de notificación desconocida: "${categoria}" (ver notificaciones.catalogo.js)`)
  }

  const [usuariosDocs, preferencias, suscripciones, configCanales, rolesConEmail] = await Promise.all([
    // `rol` se trae para decidir el canal correo (ver rolesQuePuedenRecibirEmail).
    Usuario.find({ _id: { $in: idsUnicos } }).select('email estado rol'),
    PreferenciaNotificacion.find({ usuario: { $in: idsUnicos } }),
    // `$ne: 'expirada'` y no `'activa'`: las suscripciones migradas del
    // sigittn viejo no traen el campo `estado` (el default del schema solo se
    // aplica al crear), y `estado: 'activa'` las dejaba fuera para siempre —
    // usuarios con push registrado que jamás recibían nada.
    PushSubscription.find({ usuario: { $in: idsUnicos }, estado: { $ne: 'expirada' } }),
    transaccional ? null : ConfiguracionCanalesNotificacion.findOne({}),
    // Los transaccionales (alertas de seguridad) se saltan el filtro por
    // completo, igual que se saltan preferencias y configuración de canales:
    // si a alguien le intentan conectar una cuenta o se le reinicia la
    // contraseña, tiene que enterarse aunque su rol no sea administrativo.
    transaccional ? null : rolesQuePuedenRecibirEmail(),
  ])

  // Gobernanza de canales del sistema: si el administrador configuró la
  // categoría en 'solo dispositivo' o 'desactivado', o pausó los correos
  // globalmente, ningún evento no transaccional encola envíos por ese canal.
  const emailGlobalActivo = configCanales ? configCanales.emailGlobal?.activo !== false : true
  const pushGlobalActivo = configCanales ? configCanales.pushGlobal?.activo !== false : true
  const canalConfig = configCanales?.canales?.get(categoria)
  const categoriaGlobalActiva = transaccional || (canalConfig ? canalConfig.activo !== false : true)
  const emailCanalPermitido = transaccional || (emailGlobalActivo && (canalConfig ? canalConfig.email !== false : true))
  const pushCanalPermitido = transaccional || (pushGlobalActivo && (canalConfig ? canalConfig.push !== false : true))

  if (!categoriaGlobalActiva) return []

  const preferenciaPorUsuario = new Map(preferencias.map((p) => [String(p.usuario), p]))
  const suscripcionesPorUsuario = new Map()
  for (const sub of suscripciones) {
    const key = String(sub.usuario)
    if (!suscripcionesPorUsuario.has(key)) suscripcionesPorUsuario.set(key, [])
    suscripcionesPorUsuario.get(key).push(sub)
  }

  const filas = []
  // Notificación interna (centro de notificaciones / campana): una fila por
  // destinatario, siempre que la categoría esté activa — a propósito NO
  // sujeta a pref.email.activo/pref.push.activo (esos gobiernan si algo debe
  // interrumpir a la persona fuera de la app; el registro interno es su
  // bandeja dentro de Skynet, y apagar el correo o el push no debería
  // vaciarla). No depende de ningún módulo activable (a diferencia de
  // AvisoIA/avisarIA, ver ia.service.js): por eso vive aquí, en el motor
  // central, no en un módulo que el Super Admin puede apagar.
  const filasInternas = []
  for (const u of usuariosDocs) {
    if (u.estado === 'inactivo') continue
    const id = String(u._id)
    const pref = preferenciaPorUsuario.get(id)
    // Sin documento de preferencias = todo activado (ver
    // models/PreferenciaNotificacion.js): un usuario que nunca abrió la
    // pantalla de configuración igual debe recibir avisos.
    //
    // Cargo administrativo = rol con notificaciones:recibir_email (o Super
    // Admin). Es el ÚLTIMO filtro antes del canal correo, y el más fuerte:
    // ni la preferencia individual del usuario ni un módulo que pase
    // incluirEmail:true pueden abrirlo para un rol no autorizado.
    const rolPuedeEmail = transaccional || rolesConEmail.has(String(u.rol))
    const emailActivo = incluirEmail && emailCanalPermitido && rolPuedeEmail
      && (transaccional || (pref ? pref.email.activo : true))
    const pushActivo = incluirPush && pushCanalPermitido && (transaccional || (pref ? pref.push.activo : true))
    const categoriaActiva = transaccional || !pref || pref.categorias.get(categoria) !== false

    if (!categoriaActiva) continue

    if (pushActivo) {
      for (const sub of suscripcionesPorUsuario.get(id) || []) {
        filas.push({
          usuario: u._id, canal: 'push', categoria, tipo, transaccional, titulo, cuerpo, url,
          pushSubscription: sub._id,
        })
      }
    }
    if (emailActivo && u.email) {
      filas.push({ usuario: u._id, canal: 'email', categoria, tipo, transaccional, titulo, cuerpo, url, emailDestino: u.email })
    }
    filasInternas.push({ usuario: u._id, categoria, tipo, titulo, cuerpo, url })
  }

  // Try/catch propio: sin él, un solo documento inválido en el lote (o un
  // blip transitorio de Atlas) abortaba TODA la función antes de llegar
  // siquiera a la notificación interna de abajo — cero push, cero email, cero
  // campana para TODOS los destinatarios del evento, en silencio (el error
  // solo llegaba a console.error en el llamador). Ver auditoría 2026-08-22.
  let resultado = []
  if (filas.length) {
    try {
      resultado = await EnvioNotificacion.insertMany(filas)
    } catch (err) {
      console.error('No se pudo encolar el envío de notificaciones (push/email):', err.message)
    }
  }

  // Best-effort con su propio try/catch: un fallo escribiendo el registro
  // interno no debe perder ni bloquear los push/email que ya se encolaron
  // arriba (mismo criterio de resiliencia que el resto del archivo).
  if (filasInternas.length) {
    try {
      await Notificacion.insertMany(filasInternas)
    } catch (err) {
      console.error('No se pudo escribir la notificación interna:', err.message)
    }
  }

  return resultado
}

// Backoff entre reintentos cuando un envío falla por algo no concluyente
// (SMTP caído, timeout de red, VAPID mal configurado) — NO aplica a un
// push que devuelve 404/410, que se descarta sin reintento porque ese
// código significa "la suscripción ya no existe en el navegador", no "falló
// esta vez". Exponencial con techo de 30 min: intento 1 -> 1 min, 2 -> 4 min,
// 3 -> 9 min... para no martillar un proveedor caído cada pocos segundos
// durante horas.
//
// Este es un punto de ajuste razonable si el volumen de notificaciones crece
// o si un proveedor SMTP concreto tiene límites de tasa distintos — no hay
// una única respuesta correcta, así que si lo cambias, documenta el motivo
// aquí mismo.
function calcularProximoIntento(intentos) {
  const minutos = Math.min(intentos * intentos, 30)
  return new Date(Date.now() + minutos * 60 * 1000)
}

async function enviarPush(envio) {
  const sub = await PushSubscription.findById(envio.pushSubscription)
  if (!sub || sub.estado === 'expirada') {
    throw Object.assign(new Error('La suscripción push ya no existe'), { descartar: true })
  }
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    // El "tag" de Notifications API NO es una etiqueta cosmética: si dos
    // notificaciones comparten tag, el navegador reemplaza la anterior EN
    // SILENCIO (sin sonido, sin volver a llamar la atención) salvo que se
    // pida renotify:true. Antes se usaba envio.tipo, que casi ningún
    // llamador fija explícitamente y por defecto cae a la categoría
    // ('mantenimiento', 'danos'...) — eso hacía que TODAS las
    // notificaciones de una misma categoría compartieran tag: la primera se
    // veía, cada una después solo reemplazaba a la anterior sin avisar.
    // envio._id es único por definición, así que cada notificación es
    // siempre independiente.
    JSON.stringify({ title: envio.titulo, body: envio.cuerpo, url: envio.url, tag: String(envio._id) })
  )
  sub.ultimoUsoEn = new Date()
  await sub.save()
}

// "TTN · Ticket asignado" en vez de solo "Ticket asignado": un asunto
// corto y sin contexto de remitente se parece al de un correo masivo
// genérico, y además Gmail agrupa mejor los hilos cuando el asunto es
// consistente. No se repite el nombre del módulo (ya va en el cuerpo) para
// no comerse el ancho útil del asunto en móvil.
function asuntoDe(envio) {
  return `TTN · ${envio.titulo}`
}

async function enviarEmail(envio) {
  const datos = {
    titulo: envio.titulo,
    cuerpo: envio.cuerpo,
    url: envio.url,
    usuarioId: envio.usuario,
    transaccional: envio.transaccional,
    categoria: envio.categoria,
    fecha: envio.createdAt,
  }
  await enviarEmailGenerico({
    to: envio.emailDestino,
    subject: asuntoDe(envio),
    html: plantillaNotificacion(datos),
    text: plantillaNotificacionTexto(datos),
    headers: headersListaBaja(datos),
  })
}

async function registrarFallo(envio, err) {
  const esSuscripcionMuerta =
    envio.canal === 'push' && (err.statusCode === 404 || err.statusCode === 410 || err.descartar)

  if (esSuscripcionMuerta && envio.pushSubscription) {
    await PushSubscription.deleteOne({ _id: envio.pushSubscription })
  }

  envio.intentos += 1
  envio.error = String(err.message || 'Error desconocido').slice(0, 500)

  if (esSuscripcionMuerta || envio.intentos >= envio.maxIntentos) {
    envio.estado = 'fallido'
  } else {
    envio.proximoIntentoEn = calcularProximoIntento(envio.intentos)
  }
  await envio.save()
}

async function procesarUno(envio) {
  try {
    if (envio.canal === 'push') await enviarPush(envio)
    else await enviarEmail(envio)
    envio.estado = 'enviado'
    envio.enviadoEn = new Date()
    envio.error = undefined
    await envio.save()
  } catch (err) {
    await registrarFallo(envio, err)
  }
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Arranca los envíos de correo separados por NOTIF_EMAIL_INTERVALO_MS, sin
// esperar a que cada uno termine antes de lanzar el siguiente.
//
// Lo que se espacia son los ARRANQUES, y esa distinción es el punto: el
// proveedor SMTP limita por peticiones por segundo (Resend: 10/s), así que
// acotar la CONCURRENCIA no resuelve nada — cinco envíos en paralelo que
// tarden 50 ms cada uno son 100 peticiones por segundo. Espaciar los
// arranques pone un techo duro de 1000/intervalo por segundo sea cual sea la
// latencia.
//
// Y no se espera el resultado de cada envío antes del siguiente porque eso
// haría que el lote tardara la SUMA de las latencias (14 correos a ~300 ms
// serían más de 5 s, o sea más que el intervalo del worker); así tarda
// intervalo × cantidad, y los envíos se solapan entre sí sin problema.
//
// procesarUno() nunca lanza (atrapa y registra el fallo por dentro); el
// allSettled final es por coherencia con el resto del archivo, no porque se
// espere un rechazo.
async function procesarEmailsEspaciados(envios) {
  const enCurso = []
  for (const [indice, envio] of envios.entries()) {
    if (indice > 0) await dormir(env.NOTIF_EMAIL_INTERVALO_MS)
    enCurso.push(procesarUno(envio))
  }
  await Promise.allSettled(enCurso)
}

// Llamado periódicamente por notificaciones.worker.js. Asume un solo proceso
// Node corriendo el worker (igual que el resto del backend hoy: no hay
// balanceo de carga entre instancias) — con más de una instancia activa,
// dos workers podrían tomar la misma fila pendiente y enviarla duplicada. Si
// el proyecto llega a correr en múltiples instancias, este es el punto que
// necesita un claim atómico (findOneAndUpdate a un estado 'procesando') antes
// de escalar el worker con ellas.
//
// Los dos canales se procesan a ritmos distintos a propósito: el push sigue
// saliendo todo en paralelo (su límite lo pone cada proveedor de navegador
// por endpoint, no una cuota compartida — frenarlo solo retrasaría avisos sin
// ganar nada), mientras el correo va espaciado por el límite de tasa del
// SMTP. Se lanzan a la vez, así que el push de un evento no queda esperando
// a que salga el correo del mismo evento.
export async function procesarPendientes(limite) {
  const ahora = new Date()
  const pendientes = await EnvioNotificacion.find({ estado: 'pendiente', proximoIntentoEn: { $lte: ahora } })
    .sort({ proximoIntentoEn: 1 })
    .limit(limite)

  const push = pendientes.filter((e) => e.canal === 'push')
  const email = pendientes.filter((e) => e.canal !== 'push')

  await Promise.allSettled([...push.map(procesarUno), procesarEmailsEspaciados(email)])
  return pendientes.length
}

export async function obtenerPreferencias(usuarioId) {
  const pref = await PreferenciaNotificacion.findOne({ usuario: usuarioId })
  if (pref) return pref
  return { usuario: usuarioId, email: { activo: true }, push: { activo: true }, categorias: new Map() }
}

export async function obtenerConfiguracionCanales() {
  const config = await ConfiguracionCanalesNotificacion.findOne({})
  const emailGlobal = { activo: config ? config.emailGlobal?.activo !== false : true }
  const pushGlobal = { activo: config ? config.pushGlobal?.activo !== false : true }

  const canales = {}
  for (const cat of CATEGORIAS_NOTIFICACION) {
    const c = config?.canales?.get(cat.key)
    canales[cat.key] = {
      email: c ? c.email !== false : true,
      push: c ? c.push !== false : true,
      activo: c ? c.activo !== false : true,
    }
  }
  return { emailGlobal, pushGlobal, canales }
}

export async function actualizarConfiguracionCanales(datos) {
  const { emailGlobal, pushGlobal, canales } = datos || {}
  const set = {}

  if (typeof emailGlobal?.activo === 'boolean') {
    set['emailGlobal.activo'] = emailGlobal.activo
  }
  if (typeof pushGlobal?.activo === 'boolean') {
    set['pushGlobal.activo'] = pushGlobal.activo
  }

  if (canales && typeof canales === 'object') {
    for (const [clave, valor] of Object.entries(canales)) {
      if (!esCategoriaValida(clave)) {
        throw new ErrorValidacion(`Categoría desconocida: ${clave}`)
      }
      if (typeof valor === 'object' && valor !== null) {
        if (typeof valor.email === 'boolean') set[`canales.${clave}.email`] = valor.email
        if (typeof valor.push === 'boolean') set[`canales.${clave}.push`] = valor.push
        if (typeof valor.activo === 'boolean') set[`canales.${clave}.activo`] = valor.activo
      }
    }
  }

  await ConfiguracionCanalesNotificacion.findOneAndUpdate(
    {},
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  return obtenerConfiguracionCanales()
}

