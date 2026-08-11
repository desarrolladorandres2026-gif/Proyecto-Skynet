import { describe, it, expect, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/utils/webpush.js', () => ({ default: { sendNotification: vi.fn() } }))
vi.mock('../src/utils/email.js', () => ({ enviarEmailGenerico: vi.fn() }))

import { env } from '../src/config/env.js'
import ausenciasRoutes from '../src/modules/ausencias/ausencias.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import Ausencia from '../src/models/Ausencia.js'
import EnvioNotificacion from '../src/models/EnvioNotificacion.js'
import {
  crearAusencia,
  aprobarAusencia,
  rechazarAusencia,
  cancelarAusencia,
  contarDias,
  listarBandeja,
  calendario,
} from '../src/modules/ausencias/ausencias.service.js'

async function crearPermiso(codigo) {
  const [modulo, accion] = codigo.split(':')
  return Permiso.findOneAndUpdate({ codigo }, { codigo, modulo, accion, nombre: codigo }, { upsert: true, new: true })
}

async function crearActor(codigo) {
  const permiso = codigo ? await crearPermiso(codigo) : null
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({
    nombre: `Rol-${sufijo}`,
    slug: `rol-${sufijo}`,
    permisos: permiso ? [permiso._id] : [],
  })
  const usuario = await Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Persona Prueba',
    password: await bcrypt.hash('clave-segura-123', 4),
    email: `${sufijo}@example.com`,
    rol: rol._id,
    cargo: 'Auxiliar',
    dependencia: 'Operaciones',
  })
  return {
    usuario,
    actor: {
      id_usuario: usuario._id,
      nombre_usuario: usuario.nombre_usuario,
      rol: { id: rol._id, nombre: rol.nombre, slug: rol.slug },
      esSuperAdmin: false,
      permisos: new Set(codigo ? [codigo] : []),
    },
  }
}

// Las notificaciones se disparan sin await a propósito (el solicitante no debe
// esperar a que salga el correo). Esperarlas activamente en vez de asumir que
// ya llegaron es lo que evita que esta prueba sea intermitente.
async function esperarNotificaciones(filtro, intentos = 50) {
  for (let i = 0; i < intentos; i += 1) {
    const encontradas = await EnvioNotificacion.find(filtro)
    if (encontradas.length > 0) return encontradas
    await new Promise((r) => setTimeout(r, 20))
  }
  return []
}

// Lunes de una semana futura fija, para que la validación de "fecha pasada"
// no dependa del día en que corran las pruebas.
function lunesFuturo(semanasAdelante = 2) {
  const fecha = new Date()
  fecha.setHours(0, 0, 0, 0)
  fecha.setDate(fecha.getDate() + semanasAdelante * 7)
  fecha.setDate(fecha.getDate() + ((8 - fecha.getDay()) % 7 || 7))
  return fecha
}

function sumarDias(fecha, dias) {
  const copia = new Date(fecha)
  copia.setDate(copia.getDate() + dias)
  return copia
}

// El router real, con verificarToken y requierePermiso de verdad: los tests de
// arriba ejercitan el service, este bloque ejercita lo que solo se rompe en la
// capa HTTP (orden de rutas literales vs '/:id', y qué exige cada permiso).
function crearApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/ausencias', ausenciasRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

function autorizacion(usuario) {
  const token = jwt.sign(
    { id_usuario: usuario._id.toString(), tokenVersion: usuario.tokenVersion },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  )
  return `Bearer ${token}`
}

describe('Ausencias — capa HTTP', () => {
  const app = crearApp()

  it('solicitar y ver las propias no exigen ningún permiso', async () => {
    const { usuario } = await crearActor(null)
    const lunes = lunesFuturo()

    const creada = await request(app)
      .post('/api/ausencias')
      .set('Authorization', autorizacion(usuario))
      .send({ tipo: 'vacaciones', fechaInicio: lunes, fechaFin: sumarDias(lunes, 4) })

    expect(creada.status).toBe(201)
    expect(creada.body.ausencia.diasHabiles).toBe(5)

    const mias = await request(app).get('/api/ausencias/mias').set('Authorization', autorizacion(usuario))
    expect(mias.status).toBe(200)
    expect(mias.body.ausencias).toHaveLength(1)
  })

  it('ignora un soporte inventado en el body: solo se acepta el de un archivo subido', async () => {
    const { usuario } = await crearActor(null)
    const lunes = lunesFuturo()

    // Sin archivo adjunto (multer no interviene, es JSON puro): un
    // 'soporte' en el body es de quien ataca, no de una subida real a
    // Cloudinary. Si el controller lo copiara tal cual, quedaría un enlace
    // javascript: guardado y clicable en la bandeja de quien aprueba.
    const creada = await request(app)
      .post('/api/ausencias')
      .set('Authorization', autorizacion(usuario))
      .send({
        tipo: 'vacaciones',
        fechaInicio: lunes,
        fechaFin: sumarDias(lunes, 4),
        soporte: { url: 'javascript:alert(1)', publicId: 'no-cloudinary' },
      })

    expect(creada.status).toBe(201)
    expect(creada.body.ausencia.soporte?.url).toBeFalsy()
  })

  it('las rutas literales no las captura /:id', async () => {
    const { usuario } = await crearActor(null)
    // Sin el orden correcto en el router, '/mias' llegaría a detalle() como un
    // id y respondería 500 por CastError en vez de 200.
    const res = await request(app).get('/api/ausencias/mias').set('Authorization', autorizacion(usuario))
    expect(res.status).toBe(200)
  })

  it('bandeja, listado global y calendario exigen su permiso', async () => {
    const { usuario: sinPermiso } = await crearActor(null)
    const auth = autorizacion(sinPermiso)

    expect((await request(app).get('/api/ausencias/bandeja').set('Authorization', auth)).status).toBe(403)
    expect((await request(app).get('/api/ausencias').set('Authorization', auth)).status).toBe(403)
    expect((await request(app).get('/api/ausencias/calendario').set('Authorization', auth)).status).toBe(403)

    const { usuario: aprobador } = await crearActor('ausencias:aprobar')
    const authJefe = autorizacion(aprobador)
    expect((await request(app).get('/api/ausencias/bandeja').set('Authorization', authJefe)).status).toBe(200)
    // 'ausencias:aprobar' abre el calendario pero NO el listado global.
    expect((await request(app).get('/api/ausencias/calendario').set('Authorization', authJefe)).status).toBe(200)
    expect((await request(app).get('/api/ausencias').set('Authorization', authJefe)).status).toBe(403)
  })

  it('el calendario no expone motivo, motivoLicencia ni soporte médico a quien solo tiene ausencias:aprobar', async () => {
    const { actor } = await crearActor(null)
    const { usuario: jefe, actor: jefeActor } = await crearActor('ausencias:aprobar')
    const lunes = lunesFuturo()

    const doc = await crearAusencia(
      {
        tipo: 'incapacidad',
        fechaInicio: lunes,
        fechaFin: lunes,
        motivo: 'Diagnóstico confidencial de la EPS',
        soporte: { url: 'https://res.cloudinary.com/demo/soporte.pdf', publicId: 'demo/soporte', nombreArchivo: 'incapacidad.pdf' },
      },
      actor
    )
    await aprobarAusencia(doc._id, {}, jefeActor)

    const res = await request(app).get('/api/ausencias/calendario').set('Authorization', autorizacion(jefe))
    expect(res.status).toBe(200)

    const item = res.body.ausencias.find((a) => String(a._id) === String(doc._id))
    expect(item).toBeDefined()
    expect(item.tipo).toBe('incapacidad')
    expect(item.fechaInicio).toBeDefined()
    expect(item.motivo).toBeUndefined()
    expect(item.motivoLicencia).toBeUndefined()
    expect(item.soporte).toBeUndefined()
    expect(item.decision).toBeUndefined()
  })

  it('nadie ve el detalle de la ausencia de otra persona sin permiso', async () => {
    const { usuario: duenio, actor } = await crearActor(null)
    const { usuario: curioso } = await crearActor(null)
    const lunes = lunesFuturo()
    const doc = await crearAusencia({ tipo: 'permiso_no_remunerado', fechaInicio: lunes, fechaFin: lunes }, actor)

    const propio = await request(app).get(`/api/ausencias/${doc._id}`).set('Authorization', autorizacion(duenio))
    expect(propio.status).toBe(200)

    const ajeno = await request(app).get(`/api/ausencias/${doc._id}`).set('Authorization', autorizacion(curioso))
    expect(ajeno.status).toBe(409)
  })

  it('sin token no se llega a ninguna ruta del módulo', async () => {
    expect((await request(app).get('/api/ausencias/mias')).status).toBe(401)
    expect((await request(app).post('/api/ausencias').send({})).status).toBe(401)
  })
})

describe('Ausencias — conteo de días', () => {
  it('cuenta todos los días naturales del rango, sin excluir fines de semana', () => {
    const lunes = lunesFuturo()
    expect(contarDias(lunes, lunes)).toBe(1)
    // Lunes a viernes de la misma semana.
    expect(contarDias(lunes, sumarDias(lunes, 4))).toBe(5)
    // Lunes a domingo: el Terminal opera 24/7, el fin de semana también suma.
    expect(contarDias(lunes, sumarDias(lunes, 6))).toBe(7)
    // Dos semanas completas.
    expect(contarDias(lunes, sumarDias(lunes, 11))).toBe(12)
  })
})

describe('Ausencias — solicitar', () => {
  it('crea la solicitud, congela el snapshot del cargo y avisa a quien aprueba', async () => {
    const { actor } = await crearActor(null)
    const { usuario: jefe } = await crearActor('ausencias:aprobar')
    const lunes = lunesFuturo()

    const doc = await crearAusencia(
      { tipo: 'vacaciones', fechaInicio: lunes, fechaFin: sumarDias(lunes, 4), motivo: 'Descanso' },
      actor
    )

    expect(doc.estado).toBe('pendiente')
    expect(doc.diasHabiles).toBe(5)
    expect(doc.cargoSolicitante).toBe('Auxiliar')
    expect(doc.dependenciaSolicitante).toBe('Operaciones')

    const avisos = await esperarNotificaciones({ usuario: jefe._id })
    expect(avisos.length).toBeGreaterThan(0)
    expect(avisos[0].categoria).toBe('ausencias')
  })

  it('rechaza fechas invertidas', async () => {
    const { actor } = await crearActor(null)
    const lunes = lunesFuturo()

    await expect(
      crearAusencia({ tipo: 'permiso_no_remunerado', fechaInicio: sumarDias(lunes, 4), fechaFin: lunes }, actor)
    ).rejects.toThrow(/anterior a la de inicio/)

    // Sábado y domingo: el Terminal opera 24/7, así que sí cuentan (2 días).
    const finDeSemana = await crearAusencia(
      { tipo: 'permiso_no_remunerado', fechaInicio: sumarDias(lunes, 5), fechaFin: sumarDias(lunes, 6) },
      actor
    )
    expect(finDeSemana.diasHabiles).toBe(2)
  })

  it('acepta horario cuando la ausencia es de un solo día y lo exige coherente', async () => {
    const { actor } = await crearActor(null)
    const lunes = lunesFuturo()

    const doc = await crearAusencia(
      { tipo: 'permiso_no_remunerado', fechaInicio: lunes, fechaFin: lunes, horaInicio: '08:00', horaFin: '10:30' },
      actor
    )
    expect(doc.horaInicio).toBe('08:00')
    expect(doc.horaFin).toBe('10:30')

    await expect(
      crearAusencia(
        { tipo: 'permiso_no_remunerado', fechaInicio: lunes, fechaFin: sumarDias(lunes, 1), horaInicio: '08:00', horaFin: '10:00' },
        actor
      )
    ).rejects.toThrow(/un único día/)

    await expect(
      crearAusencia({ tipo: 'permiso_no_remunerado', fechaInicio: lunes, fechaFin: lunes, horaInicio: '10:00' }, actor)
    ).rejects.toThrow(/hora de inicio como la de fin/)

    await expect(
      crearAusencia(
        { tipo: 'permiso_no_remunerado', fechaInicio: lunes, fechaFin: lunes, horaInicio: '10:00', horaFin: '08:00' },
        actor
      )
    ).rejects.toThrow(/posterior a la hora de inicio/)
  })

  it('no permite vacaciones sobre fechas pasadas, pero sí incapacidades', async () => {
    const { actor } = await crearActor(null)
    const ayer = sumarDias(new Date(), -1)

    await expect(
      crearAusencia({ tipo: 'vacaciones', fechaInicio: ayer, fechaFin: ayer }, actor)
    ).rejects.toThrow(/fechas ya pasadas/)

    // Una incapacidad se reporta después de ocurrida: debe aceptarse. Se usa
    // un rango de varios días.
    const doc = await crearAusencia(
      {
        tipo: 'incapacidad',
        fechaInicio: sumarDias(new Date(), -7),
        fechaFin: new Date(),
        soporte: { url: 'https://res.cloudinary.com/skynet/ausencias/incapacidad.pdf', publicId: 'skynet/ausencias/abc123' },
      },
      actor
    )
    expect(doc.estado).toBe('pendiente')
  })

  it('exige soporte médico adjunto en una incapacidad', async () => {
    const { actor } = await crearActor(null)
    const lunes = lunesFuturo()
    await expect(
      crearAusencia({ tipo: 'incapacidad', fechaInicio: lunes, fechaFin: lunes }, actor)
    ).rejects.toThrow(/soporte médico/)
  })

  it('exige motivoLicencia válido en un permiso remunerado', async () => {
    const { actor } = await crearActor(null)
    const lunes = lunesFuturo()

    await expect(
      crearAusencia({ tipo: 'permiso_remunerado', fechaInicio: lunes, fechaFin: lunes }, actor)
    ).rejects.toThrow(/motivoLicencia/)

    await expect(
      crearAusencia({ tipo: 'permiso_remunerado', fechaInicio: lunes, fechaFin: lunes, motivoLicencia: 'no_existe' }, actor)
    ).rejects.toThrow(/motivoLicencia/)

    const doc = await crearAusencia(
      { tipo: 'permiso_remunerado', fechaInicio: lunes, fechaFin: lunes, motivoLicencia: 'luto' },
      actor
    )
    expect(doc.estado).toBe('pendiente')
    expect(doc.motivoLicencia).toBe('luto')
  })

  it('rechaza un soporte que no venga de Cloudinary, aunque llegue directo al service', async () => {
    const { actor } = await crearActor(null)
    const lunes = lunesFuturo()

    await expect(
      crearAusencia(
        { tipo: 'incapacidad', fechaInicio: lunes, fechaFin: lunes, soporte: { url: 'javascript:alert(1)' } },
        actor
      )
    ).rejects.toThrow(/URL externa/)
  })

  it('un permiso no remunerado no exige motivoLicencia', async () => {
    const { actor } = await crearActor(null)
    const lunes = lunesFuturo()
    const doc = await crearAusencia({ tipo: 'permiso_no_remunerado', fechaInicio: lunes, fechaFin: lunes }, actor)
    expect(doc.estado).toBe('pendiente')
    expect(doc.motivoLicencia).toBeUndefined()
  })

  it('bloquea una segunda solicitud que se cruza con otra viva', async () => {
    const { actor } = await crearActor(null)
    const lunes = lunesFuturo()
    await crearAusencia({ tipo: 'vacaciones', fechaInicio: lunes, fechaFin: sumarDias(lunes, 4) }, actor)

    await expect(
      crearAusencia({ tipo: 'permiso_no_remunerado', fechaInicio: sumarDias(lunes, 3), fechaFin: sumarDias(lunes, 8) }, actor)
    ).rejects.toThrow(/se cruza con esas fechas/)
  })

  it('una solicitud rechazada libera sus fechas', async () => {
    const { actor } = await crearActor(null)
    const { actor: jefe } = await crearActor('ausencias:aprobar')
    const lunes = lunesFuturo()

    const primera = await crearAusencia({ tipo: 'vacaciones', fechaInicio: lunes, fechaFin: sumarDias(lunes, 4) }, actor)
    await rechazarAusencia(primera._id, { motivoRechazo: 'Pico de operación' }, jefe)

    const segunda = await crearAusencia({ tipo: 'permiso_no_remunerado', fechaInicio: lunes, fechaFin: lunes }, actor)
    expect(segunda.estado).toBe('pendiente')
  })
})

describe('Ausencias — decisión', () => {
  it('aprobar cambia el estado, firma con nombre y cargo, y avisa al solicitante', async () => {
    const { actor, usuario: solicitante } = await crearActor(null)
    const { actor: jefe } = await crearActor('ausencias:aprobar')
    const lunes = lunesFuturo()

    const doc = await crearAusencia({ tipo: 'vacaciones', fechaInicio: lunes, fechaFin: sumarDias(lunes, 4) }, actor)
    const aprobada = await aprobarAusencia(doc._id, { observacion: 'Que descanses' }, jefe)

    expect(aprobada.estado).toBe('aprobada')
    expect(aprobada.decision.nombreRevisor).toBe('Persona Prueba')
    expect(aprobada.decision.cargoRevisor).toBe('Auxiliar')
    expect(aprobada.decision.fecha).toBeTruthy()

    const avisos = await esperarNotificaciones({ usuario: solicitante._id })
    expect(avisos.some((e) => e.titulo.includes('aprobada'))).toBe(true)
  })

  it('nadie aprueba su propia solicitud', async () => {
    const { actor } = await crearActor('ausencias:aprobar')
    const lunes = lunesFuturo()
    const doc = await crearAusencia({ tipo: 'vacaciones', fechaInicio: lunes, fechaFin: lunes }, actor)

    await expect(aprobarAusencia(doc._id, {}, actor)).rejects.toThrow(/tu propia solicitud/)
  })

  it('rechazar exige motivo y lo entrega al solicitante', async () => {
    const { actor, usuario: solicitante } = await crearActor(null)
    const { actor: jefe } = await crearActor('ausencias:aprobar')
    const lunes = lunesFuturo()
    const doc = await crearAusencia({ tipo: 'permiso_no_remunerado', fechaInicio: lunes, fechaFin: lunes }, actor)

    await expect(rechazarAusencia(doc._id, {}, jefe)).rejects.toThrow(/motivo de rechazo es obligatorio/)

    const rechazada = await rechazarAusencia(doc._id, { motivoRechazo: 'Coincide con el cierre contable' }, jefe)
    expect(rechazada.estado).toBe('rechazada')

    const avisos = await esperarNotificaciones({ usuario: solicitante._id })
    expect(avisos.some((e) => e.cuerpo === 'Coincide con el cierre contable')).toBe(true)
  })

  it('una solicitud ya decidida no se puede volver a decidir', async () => {
    const { actor } = await crearActor(null)
    const { actor: jefe } = await crearActor('ausencias:aprobar')
    const lunes = lunesFuturo()
    const doc = await crearAusencia({ tipo: 'permiso_no_remunerado', fechaInicio: lunes, fechaFin: lunes }, actor)

    await aprobarAusencia(doc._id, {}, jefe)
    await expect(aprobarAusencia(doc._id, {}, jefe)).rejects.toThrow(/estado "aprobada"/)
    await expect(rechazarAusencia(doc._id, { motivoRechazo: 'tarde' }, jefe)).rejects.toThrow(/estado "aprobada"/)
  })
})

describe('Ausencias — cancelar', () => {
  it('solo el dueño cancela, y solo mientras esté pendiente', async () => {
    const { actor } = await crearActor(null)
    const { actor: otro } = await crearActor(null)
    const { actor: jefe } = await crearActor('ausencias:aprobar')
    const lunes = lunesFuturo()

    const ajena = await crearAusencia({ tipo: 'permiso_no_remunerado', fechaInicio: lunes, fechaFin: lunes }, actor)
    await expect(cancelarAusencia(ajena._id, otro)).rejects.toThrow(/Solo quien solicitó/)

    const cancelada = await cancelarAusencia(ajena._id, actor)
    expect(cancelada.estado).toBe('cancelada')

    const otra = await crearAusencia({ tipo: 'permiso_no_remunerado', fechaInicio: sumarDias(lunes, 7), fechaFin: sumarDias(lunes, 7) }, actor)
    await aprobarAusencia(otra._id, {}, jefe)
    await expect(cancelarAusencia(otra._id, actor)).rejects.toThrow(/pendiente/)
  })
})

describe('Ausencias — bandeja y calendario', () => {
  it('la bandeja solo trae pendientes y el calendario solo aprobadas', async () => {
    const { actor } = await crearActor(null)
    const { actor: jefe } = await crearActor('ausencias:aprobar')
    const lunes = lunesFuturo()

    const aprobar = await crearAusencia({ tipo: 'vacaciones', fechaInicio: lunes, fechaFin: sumarDias(lunes, 4) }, actor)
    const { actor: otro } = await crearActor(null)
    await crearAusencia({ tipo: 'permiso_no_remunerado', fechaInicio: lunes, fechaFin: lunes }, otro)

    expect(await listarBandeja()).toHaveLength(2)

    await aprobarAusencia(aprobar._id, {}, jefe)

    const bandeja = await listarBandeja()
    expect(bandeja).toHaveLength(1)

    const enCalendario = await calendario({ desde: lunes, hasta: sumarDias(lunes, 30) })
    expect(enCalendario).toHaveLength(1)
    expect(String(enCalendario[0]._id)).toBe(String(aprobar._id))
  })

  it('el calendario ignora ausencias fuera del rango consultado', async () => {
    const { actor } = await crearActor(null)
    const { actor: jefe } = await crearActor('ausencias:aprobar')
    const lunes = lunesFuturo()

    const doc = await crearAusencia({ tipo: 'vacaciones', fechaInicio: lunes, fechaFin: sumarDias(lunes, 4) }, actor)
    await aprobarAusencia(doc._id, {}, jefe)

    const lejos = sumarDias(lunes, 60)
    expect(await calendario({ desde: lejos, hasta: sumarDias(lejos, 10) })).toHaveLength(0)
    expect(await Ausencia.countDocuments({ estado: 'aprobada' })).toBe(1)
  })
})
