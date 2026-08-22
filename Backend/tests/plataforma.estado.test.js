import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { env } from '../src/config/env.js'
import EstadoPlataforma from '../src/models/EstadoPlataforma.js'
import EventoPlataforma from '../src/models/EventoPlataforma.js'

// Se intercepta el módulo de notificaciones para poder AFIRMAR cuántas veces
// se avisó de cada cosa. Es el núcleo del requisito de idempotencia ("la
// notificación de finalización debe ejecutarse una sola vez por cada
// mantenimiento"), y sin este espía solo se podría comprobar que no revienta.
vi.mock('../src/modules/plataforma/plataforma.notificaciones.js', () => ({
  avisarProgramado: vi.fn(async () => []),
  avisarInicioProximo: vi.fn(async () => []),
  avisarInicio: vi.fn(async () => []),
  avisarDisponible: vi.fn(async () => []),
}))

import {
  avisarProgramado,
  avisarInicioProximo,
  avisarInicio,
  avisarDisponible,
} from '../src/modules/plataforma/plataforma.notificaciones.js'
import {
  programar,
  editarProgramado,
  cancelarProgramado,
  activarAhora,
  finalizar,
  evaluarTransiciones,
  estadoEfectivo,
  estadoPublico,
  historial,
  derivarEstado,
  invalidarCacheEstado,
} from '../src/modules/plataforma/plataforma.service.js'

const ACTOR = { id_usuario: new mongoose.Types.ObjectId(), nombre_usuario: 'admin.pruebas' }

// Fecha en el formato exacto que manda un <input type="datetime-local">:
// sin zona horaria. Es la entrada real del formulario, no un ISO completo.
function datetimeLocal(desplazamientoMs) {
  const d = new Date(Date.now() + desplazamientoMs)
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const g = (t) => partes.find((p) => p.type === t).value
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

// Escribe el singleton directamente, saltándose los casos de uso: sirve para
// montar escenarios que en la vida real solo produce el paso del tiempo (una
// ventana cuya hora ya venció mientras el servidor estaba apagado).
async function sembrarEstado(campos) {
  await EstadoPlataforma.deleteMany({})
  await EstadoPlataforma.create({ clave: 'global', ...campos })
  invalidarCacheEstado()
}

beforeEach(() => {
  vi.clearAllMocks()
  // La caché en memoria sobrevive al borrado de colecciones que hace
  // tests/setup.js entre casos: sin esto, un test leería el estado del
  // anterior.
  invalidarCacheEstado()
})

describe('Estado de plataforma — ciclo de vida', () => {
  it('arranca operativa y crea el singleton al primer acceso', async () => {
    const estado = await estadoPublico()
    expect(estado.status).toBe('operativa')
    expect(estado.enabled).toBe(false)
    expect(await EstadoPlataforma.countDocuments()).toBe(1)
  })

  it('programa un mantenimiento futuro y avisa una sola vez', async () => {
    const estado = await programar(
      {
        scheduledStart: datetimeLocal(2 * 60 * 60 * 1000),
        scheduledEnd: datetimeLocal(3 * 60 * 60 * 1000),
        reason: 'Mejora de rendimiento',
        message: 'Skynet estará fuera de servicio por una hora.',
      },
      ACTOR
    )

    expect(estado.status).toBe('programado')
    expect(estado.enabled).toBe(false)
    expect(estado.reason).toBe('Mejora de rendimiento')
    expect(estado.createdByNombre).toBe('admin.pruebas')
    expect(avisarProgramado).toHaveBeenCalledTimes(1)
    // Programar NO debe anunciar todavía el inicio.
    expect(avisarInicio).not.toHaveBeenCalled()
  })

  it('rechaza programar dos mantenimientos a la vez', async () => {
    await programar({ scheduledStart: datetimeLocal(60 * 60 * 1000) }, ACTOR)
    await expect(programar({ scheduledStart: datetimeLocal(2 * 60 * 60 * 1000) }, ACTOR)).rejects.toThrow(
      /Ya existe un mantenimiento programado/
    )
  })

  it('rechaza una fecha de inicio en el pasado y un fin anterior al inicio', async () => {
    await expect(programar({ scheduledStart: datetimeLocal(-60 * 60 * 1000) }, ACTOR)).rejects.toThrow(
      /no puede estar en el pasado/
    )
    await expect(
      programar(
        { scheduledStart: datetimeLocal(2 * 60 * 60 * 1000), scheduledEnd: datetimeLocal(60 * 60 * 1000) },
        ACTOR
      )
    ).rejects.toThrow(/posterior a la de inicio/)
  })

  it('edita la programación y rearma el aviso previo si se mueve el inicio', async () => {
    await programar({ scheduledStart: datetimeLocal(20 * 60 * 1000) }, ACTOR)
    // Simula que el aviso de "faltan 15 minutos" ya salió.
    await EstadoPlataforma.updateOne({ clave: 'global' }, { $set: { avisoPrevioEnviado: true } })
    invalidarCacheEstado()

    await editarProgramado({ scheduledStart: datetimeLocal(5 * 60 * 60 * 1000), reason: 'Reprogramado' }, ACTOR)

    const doc = await EstadoPlataforma.findOne({ clave: 'global' })
    // El aviso viejo dejó de ser cierto al correr la ventana: debe poder
    // volver a mandarse a la hora nueva.
    expect(doc.avisoPrevioEnviado).toBe(false)
    expect(doc.reason).toBe('Reprogramado')
  })

  it('cancela un mantenimiento programado y vuelve a operativa', async () => {
    await programar({ scheduledStart: datetimeLocal(60 * 60 * 1000) }, ACTOR)
    const estado = await cancelarProgramado(ACTOR)

    expect(estado.status).toBe('operativa')
    expect(estado.scheduledStart).toBeNull()
    // Cancelar no es finalizar: nadie llegó a quedarse sin plataforma, así que
    // no corresponde anunciar que "ya está disponible".
    expect(avisarDisponible).not.toHaveBeenCalled()
    expect(await EventoPlataforma.countDocuments({ tipo: 'cancelado' })).toBe(1)
  })

  it('activa el mantenimiento de inmediato y notifica el inicio', async () => {
    const estado = await activarAhora({ reason: 'Incidente', message: 'Volvemos pronto' }, ACTOR)

    expect(estado.status).toBe('en_mantenimiento')
    expect(estado.enabled).toBe(true)
    expect(estado.iniciadoEn).toBeTruthy()
    expect(avisarInicio).toHaveBeenCalledTimes(1)
    expect(await EventoPlataforma.countDocuments({ tipo: 'iniciado' })).toBe(1)
  })

  it('finaliza manualmente, vuelve a operativa y avisa que ya está disponible', async () => {
    await activarAhora({}, ACTOR)
    const estado = await finalizar(ACTOR)

    expect(estado.status).toBe('operativa')
    expect(estado.enabled).toBe(false)
    expect(avisarDisponible).toHaveBeenCalledTimes(1)

    const evento = await EventoPlataforma.findOne({ tipo: 'finalizado' })
    expect(evento).toBeTruthy()
    expect(evento.usuarioNombre).toBe('admin.pruebas')
  })

  it('no permite finalizar si la plataforma no está en mantenimiento', async () => {
    await expect(finalizar(ACTOR)).rejects.toThrow(/no está en mantenimiento/)
  })
})

describe('Estado de plataforma — zona horaria', () => {
  it('interpreta el datetime-local en la hora del Terminal, no en la del proceso', async () => {
    // El caso que rompía todo: un ISO sin offset lo interpreta Node en la zona
    // del PROCESO. En el VPS (UTC) "22:00" se guardaba como 22:00Z, es decir
    // las 5 de la tarde en Neiva — cinco horas antes de lo anunciado.
    await programar({ scheduledStart: '2027-03-15T22:00', scheduledEnd: '2027-03-15T23:30' }, ACTOR)

    const doc = await EstadoPlataforma.findOne({ clave: 'global' })
    // Colombia es UTC-5 fijo (sin horario de verano desde 1993).
    expect(doc.scheduledStart.toISOString()).toBe('2027-03-16T03:00:00.000Z')
    expect(doc.scheduledEnd.toISOString()).toBe('2027-03-16T04:30:00.000Z')
  })
})

describe('Estado de plataforma — el reloj manda sobre el worker', () => {
  it('bloquea en cuanto pasa la hora de inicio, aunque el worker no haya corrido', async () => {
    await sembrarEstado({
      status: 'programado',
      enabled: false,
      scheduledStart: new Date(Date.now() - 1000),
      scheduledEnd: new Date(Date.now() + 60 * 60 * 1000),
      mantenimientoId: new mongoose.Types.ObjectId(),
    })

    // Sin llamar a evaluarTransiciones(): el estado persistido sigue siendo
    // 'programado' y aun así la plataforma ya debe estar cerrada. Esto es lo
    // que elimina la ventana de hasta 20s en la que el worker va atrasado.
    const { status, enMantenimiento } = await estadoEfectivo()
    expect(status).toBe('en_mantenimiento')
    expect(enMantenimiento).toBe(true)
  })

  it('libera en cuanto pasa la hora de fin, aunque el worker no haya corrido', async () => {
    await sembrarEstado({
      status: 'en_mantenimiento',
      enabled: true,
      scheduledStart: new Date(Date.now() - 2 * 60 * 60 * 1000),
      scheduledEnd: new Date(Date.now() - 1000),
      mantenimientoId: new mongoose.Types.ObjectId(),
    })

    const { enMantenimiento } = await estadoEfectivo()
    expect(enMantenimiento).toBe(false)
  })

  it('un mantenimiento sin hora de fin no se libera solo', async () => {
    const doc = {
      status: 'en_mantenimiento',
      scheduledStart: new Date(Date.now() - 5 * 60 * 60 * 1000),
      scheduledEnd: null,
    }
    expect(derivarEstado(doc)).toBe('en_mantenimiento')
  })
})

describe('Estado de plataforma — transiciones automáticas', () => {
  it('inicia solo al llegar la hora y notifica una vez', async () => {
    await sembrarEstado({
      status: 'programado',
      scheduledStart: new Date(Date.now() - 1000),
      scheduledEnd: new Date(Date.now() + 60 * 60 * 1000),
      mantenimientoId: new mongoose.Types.ObjectId(),
    })

    await evaluarTransiciones()

    const doc = await EstadoPlataforma.findOne({ clave: 'global' })
    expect(doc.status).toBe('en_mantenimiento')
    expect(doc.enabled).toBe(true)
    expect(avisarInicio).toHaveBeenCalledTimes(1)
    expect(await EventoPlataforma.countDocuments({ tipo: 'iniciado_automatico' })).toBe(1)
  })

  it('manda el aviso previo una sola vez aunque el worker corra muchas veces', async () => {
    await sembrarEstado({
      status: 'programado',
      // Dentro de la ventana de aviso previo (15 min por defecto).
      scheduledStart: new Date(Date.now() + 10 * 60 * 1000),
      mantenimientoId: new mongoose.Types.ObjectId(),
    })

    await evaluarTransiciones()
    await evaluarTransiciones()
    await evaluarTransiciones()

    expect(avisarInicioProximo).toHaveBeenCalledTimes(1)
  })

  it('finaliza solo al llegar la hora y avisa que está disponible una vez', async () => {
    await sembrarEstado({
      status: 'en_mantenimiento',
      enabled: true,
      iniciadoEn: new Date(Date.now() - 30 * 60 * 1000),
      scheduledStart: new Date(Date.now() - 30 * 60 * 1000),
      scheduledEnd: new Date(Date.now() - 1000),
      mantenimientoId: new mongoose.Types.ObjectId(),
      notificacionInicioEnviada: true,
    })

    await evaluarTransiciones()

    const doc = await EstadoPlataforma.findOne({ clave: 'global' })
    expect(doc.status).toBe('operativa')
    expect(doc.enabled).toBe(false)
    expect(avisarDisponible).toHaveBeenCalledTimes(1)

    const evento = await EventoPlataforma.findOne({ tipo: 'finalizado_automatico' })
    expect(evento.usuarioNombre).toBe('Sistema')
    // Duración REAL, no la programada.
    expect(evento.duracionMinutos).toBeGreaterThanOrEqual(29)
  })
})

describe('Estado de plataforma — idempotencia y concurrencia', () => {
  it('no repite el aviso de disponible aunque varios procesos detecten el fin a la vez', async () => {
    await sembrarEstado({
      status: 'en_mantenimiento',
      enabled: true,
      iniciadoEn: new Date(Date.now() - 10 * 60 * 1000),
      scheduledStart: new Date(Date.now() - 10 * 60 * 1000),
      scheduledEnd: new Date(Date.now() - 1000),
      mantenimientoId: new mongoose.Types.ObjectId(),
      notificacionInicioEnviada: true,
    })

    // Cinco evaluaciones EN PARALELO: es el escenario de varias instancias de
    // Node detrás de nginx, o de un tick que se solapa con el anterior.
    await Promise.all([
      evaluarTransiciones(),
      evaluarTransiciones(),
      evaluarTransiciones(),
      evaluarTransiciones(),
      evaluarTransiciones(),
    ])

    expect(avisarDisponible).toHaveBeenCalledTimes(1)
    expect(await EventoPlataforma.countDocuments({ tipo: 'finalizado_automatico' })).toBe(1)
  })

  it('el botón manual y el fin automático no pueden notificar los dos', async () => {
    await sembrarEstado({
      status: 'en_mantenimiento',
      enabled: true,
      iniciadoEn: new Date(Date.now() - 10 * 60 * 1000),
      scheduledStart: new Date(Date.now() - 10 * 60 * 1000),
      scheduledEnd: new Date(Date.now() - 1000),
      mantenimientoId: new mongoose.Types.ObjectId(),
      notificacionInicioEnviada: true,
    })

    // El administrador pulsa "Finalizar" en el mismo instante en que el worker
    // detecta que venció la hora. Uno de los dos pierde el CAS; da igual cuál.
    const resultados = await Promise.allSettled([finalizar(ACTOR), evaluarTransiciones()])
    expect(resultados.some((r) => r.status === 'fulfilled')).toBe(true)
    expect(avisarDisponible).toHaveBeenCalledTimes(1)
  })

  it('no notifica dos veces el inicio si el worker corre varias veces seguidas', async () => {
    await sembrarEstado({
      status: 'programado',
      scheduledStart: new Date(Date.now() - 1000),
      scheduledEnd: new Date(Date.now() + 60 * 60 * 1000),
      mantenimientoId: new mongoose.Types.ObjectId(),
    })

    await evaluarTransiciones()
    await evaluarTransiciones()

    expect(avisarInicio).toHaveBeenCalledTimes(1)
  })
})

describe('Estado de plataforma — reinicio del backend', () => {
  it('conserva el mantenimiento activo tras un reinicio', async () => {
    await activarAhora({ reason: 'Migración' }, ACTOR)

    // Simula el arranque de un proceso nuevo: caché vacía, se relee de Mongo.
    invalidarCacheEstado()
    await evaluarTransiciones()

    const { enMantenimiento } = await estadoEfectivo()
    expect(enMantenimiento).toBe(true)
    // Un reinicio no es un mantenimiento nuevo: no debe volver a anunciarse.
    expect(avisarInicio).toHaveBeenCalledTimes(1)
  })

  it('resuelve al arrancar una ventana que venció completa con el servidor caído', async () => {
    await sembrarEstado({
      status: 'programado',
      scheduledStart: new Date(Date.now() - 3 * 60 * 60 * 1000),
      scheduledEnd: new Date(Date.now() - 2 * 60 * 60 * 1000),
      mantenimientoId: new mongoose.Types.ObjectId(),
    })

    await evaluarTransiciones()

    const doc = await EstadoPlataforma.findOne({ clave: 'global' })
    expect(doc.status).toBe('operativa')
    // No se anuncia el inicio de algo que nadie llegó a vivir...
    expect(avisarInicio).not.toHaveBeenCalled()
    // ...pero sí que ya está disponible, porque el aviso de la ventana sí salió.
    expect(avisarDisponible).toHaveBeenCalledTimes(1)
    expect(await EventoPlataforma.countDocuments({ tipo: 'finalizado_automatico' })).toBe(1)
  })
})

describe('Estado de plataforma — historial', () => {
  it('registra el ciclo completo bajo el mismo mantenimientoId', async () => {
    await programar({ scheduledStart: datetimeLocal(60 * 1000) }, ACTOR)
    const doc = await EstadoPlataforma.findOne({ clave: 'global' })
    const id = doc.mantenimientoId

    await activarAhora({}, ACTOR)
    await finalizar(ACTOR)

    const eventos = await EventoPlataforma.find({ mantenimientoId: id }).sort({ creadoEn: 1 })
    expect(eventos.map((e) => e.tipo)).toEqual(['programado', 'iniciado', 'finalizado'])

    const { eventos: pagina, total } = await historial({ pagina: 1, porPagina: 10 })
    expect(total).toBe(3)
    expect(pagina[0].usuarioNombre).toBe('admin.pruebas')
  })
})

describe('Estado de plataforma — respuesta pública', () => {
  it('no expone datos internos en el endpoint sin sesión', async () => {
    await programar({ scheduledStart: datetimeLocal(60 * 60 * 1000), reason: 'X' }, ACTOR)
    const estado = await estadoPublico()

    expect(estado).toHaveProperty('status')
    expect(estado).toHaveProperty('ahora')
    // Nada de quién lo programó ni de ids internos: es un endpoint anónimo.
    expect(estado).not.toHaveProperty('createdBy')
    expect(estado).not.toHaveProperty('createdByNombre')
    expect(estado).not.toHaveProperty('mantenimientoId')
    expect(estado).not.toHaveProperty('notificacionFinEnviada')
  })

  it('publica la antelación EFECTIVA del aviso previo para que el banner la siga', async () => {
    const estado = await estadoPublico()

    // Este campo es lo que evita que el frontend tenga que llevar el número
    // duplicado: el banner se vuelve obligatorio en el mismo umbral en que
    // evaluarTransiciones() manda el push/correo. Si alguien lo quita del DTO,
    // el banner cae a su literal de reserva en silencio.
    expect(estado.avisoPrevioMin).toBe(env.PLATAFORMA_AVISO_PREVIO_MIN)
    expect(Number.isFinite(estado.avisoPrevioMin)).toBe(true)
    expect(estado.avisoPrevioMin).toBeGreaterThan(0)
  })
})
