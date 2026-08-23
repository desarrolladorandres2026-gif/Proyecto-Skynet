import Usuario from '../../models/Usuario.js'
import RegistroDespliegue from '../../models/RegistroDespliegue.js'
import { esEmailValido } from '../../utils/regex.js'
import { enviarEmailGenerico, verificarConfiguracionEmail } from '../../utils/email.js'
import {
  correoPruebaComunicaciones,
  correoPruebaComunicacionesTexto,
  correoDespliegueOficial,
  correoDespliegueOficialTexto,
} from '../../utils/emailPlantillasTransaccionales.js'
import { ErrorAutorizacion, ErrorConflicto } from '../../utils/errores.js'
import { env } from '../../config/env.js'

// Lógica del protocolo de despliegue, invocada ÚNICAMENTE desde las
// herramientas del copiloto declaradas en copiloto.herramientas.js — no hay
// rutas REST propias porque el chat es la única superficie de disparo que
// pide la especificación. Vive dentro de modules/copiloto/ (no como módulo
// propio de nivel superior) siguiendo el mismo criterio que
// copiloto.memoria.js: dueño de su modelo pero sin superficie REST propia.
//
// ── Dos formas de ejecución, a propósito distintas ─────────────────────────
//  - PRUEBA de comunicaciones: se ENCOLA (encolarPruebaComunicaciones) y la
//    ejecuta copiloto.despliegue.worker.js en segundo plano. Es así porque no
//    lleva confirmación: el usuario dice la orden y el lote arrancaría dentro
//    de la propia petición POST /chat, que quedaría ocupada entre 12 y 27 s
//    con ~47 destinatarios (medido: pre-flight SMTP ~1 s con pico de 11 s,
//    más 200-500 ms por envío).
//  - DESPLIEGUE oficial: se ejecuta de forma SÍNCRONA
//    (ejecutarProtocoloDespliegue), porque ya corre en POST /copiloto/confirmar
//    —después del botón—, no en /chat. Ahí nadie está mirando el chat esperando
//    a que Skynet conteste, y devolver el resumen en la misma respuesta es lo
//    que permite mostrar los conteos finales al pulsar el botón.

function verificarEsSuperAdmin(usuarioActor) {
  if (!usuarioActor?.esSuperAdmin) {
    throw new ErrorAutorizacion('Solo un Super Admin puede ejecutar el protocolo de despliegue')
  }
}

// Activos, SIN filtrar esPrueba:false a propósito — mismo criterio ya
// documentado en Usuario.js y en la resolución de audiencia real de
// notificaciones (auditoría 2026-08-22): una cuenta esPrueba:true puede seguir
// siendo la que un empleado real usa a diario, así que excluirla aquí callaría
// a gente real en un envío que es justamente "avísale a todo el mundo".
//
// esEmailValido() se vuelve a aplicar en JS (no solo confiar en el `match` del
// schema) por el mismo motivo de defensa en profundidad que ya documenta
// Usuario.js#email: cualquier dato que haya entrado sin pasar por esa
// validación (migración, script) no debe colarse como destinatario real.
async function obtenerDestinatarios() {
  const activos = await Usuario.find({ estado: 'activo' }).select('email nombre_usuario').lean()
  const destinatarios = activos.filter((u) => esEmailValido(u.email))
  return { destinatarios, totalActivos: activos.length, sinCorreo: activos.length - destinatarios.length }
}

// Un fallo de un destinatario NUNCA detiene el lote: se captura, se cuenta y
// se sigue con el siguiente. Secuencial (no Promise.all/allSettled) a
// propósito: el SMTP de producción por defecto es un proveedor transaccional
// por API (ver .env.example, smtp.resend.com) con límites de tasa, y esto es
// una acción rara y puntual del Super Admin — no la cola de notificaciones,
// que sí procesa en lote grande en segundo plano (notificaciones.worker.js).
async function enviarLote(destinatarios, { subject, html, text }) {
  let exitosos = 0
  const detalleFallos = []
  for (const { email } of destinatarios) {
    try {
      await enviarEmailGenerico({ to: email, subject, html, text })
      exitosos++
    } catch (err) {
      detalleFallos.push({ email, error: err.message })
    }
  }
  return { exitosos, fallidos: detalleFallos.length, detalleFallos }
}

async function verificarConfigOAbortar() {
  try {
    await verificarConfiguracionEmail()
  } catch (err) {
    // Se detiene ANTES de resolver destinatarios o intentar un solo envío:
    // el pedido explícito era "si el correo no está bien configurado,
    // detener la operación y mostrar el problema", no una lista larga de
    // fallos por destinatario que en realidad son un solo problema.
    throw new ErrorConflicto(`El sistema de correo no está configurado correctamente: ${err.message}`)
  }
}

function resultadoPrueba(registro) {
  return {
    estado: registro.estado,
    totalActivos: registro.totalActivos,
    totalDestinatarios: registro.totalDestinatarios,
    sinCorreo: registro.sinCorreo,
    exitosos: registro.exitosos,
    fallidos: registro.fallidos,
    mensaje: mensajePrueba(registro),
  }
}

// Un único redactor para los dos momentos en que se consulta el resultado (el
// tool de consulta y el log del worker), para que no puedan divergir.
function mensajePrueba(registro) {
  const enviados = registro.exitosos ?? 0
  const fallidos = registro.fallidos ?? 0
  const total = registro.totalDestinatarios ?? 0
  switch (registro.estado) {
    case 'pendiente':
      return 'Prueba de comunicaciones encolada. Aún no ha comenzado el envío.'
    case 'procesando':
      return `Prueba de comunicaciones EN CURSO: ${registro.cursor ?? 0} de ${total} destinatarios procesados (${enviados} enviados, ${fallidos} fallidos).`
    case 'sin_destinatarios':
      return 'No hay usuarios activos con correo válido a quienes enviar la prueba.'
    case 'error':
      // Cubre los dos fallos totales: configuración de correo inválida (no
      // salió ni un envío) y todos los destinatarios rebotados.
      return registro.error
        ? `La prueba de comunicaciones NO se pudo realizar: ${registro.error}`
        : `La prueba de comunicaciones FALLÓ: los ${fallidos} envíos fallaron.`
    case 'parcial':
      return `Prueba de comunicaciones completada CON ERRORES: ${enviados} enviados, ${fallidos} fallidos de ${total} destinatarios.`
    default:
      return `Prueba de comunicaciones enviada correctamente a los ${enviados} destinatarios.`
  }
}

/**
 * Fase 1 — ENCOLADO de la prueba de comunicaciones.
 *
 * Antes esta función hacía el trabajo entero (pre-flight SMTP + N envíos
 * secuenciales) dentro de la petición POST /chat. Medido: el pre-flight solo
 * costaba ~1 s de p50 con un pico observado de 11 s, y con ~47 destinatarios
 * el lote mantenía /chat ocupado entre 12 y 27 s. Ahora solo deja el trabajo
 * anotado (UN salto a Mongo) y vuelve: lo demás lo hace
 * copiloto.despliegue.worker.js.
 *
 * El pre-flight NO se eliminó — se movió al worker, donde puede tardar lo que
 * tarde sin que nadie espere delante de una pantalla.
 *
 * Idempotencia del encolado: si ya hay una prueba pendiente o en curso, se
 * devuelve ESA en vez de encolar otra. Repetir la orden (o un doble clic) no
 * puede provocar dos lotes de correos.
 */
export async function encolarPruebaComunicaciones(usuarioActor) {
  verificarEsSuperAdmin(usuarioActor)

  const enCurso = await RegistroDespliegue.findOne({
    tipo: 'prueba',
    estado: { $in: ['pendiente', 'procesando'] },
  }).sort({ creadoEn: -1 })

  if (enCurso) {
    return {
      iniciada: false,
      yaEnCurso: true,
      id: String(enCurso._id),
      estado: enCurso.estado,
      mensaje:
        'Ya hay una prueba de comunicaciones en curso; no se encoló otra. Pregúntame por el resultado en unos segundos.',
    }
  }

  const registro = await RegistroDespliegue.create({
    tipo: 'prueba',
    estado: 'pendiente',
    ejecutadoPor: usuarioActor.id_usuario,
    ejecutadoPorNombre: usuarioActor.nombre_usuario,
  })

  return {
    iniciada: true,
    yaEnCurso: false,
    id: String(registro._id),
    estado: 'pendiente',
    mensaje:
      'Prueba de comunicaciones iniciada. Los correos se están enviando en segundo plano; pregúntame por el resultado en unos segundos.',
  }
}

/** Estado de la última prueba de comunicaciones (la que el worker corrió o corre). */
export async function consultarEstadoPrueba(usuarioActor) {
  verificarEsSuperAdmin(usuarioActor)
  const registro = await RegistroDespliegue.findOne({ tipo: 'prueba' }).sort({ creadoEn: -1 })
  if (!registro) {
    return { existe: false, mensaje: 'Todavía no se ha ejecutado ninguna prueba de comunicaciones.' }
  }
  return { existe: true, ...resultadoPrueba(registro), cursor: registro.cursor, iniciadaEn: registro.creadoEn }
}

// ── Ejecución en segundo plano (la llama SOLO el worker) ────────────────────

// Cuánto puede llevar un trabajo en 'procesando' antes de considerar que el
// proceso que lo tenía murió y otro tick puede retomarlo. Generoso a
// propósito: con SMTP lento, un lote de 47 correos puede tardar minutos, y
// retomarlo antes de tiempo sí produciría envíos duplicados.
const RECLAMO_VENCIDO_MS = 15 * 60 * 1000

/**
 * Toma UN trabajo de prueba pendiente (o uno cuyo reclamo venció) y lo marca
 * como propio de forma atómica.
 *
 * findOneAndUpdate con el estado esperado EN EL FILTRO es el mismo
 * compare-and-swap que usa plataforma.service.js#cerrarMantenimiento: si dos
 * ticks se solapan, solo uno recibe el documento y el otro recibe null.
 */
async function reclamarTrabajo() {
  const ahora = new Date()
  return RegistroDespliegue.findOneAndUpdate(
    {
      tipo: 'prueba',
      $or: [
        { estado: 'pendiente' },
        { estado: 'procesando', procesandoDesde: { $lt: new Date(ahora.getTime() - RECLAMO_VENCIDO_MS) } },
      ],
    },
    { $set: { estado: 'procesando', procesandoDesde: ahora } },
    { new: true, sort: { creadoEn: 1 } }
  )
}

/**
 * Procesa una prueba de comunicaciones ya reclamada.
 *
 * ── Por qué el progreso se persiste destinatario a destinatario ────────────
 * `destinatarios` se congela la primera vez que se toca el trabajo y `cursor`
 * avanza tras CADA envío. Es lo que hace compatibles los dos requisitos que
 * de otro modo se contradicen: si el proceso muere a mitad del lote, al
 * reiniciar se retoma en `cursor` — ni se pierde el resto (no hace falta
 * volver a empezar) ni se reenvía a quien ya recibió.
 *
 * La garantía real es "al menos una vez", no "exactamente una vez": si el
 * proceso muere entre que el SMTP acepta un correo y que se persiste el
 * cursor, ese destinatario recibe la prueba dos veces. Cerrar esa ventana del
 * todo exigiría una transacción con el proveedor SMTP, que no existe. Para un
 * correo de prueba, un duplicado es preferible a una omisión silenciosa.
 */
async function procesarTrabajo(registro) {
  // Pre-flight AQUÍ, no en /chat: es una conexión SMTP real (~1 s de p50, con
  // un pico medido de 11 s) y este es el sitio donde puede costar lo que
  // cueste sin que nadie espere.
  try {
    await verificarConfiguracionEmail()
  } catch (err) {
    registro.estado = 'error'
    registro.error = `El sistema de correo no está configurado correctamente: ${err.message}`
    await registro.save()
    return registro
  }

  // Solo la primera vez: en un reintento tras caída, la lista congelada y el
  // cursor ya están, y volver a resolverlos perdería el progreso.
  if (!registro.destinatarios?.length) {
    const { destinatarios, totalActivos, sinCorreo } = await obtenerDestinatarios()
    registro.destinatarios = destinatarios.map((u) => ({ usuario: u._id, email: u.email }))
    registro.totalActivos = totalActivos
    registro.totalDestinatarios = destinatarios.length
    registro.sinCorreo = sinCorreo
    registro.cursor = 0

    if (destinatarios.length === 0) {
      registro.estado = 'sin_destinatarios'
      await registro.save()
      return registro
    }
    await registro.save()
  }

  const contenido = {
    subject: '[PRUEBA] Skynet — Verificación de comunicaciones',
    html: correoPruebaComunicaciones(),
    text: correoPruebaComunicacionesTexto(),
  }

  // Secuencial a propósito (no Promise.all): el SMTP de producción por
  // defecto es un proveedor transaccional por API con límites de tasa, y el
  // transporter no usa pool — en paralelo, el throttling del proveedor
  // aparecería como fallos de destinatario que no son tales.
  while (registro.cursor < registro.destinatarios.length) {
    const { email } = registro.destinatarios[registro.cursor]
    const actualizacion = { $inc: { cursor: 1 } }
    try {
      await enviarEmailGenerico({ to: email, ...contenido })
      actualizacion.$inc.exitosos = 1
    } catch (err) {
      // Un fallo individual NUNCA detiene el lote: se anota y se sigue.
      actualizacion.$inc.fallidos = 1
      actualizacion.$push = { detalleFallos: { email, error: String(err.message || 'Error desconocido').slice(0, 500) } }
    }
    // Escritura por destinatario: es el precio del progreso durable, y se
    // paga en segundo plano donde no le cuesta el tiempo a nadie.
    await RegistroDespliegue.updateOne({ _id: registro._id }, actualizacion)
    registro.cursor += 1
    if (actualizacion.$inc.exitosos) registro.exitosos = (registro.exitosos ?? 0) + 1
    else registro.fallidos = (registro.fallidos ?? 0) + 1
  }

  // Nunca 'exito' si hubo aunque sea un fallo.
  registro.estado = registro.fallidos === 0 ? 'exito' : registro.exitosos > 0 ? 'parcial' : 'error'
  await RegistroDespliegue.updateOne({ _id: registro._id }, { $set: { estado: registro.estado } })
  return registro
}

/**
 * Un ciclo del worker: reclama y procesa trabajos de prueba pendientes.
 * Devuelve cuántos procesó (0 en el caso normal, que es no haber ninguno).
 */
export async function procesarPruebasPendientes() {
  let procesados = 0
  // Bucle por si quedaron varios encolados (p. ej. tras un reinicio); en el
  // caso normal la primera iteración recibe null y sale sin coste.
  for (;;) {
    const trabajo = await reclamarTrabajo()
    if (!trabajo) return procesados
    const inicio = Date.now()
    const resultado = await procesarTrabajo(trabajo)
    procesados += 1
    console.log(
      `📧  [prueba-comunicaciones] ${resultado.estado} · ${resultado.exitosos ?? 0} enviados, ` +
        `${resultado.fallidos ?? 0} fallidos, ${resultado.sinCorreo ?? 0} sin correo · ${Date.now() - inicio}ms`
    )
  }
}

/** Info para la tarjeta de confirmación de iniciar_protocolo_despliegue. */
export async function obtenerConfirmacionDespliegue(usuarioActor) {
  verificarEsSuperAdmin(usuarioActor)
  const { destinatarios } = await obtenerDestinatarios()
  const previo = await RegistroDespliegue.findOne({ tipo: 'oficial', reclamado: true }).sort({ creadoEn: -1 }).lean()
  return {
    destinatarios: destinatarios.length,
    ejecucionPrevia: previo
      ? { fecha: previo.creadoEn, ejecutadoPorNombre: previo.ejecutadoPorNombre, exitosos: previo.exitosos }
      : null,
  }
}

function estadoLegible(estado) {
  return { exito: '🟢 ONLINE', parcial: '🟡 ONLINE (con fallos)', error: '🔴 NO SE PUDO COMPLETAR' }[estado] || estado
}

function resultadoOficial(registro) {
  const mensaje =
    registro.estado === 'sin_destinatarios'
      ? 'No hay usuarios activos con correo válido a quienes desplegar.'
      : [
          '🛰️ PROTOCOLO DE DESPLIEGUE COMPLETADO',
          `Comunicaciones enviadas: ${registro.exitosos}`,
          `Fallidas: ${registro.fallidos}`,
          `Sin correo: ${registro.sinCorreo}`,
          `Estado: ${estadoLegible(registro.estado)}`,
        ].join('\n')
  return {
    estado: registro.estado,
    totalActivos: registro.totalActivos,
    totalDestinatarios: registro.totalDestinatarios,
    sinCorreo: registro.sinCorreo,
    exitosos: registro.exitosos,
    fallidos: registro.fallidos,
    mensaje,
  }
}

/**
 * Fase 2 — protocolo OFICIAL de despliegue. Solo se alcanza después de que el
 * usuario confirmó con el botón real de la interfaz (ver
 * copiloto.confirmaciones.js / copiloto.service.js#ejecutarConfirmada): esta
 * función en sí NO vuelve a pedir confirmación, ejecuta directamente.
 *
 * Compare-and-swap contra envíos duplicados accidentales (ver el índice único
 * parcial de RegistroDespliegue): se "reclama" un registro ANTES de enviar
 * nada, y esa reclamación es lo único que un segundo intento simultáneo puede
 * chocar contra — nunca hay una ventana de "leer que no hay uno previo" +
 * "enviar" + "escribir" en la que dos llamadas concurrentes puedan colarse
 * las dos.
 */
export async function ejecutarProtocoloDespliegue(usuarioActor, { forzar = false } = {}) {
  verificarEsSuperAdmin(usuarioActor)
  await verificarConfigOAbortar()

  if (forzar) {
    // Liberación EXPLÍCITA: solo ocurre cuando el propio Super Admin, tras
    // ver la advertencia de una corrida previa en la tarjeta de
    // confirmación (ver descripcionConfirmacion en copiloto.herramientas.js),
    // pide reenviar de todas formas.
    await RegistroDespliegue.updateMany({ tipo: 'oficial', reclamado: true }, { $set: { reclamado: false } })
  }

  let claim
  try {
    claim = await RegistroDespliegue.create({
      tipo: 'oficial',
      reclamado: true,
      estado: 'pendiente',
      ejecutadoPor: usuarioActor.id_usuario,
      ejecutadoPorNombre: usuarioActor.nombre_usuario,
    })
  } catch (err) {
    if (err.code === 11000) {
      const previo = await RegistroDespliegue.findOne({ tipo: 'oficial', reclamado: true }).sort({ creadoEn: -1 }).lean()
      throw new ErrorConflicto(
        previo
          ? `El protocolo de despliegue ya se ejecutó el ${previo.creadoEn.toISOString()} (por ${previo.ejecutadoPorNombre}, ${previo.exitosos} enviados). Pídelo de nuevo confirmando explícitamente que quieres reenviarlo.`
          : 'El protocolo de despliegue ya se está ejecutando en este momento.'
      )
    }
    throw err
  }

  const { destinatarios, totalActivos, sinCorreo } = await obtenerDestinatarios()

  if (destinatarios.length === 0) {
    claim.estado = 'sin_destinatarios'
    // Nada se envió: libera el slot para que un intento posterior (tras dar
    // de alta usuarios, por ejemplo) no necesite forzar:true.
    claim.reclamado = false
    claim.totalActivos = totalActivos
    claim.sinCorreo = sinCorreo
    await claim.save()
    return resultadoOficial(claim)
  }

  const loginUrl = `${env.FRONTEND_URL}/login`
  const { exitosos, fallidos, detalleFallos } = await enviarLote(destinatarios, {
    subject: '🚀 Skynet ha sido desplegado — Tu acceso ya está disponible',
    html: correoDespliegueOficial({ loginUrl }),
    text: correoDespliegueOficialTexto({ loginUrl }),
  })

  claim.totalActivos = totalActivos
  claim.totalDestinatarios = destinatarios.length
  claim.sinCorreo = sinCorreo
  claim.exitosos = exitosos
  claim.fallidos = fallidos
  claim.detalleFallos = detalleFallos
  claim.estado = fallidos === 0 ? 'exito' : exitosos > 0 ? 'parcial' : 'error'
  // Solo queda "reclamado" (bloqueando reintentos accidentales) si de verdad
  // salió aunque sea un correo real — un fallo total no debe exigir
  // forzar:true para un reintento tras arreglar la causa.
  claim.reclamado = exitosos > 0
  await claim.save()

  return resultadoOficial(claim)
}
