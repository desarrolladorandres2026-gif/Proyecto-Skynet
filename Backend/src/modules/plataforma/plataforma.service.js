import mongoose from 'mongoose'
import * as repo from './plataforma.repository.js'
import { aEstadoPublico, aEstadoAdmin, aEventoPublico } from './plataforma.dto.js'
import { ErrorConflicto, ErrorValidacion } from '../../utils/errores.js'
import { instanteLocal } from '../../utils/fechas.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { env } from '../../config/env.js'
import {
  avisarProgramado,
  avisarInicioProximo,
  avisarInicio,
  avisarDisponible,
} from './plataforma.notificaciones.js'

// ── Caché del estado (hot path) ─────────────────────────────────────────────
// El middleware de bloqueo corre en CADA petición de la API. Consultar Mongo
// ahí duplicaría el costo que ya paga verificarToken, y encima en el 99.9% de
// los casos para leer "operativa".
//
// TTL corto (5s, contra los 30s de sistema.service.js) porque aquí el desfase
// no es cosmético: son segundos en los que un proceso distinto podría seguir
// dejando entrar gente a una plataforma que ya está en mantenimiento. En este
// proceso el TTL casi nunca se usa — toda mutación invalida la caché al
// instante; el TTL existe para el día en que haya más de una instancia.
const CACHE_TTL_MS = 5_000
let cacheDoc = null
let cacheExpira = 0

async function docEstado() {
  if (!cacheDoc || Date.now() > cacheExpira) {
    cacheDoc = await repo.obtenerEstado()
    cacheExpira = Date.now() + CACHE_TTL_MS
  }
  return cacheDoc
}

// Fuerza la relectura desde Mongo en la próxima consulta. Mismo papel que
// invalidarCacheModulos() en sistema.service.js: hace falta cuando el
// documento cambia por una vía que este proceso no controla — un script de
// mantenimiento tocando la colección, o el borrado entre casos de la suite de
// pruebas. Las mutaciones normales del módulo no lo necesitan: cada una
// refresca la caché con el documento que devuelve su propio CAS.
export function invalidarCacheEstado() {
  cacheDoc = null
  cacheExpira = 0
}

function refrescarCache(doc) {
  cacheDoc = doc
  cacheExpira = Date.now() + CACHE_TTL_MS
}

// ── Estado EFECTIVO ─────────────────────────────────────────────────────────
// El worker persiste las transiciones, pero NO es la autoridad sobre la hora:
// entre dos ticks pueden pasar hasta PLATAFORMA_WORKER_INTERVALO_MS. Si el
// bloqueo dependiera solo del campo `status` persistido, habría una ventana en
// la que el mantenimiento ya empezó según el aviso que leyó todo el mundo y la
// plataforma sigue abierta — y otra, al final, en la que ya terminó y la gente
// sigue viendo la pantalla de mantenimiento.
//
// Por eso el estado que se APLICA se deriva del reloj en cada lectura, y el
// worker solo se encarga de persistirlo, auditarlo y notificarlo. El bloqueo
// es exacto al segundo aunque el worker esté atrasado o caído.
export function derivarEstado(doc, ahora = new Date()) {
  if (doc.status === 'programado' && doc.scheduledStart && doc.scheduledStart <= ahora) {
    // Ventana ya vencida por completo (típico tras un reinicio largo del VPS):
    // el mantenimiento nunca llega a "activo", va directo a operativa.
    if (doc.scheduledEnd && doc.scheduledEnd <= ahora) return 'operativa'
    return 'en_mantenimiento'
  }
  if (doc.status === 'en_mantenimiento' && doc.scheduledEnd && doc.scheduledEnd <= ahora) {
    return 'operativa'
  }
  return doc.status
}

// Lo que consume el middleware. Devuelve el documento con el `status` ya
// derivado, para que quien lo use no tenga que acordarse de derivarlo.
export async function estadoEfectivo() {
  const doc = await docEstado()
  const status = derivarEstado(doc, new Date())
  return { doc, status, enMantenimiento: status === 'en_mantenimiento' }
}

export async function estadoPublico() {
  const { doc, status } = await estadoEfectivo()
  return { ...aEstadoPublico(doc), status, enabled: status === 'en_mantenimiento' }
}

export async function estadoAdmin() {
  const { doc, status } = await estadoEfectivo()
  return { ...aEstadoAdmin(doc), status, enabled: status === 'en_mantenimiento' }
}

// ── Validación de entrada ───────────────────────────────────────────────────
// Las fechas llegan como el string de un <input type="datetime-local">
// ("2026-08-22T22:00"), que NO trae offset. instanteLocal() lo ancla al huso
// del Terminal (-05:00) en vez de dejar que Node lo interprete en la zona del
// proceso — que en el VPS es UTC y desplazaría todo el mantenimiento 5 horas.
function parsearFecha(valor, campo) {
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor !== 'string') throw new ErrorValidacion(`${campo} tiene un formato inválido`)
  const fecha = instanteLocal(valor)
  if (!fecha) throw new ErrorValidacion(`${campo} tiene un formato inválido`)
  return fecha
}

function texto(valor, campo, max) {
  if (valor === undefined || valor === null) return ''
  if (typeof valor !== 'string') throw new ErrorValidacion(`${campo} debe ser texto`)
  const limpio = valor.trim()
  if (limpio.length > max) throw new ErrorValidacion(`${campo} no puede superar ${max} caracteres`)
  return limpio
}

function validarVentana(inicio, fin, { exigirFuturo }) {
  if (!inicio) throw new ErrorValidacion('Debes indicar la fecha y hora de inicio')
  // Margen de 60s: el administrador tarda unos segundos en llenar el
  // formulario y darle a guardar, y rechazar por eso un inicio "dentro de 30
  // segundos" sería un error molesto y sin ningún beneficio.
  if (exigirFuturo && inicio.getTime() < Date.now() - 60_000) {
    throw new ErrorValidacion('La fecha de inicio no puede estar en el pasado')
  }
  if (fin && fin <= inicio) {
    throw new ErrorValidacion('La hora de finalización debe ser posterior a la de inicio')
  }
}

function actorDatos(actor) {
  return { id: actor?.id_usuario || null, nombre: actor?.nombre_usuario || 'Sistema' }
}

async function auditar(actor, accion, descripcion) {
  if (!actor) return
  await registrarAuditoria({
    usuario: actor,
    accion,
    modulo: 'plataforma',
    entidad: 'EstadoPlataforma',
    descripcion,
  })
}

// Campos que devuelven el singleton a reposo. Se centraliza para que cancelar
// y finalizar no puedan divergir: olvidar limpiar `enabled` en uno de los dos
// caminos dejaría la plataforma bloqueada sin que ninguna pantalla lo diga.
function estadoOperativo(extra = {}) {
  return {
    status: 'operativa',
    enabled: false,
    scheduledStart: null,
    scheduledEnd: null,
    reason: '',
    message: '',
    mantenimientoId: null,
    avisoPrevioEnviado: false,
    notificacionInicioEnviada: false,
    ...extra,
  }
}

// ── Casos de uso administrativos ────────────────────────────────────────────

export async function programar(datos, actor) {
  const { doc, status } = await estadoEfectivo()
  if (status === 'en_mantenimiento') {
    throw new ErrorConflicto('La plataforma ya está en mantenimiento. Finalízalo antes de programar uno nuevo.')
  }
  if (status === 'programado') {
    throw new ErrorConflicto('Ya existe un mantenimiento programado. Edítalo o cancélalo antes de crear otro.')
  }

  const scheduledStart = parsearFecha(datos.scheduledStart, 'La fecha de inicio')
  const scheduledEnd = parsearFecha(datos.scheduledEnd, 'La fecha de finalización')
  validarVentana(scheduledStart, scheduledEnd, { exigirFuturo: true })

  const { id, nombre } = actorDatos(actor)
  const mantenimientoId = new mongoose.Types.ObjectId()

  // CAS contra el estado que acabamos de leer: si otro administrador programó
  // algo entre nuestra lectura y esta escritura, el filtro no encaja y
  // devolvemos conflicto en vez de pisar su configuración en silencio.
  const actualizado = await repo.transicionar(
    { status: 'operativa' },
    {
      $set: {
        status: 'programado',
        enabled: false,
        scheduledStart,
        scheduledEnd,
        reason: texto(datos.reason, 'El motivo', 200),
        message: texto(datos.message, 'El mensaje', 1000),
        createdBy: id,
        createdByNombre: nombre,
        mantenimientoId,
        iniciadoEn: null,
        finalizadoEn: null,
        avisoPrevioEnviado: false,
        notificacionInicioEnviada: false,
        notificacionFinEnviada: false,
      },
    }
  )
  if (!actualizado) {
    throw new ErrorConflicto('Otro administrador cambió el estado de la plataforma. Recarga la pantalla.')
  }
  refrescarCache(actualizado)

  await repo.registrarEvento({
    mantenimientoId,
    tipo: 'programado',
    usuario: id,
    usuarioNombre: nombre,
    reason: actualizado.reason,
    message: actualizado.message,
    scheduledStart,
    scheduledEnd,
  })
  await auditar(actor, 'programar_mantenimiento', `Mantenimiento programado para ${scheduledStart.toISOString()}`)

  // Best-effort: si el envío falla, el mantenimiento QUEDA programado igual.
  // Perder el aviso es malo; perder la programación porque el SMTP estaba
  // caído sería peor.
  try {
    await avisarProgramado(actualizado)
  } catch (err) {
    console.error('No se pudo notificar el mantenimiento programado:', err.message)
  }

  return estadoAdmin()
}

export async function editarProgramado(datos, actor) {
  const { doc, status } = await estadoEfectivo()
  if (status !== 'programado') {
    throw new ErrorConflicto('Solo se puede editar un mantenimiento programado que aún no haya comenzado')
  }

  const scheduledStart = parsearFecha(datos.scheduledStart, 'La fecha de inicio')
  const scheduledEnd = parsearFecha(datos.scheduledEnd, 'La fecha de finalización')
  validarVentana(scheduledStart, scheduledEnd, { exigirFuturo: true })

  const { id, nombre } = actorDatos(actor)
  const movioElInicio = !doc.scheduledStart || doc.scheduledStart.getTime() !== scheduledStart.getTime()

  const actualizado = await repo.transicionar(
    { status: 'programado' },
    {
      $set: {
        scheduledStart,
        scheduledEnd,
        reason: texto(datos.reason, 'El motivo', 200),
        message: texto(datos.message, 'El mensaje', 1000),
        // Mover el inicio rearma el aviso previo: si la ventana se corrió de
        // las 10pm a las 2am, el "faltan 15 minutos" que ya salió dejó de ser
        // cierto y hay que volver a avisar a la hora nueva.
        ...(movioElInicio ? { avisoPrevioEnviado: false } : {}),
      },
    }
  )
  if (!actualizado) {
    throw new ErrorConflicto('El mantenimiento ya no está programado. Recarga la pantalla.')
  }
  refrescarCache(actualizado)

  await repo.registrarEvento({
    mantenimientoId: actualizado.mantenimientoId,
    tipo: 'editado',
    usuario: id,
    usuarioNombre: nombre,
    reason: actualizado.reason,
    message: actualizado.message,
    scheduledStart,
    scheduledEnd,
  })
  await auditar(actor, 'editar_mantenimiento', `Mantenimiento reprogramado para ${scheduledStart.toISOString()}`)

  return estadoAdmin()
}

export async function cancelarProgramado(actor) {
  const { doc, status } = await estadoEfectivo()
  if (status !== 'programado') {
    throw new ErrorConflicto('No hay un mantenimiento programado que cancelar')
  }
  const mantenimientoId = doc.mantenimientoId
  const { id, nombre } = actorDatos(actor)

  const actualizado = await repo.transicionar({ status: 'programado' }, { $set: estadoOperativo() })
  if (!actualizado) throw new ErrorConflicto('El mantenimiento ya no está programado. Recarga la pantalla.')
  refrescarCache(actualizado)

  await repo.registrarEvento({
    mantenimientoId,
    tipo: 'cancelado',
    usuario: id,
    usuarioNombre: nombre,
    reason: doc.reason,
    message: doc.message,
    scheduledStart: doc.scheduledStart,
    scheduledEnd: doc.scheduledEnd,
  })
  await auditar(actor, 'cancelar_mantenimiento', 'Mantenimiento programado cancelado')

  return estadoAdmin()
}

export async function activarAhora(datos, actor) {
  const { doc, status } = await estadoEfectivo()
  if (status === 'en_mantenimiento') {
    throw new ErrorConflicto('La plataforma ya está en mantenimiento')
  }

  const scheduledEnd = parsearFecha(datos.scheduledEnd, 'La fecha de finalización')
  const ahora = new Date()
  if (scheduledEnd && scheduledEnd <= ahora) {
    throw new ErrorValidacion('La hora de finalización debe ser posterior a este momento')
  }

  const { id, nombre } = actorDatos(actor)
  // Se conserva el ciclo si ya venía uno programado (el administrador adelantó
  // su propio mantenimiento); si no, se abre uno nuevo.
  const mantenimientoId = doc.mantenimientoId || new mongoose.Types.ObjectId()

  const actualizado = await repo.transicionar(
    { status: { $in: ['operativa', 'programado'] } },
    {
      $set: {
        status: 'en_mantenimiento',
        enabled: true,
        scheduledStart: ahora,
        scheduledEnd,
        reason: texto(datos.reason, 'El motivo', 200) || doc.reason || '',
        message: texto(datos.message, 'El mensaje', 1000) || doc.message || '',
        createdBy: id,
        createdByNombre: nombre,
        mantenimientoId,
        iniciadoEn: ahora,
        finalizadoEn: null,
        notificacionInicioEnviada: true,
        notificacionFinEnviada: false,
      },
    }
  )
  if (!actualizado) {
    throw new ErrorConflicto('Otro administrador cambió el estado de la plataforma. Recarga la pantalla.')
  }
  refrescarCache(actualizado)

  await repo.registrarEvento({
    mantenimientoId,
    tipo: 'iniciado',
    usuario: id,
    usuarioNombre: nombre,
    reason: actualizado.reason,
    message: actualizado.message,
    scheduledStart: ahora,
    scheduledEnd,
  })
  await auditar(actor, 'activar_mantenimiento', `Mantenimiento activado inmediatamente (estado anterior: ${status})`)

  try {
    await avisarInicio(actualizado)
  } catch (err) {
    console.error('No se pudo notificar el inicio del mantenimiento:', err.message)
  }

  return estadoAdmin()
}

export async function finalizar(actor) {
  const { status } = await estadoEfectivo()
  if (status !== 'en_mantenimiento') {
    throw new ErrorConflicto('La plataforma no está en mantenimiento')
  }

  const resultado = await cerrarMantenimiento({ tipoEvento: 'finalizado', actor })
  if (!resultado) {
    throw new ErrorConflicto('El mantenimiento ya fue finalizado. Recarga la pantalla.')
  }
  await auditar(actor, 'finalizar_mantenimiento', 'Mantenimiento finalizado manualmente')

  return estadoAdmin()
}

// ── Cierre del ciclo (manual y automático comparten este camino) ────────────
// El CAS incluye `notificacionFinEnviada: false` en el FILTRO. Esa condición
// es lo que hace que la notificación "Skynet ya está disponible" salga
// EXACTAMENTE UNA VEZ por mantenimiento:
//
//   - dos ticks del worker en paralelo -> solo uno encuentra la bandera abajo;
//   - el botón "Finalizar" pulsado justo cuando el worker detecta el fin ->
//     igual, uno de los dos recibe null y no notifica;
//   - el backend se reinicia después de cerrar -> la bandera ya quedó
//     persistida en Mongo, así que el proceso nuevo no vuelve a avisar.
//
// Devuelve el documento actualizado, o null si otro camino ya cerró el ciclo.
async function cerrarMantenimiento({ tipoEvento, actor }) {
  const ahora = new Date()
  const previo = await repo.obtenerEstado()
  const mantenimientoId = previo.mantenimientoId
  const iniciadoEn = previo.iniciadoEn

  const actualizado = await repo.transicionar(
    { status: 'en_mantenimiento', notificacionFinEnviada: false },
    { $set: estadoOperativo({ finalizadoEn: ahora, notificacionFinEnviada: true }) }
  )
  if (!actualizado) return null
  refrescarCache(actualizado)

  const { id, nombre } = actorDatos(actor)

  await repo.registrarEvento({
    mantenimientoId: mantenimientoId || new mongoose.Types.ObjectId(),
    tipo: tipoEvento,
    usuario: actor ? id : null,
    usuarioNombre: actor ? nombre : 'Sistema',
    reason: previo.reason,
    message: previo.message,
    scheduledStart: previo.scheduledStart,
    scheduledEnd: previo.scheduledEnd,
    duracionMinutos: iniciadoEn ? Math.round((ahora - iniciadoEn) / 60000) : null,
  })

  try {
    await avisarDisponible()
  } catch (err) {
    console.error('No se pudo notificar la disponibilidad de la plataforma:', err.message)
  }

  return actualizado
}

export async function historial({ pagina = 1, porPagina = 20 } = {}) {
  const { eventos, total } = await repo.listarEventos({ pagina, porPagina })
  return {
    eventos: eventos.map(aEventoPublico),
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
  }
}

// ── Transiciones automáticas (worker) ───────────────────────────────────────
// Idempotente y segura de ejecutar en cualquier momento y desde cualquier
// proceso: cada rama es un CAS. Se llama en cada tick Y una vez al arrancar
// (ver index.js), de modo que un mantenimiento cuya hora pasó mientras el VPS
// estaba caído se resuelve al instante en vez de esperar al primer intervalo.
export async function evaluarTransiciones() {
  const doc = await repo.obtenerEstado()
  refrescarCache(doc)
  const ahora = new Date()

  // 1. Ventana vencida por completo (el proceso estuvo caído todo el
  //    mantenimiento): no tiene sentido anunciar un inicio que nadie va a
  //    vivir, se cierra el ciclo directo.
  if (
    doc.status === 'programado' &&
    doc.scheduledStart && doc.scheduledStart <= ahora &&
    doc.scheduledEnd && doc.scheduledEnd <= ahora
  ) {
    const cerrado = await repo.transicionar(
      { status: 'programado', notificacionFinEnviada: false },
      { $set: estadoOperativo({ finalizadoEn: ahora, notificacionFinEnviada: true }) }
    )
    if (cerrado) {
      refrescarCache(cerrado)
      await repo.registrarEvento({
        mantenimientoId: doc.mantenimientoId || new mongoose.Types.ObjectId(),
        tipo: 'finalizado_automatico',
        usuarioNombre: 'Sistema',
        reason: doc.reason,
        message: doc.message,
        scheduledStart: doc.scheduledStart,
        scheduledEnd: doc.scheduledEnd,
      })
      try {
        await avisarDisponible()
      } catch (err) {
        console.error('No se pudo notificar la disponibilidad de la plataforma:', err.message)
      }
    }
    return
  }

  // 2. Aviso previo ("falta poco"). La bandera en el filtro evita que se
  //    repita en cada tick durante toda la antesala.
  if (
    doc.status === 'programado' &&
    !doc.avisoPrevioEnviado &&
    doc.scheduledStart &&
    doc.scheduledStart > ahora &&
    doc.scheduledStart - ahora <= env.PLATAFORMA_AVISO_PREVIO_MIN * 60_000
  ) {
    const marcado = await repo.transicionar(
      { status: 'programado', avisoPrevioEnviado: false },
      { $set: { avisoPrevioEnviado: true } }
    )
    if (marcado) {
      refrescarCache(marcado)
      try {
        await avisarInicioProximo(marcado, env.PLATAFORMA_AVISO_PREVIO_MIN)
      } catch (err) {
        console.error('No se pudo notificar el inicio próximo del mantenimiento:', err.message)
      }
    }
  }

  // 3. Inicio automático a la hora programada.
  if (doc.status === 'programado' && doc.scheduledStart && doc.scheduledStart <= ahora) {
    const iniciado = await repo.transicionar(
      { status: 'programado', notificacionInicioEnviada: false },
      {
        $set: {
          status: 'en_mantenimiento',
          enabled: true,
          iniciadoEn: ahora,
          notificacionInicioEnviada: true,
        },
      }
    )
    if (iniciado) {
      refrescarCache(iniciado)
      await repo.registrarEvento({
        mantenimientoId: iniciado.mantenimientoId || new mongoose.Types.ObjectId(),
        tipo: 'iniciado_automatico',
        usuarioNombre: 'Sistema',
        reason: iniciado.reason,
        message: iniciado.message,
        scheduledStart: iniciado.scheduledStart,
        scheduledEnd: iniciado.scheduledEnd,
      })
      try {
        await avisarInicio(iniciado)
      } catch (err) {
        console.error('No se pudo notificar el inicio del mantenimiento:', err.message)
      }
    }
    return
  }

  // 4. Finalización automática al llegar scheduledEnd.
  if (doc.status === 'en_mantenimiento' && doc.scheduledEnd && doc.scheduledEnd <= ahora) {
    await cerrarMantenimiento({ tipoEvento: 'finalizado_automatico', actor: null })
  }
}
