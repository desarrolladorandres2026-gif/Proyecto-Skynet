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
import {
  verificarIncapacidad,
  devolverIncapacidad,
  reenviarIncapacidad,
  foliarIncapacidad,
  direccionarIncapacidad,
  completarFolioIncapacidad,
  tramitarIncapacidad,
  listarTramite,
  supervisarIncapacidades,
  listarDestinatarios,
} from '../src/modules/ausencias/incapacidades.service.js'

async function crearPermiso(codigo) {
  const [modulo, accion] = codigo.split(':')
  return Permiso.findOneAndUpdate({ codigo }, { codigo, modulo, accion, nombre: codigo }, { upsert: true, new: true })
}

// Se concede siempre 'notificaciones:recibir_email' porque el canal correo lo
// exige (ver notificaciones.service.js) y estas pruebas verifican que
// Ausencias avise a quien aprueba y al solicitante. En producción ambos lo
// tienen: Talento Humano lo trae del seed y el solicitante recibe igual el
// push y la campana interna aunque su rol no lo tenga.
async function crearActor(codigo) {
  const permiso = codigo ? await crearPermiso(codigo) : null
  const permisoEmail = await crearPermiso('notificaciones:recibir_email')
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({
    nombre: `Rol-${sufijo}`,
    slug: `rol-${sufijo}`,
    permisos: permiso ? [permiso._id, permisoEmail._id] : [permisoEmail._id],
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
    const { usuario: jefe } = await crearActor('ausencias:aprobar')
    // Una incapacidad no la aprueba Talento Humano: la verifica SIG, y desde ahí
    // ya cuenta como ausencia en firme para el calendario.
    const { actor: sigActor } = await crearActor('ausencias:verificar_incapacidades')
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
    await verificarIncapacidad(doc._id, {}, sigActor)

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

  it('permite crear incapacidad subiendo un archivo PDF real y descargarlo con autorización', async () => {
    const { usuario: solicitante } = await crearActor(null)
    const { usuario: jefe } = await crearActor('ausencias:aprobar')
    const { usuario: curioso } = await crearActor(null)
    const lunes = lunesFuturo()
    const pdfReal = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('soporte incapacidad medica')])

    const resCrear = await request(app)
      .post('/api/ausencias')
      .set('Authorization', autorizacion(solicitante))
      .field('tipo', 'incapacidad')
      .field('fechaInicio', lunes.toISOString())
      .field('fechaFin', lunes.toISOString())
      .field('motivo', 'Incapacidad médica')
      .attach('soporte', pdfReal, { filename: 'certificado.pdf', contentType: 'application/pdf' })

    expect(resCrear.status).toBe(201)
    const ausencia = resCrear.body.ausencia
    expect(ausencia.soporte).toBeDefined()
    expect(ausencia.soporte.archivo).toMatch(/_certificado\.pdf$/)
    expect(ausencia.soporte.nombreArchivo).toBe('certificado.pdf')

    // El solicitante puede ver su propio soporte
    const resSoportePropio = await request(app)
      .get(`/api/ausencias/${ausencia._id}/soporte`)
      .set('Authorization', autorizacion(solicitante))
    expect(resSoportePropio.status).toBe(200)
    expect(resSoportePropio.headers['content-type']).toContain('application/pdf')

    // Quien aprueba también puede ver el soporte
    const resSoporteJefe = await request(app)
      .get(`/api/ausencias/${ausencia._id}/soporte`)
      .set('Authorization', autorizacion(jefe))
    expect(resSoporteJefe.status).toBe(200)

    // Un usuario sin permisos no puede acceder al soporte de otro
    const resSoporteCurioso = await request(app)
      .get(`/api/ausencias/${ausencia._id}/soporte`)
      .set('Authorization', autorizacion(curioso))
    expect(resSoporteCurioso.status).toBe(409)
  })

  it('rechaza subir un soporte falsificado que no es PDF ni imagen', async () => {
    const { usuario } = await crearActor(null)
    const lunes = lunesFuturo()
    const scriptFalso = Buffer.from('#!/bin/bash\necho "ataque"')

    const res = await request(app)
      .post('/api/ausencias')
      .set('Authorization', autorizacion(usuario))
      .field('tipo', 'incapacidad')
      .field('fechaInicio', lunes.toISOString())
      .field('fechaFin', lunes.toISOString())
      .attach('soporte', scriptFalso, { filename: 'falso.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(400)
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

// Regresión de BUG-003 (auditoría 2026-08-13).
//
// Las pruebas de arriba pasan Date objects, que es lo que construye este
// archivo — pero el frontend manda lo que produce un <input type="date">: la
// cadena "YYYY-MM-DD". Ese es justo el caso que estaba roto, y por eso el
// resto de la suite no lo detectaba: `new Date('2026-08-20')` se parsea como
// medianoche UTC y el viejo `setHours(0,0,0,0)` la corría a la medianoche de
// la zona del PROCESO Node.
//
// Se afirma sobre el DÍA que queda guardado, no sobre el flujo, y se mira
// desde la zona del Terminal — que es donde lo lee la persona que solicitó.
// Correr con scripts/verificar-fechas-tz.js: estas afirmaciones deben dar lo
// mismo con TZ=UTC, TZ=America/Bogota y TZ=Asia/Tokyo.
describe('Ausencias — el día guardado es el día pedido', () => {
  const diaEnElTerminal = (fecha) =>
    new Date(fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

  // Una fecha futura fija en formato de <input type="date">, para que la
  // afirmación sea sobre un valor concreto y no sobre aritmética de "hoy".
  const DIA = '2027-08-20'

  it('guarda exactamente el día que se eligió en el formulario', async () => {
    const { actor } = await crearActor(null)

    const doc = await crearAusencia(
      { tipo: 'permiso_no_remunerado', fechaInicio: DIA, fechaFin: DIA },
      actor
    )

    expect(diaEnElTerminal(doc.fechaInicio)).toBe(DIA)
    expect(diaEnElTerminal(doc.fechaFin)).toBe(DIA)
    // El valor exacto en Mongo: medianoche de Neiva = 05:00 UTC.
    expect(doc.fechaInicio.toISOString()).toBe('2027-08-20T05:00:00.000Z')
  })

  it('la lista y el formulario de edición muestran el MISMO día', async () => {
    const { actor } = await crearActor(null)
    const doc = await crearAusencia(
      { tipo: 'permiso_no_remunerado', fechaInicio: DIA, fechaFin: DIA },
      actor
    )

    // Lo que pinta fmtFecha() en un navegador de Colombia...
    const enLaLista = diaEnElTerminal(doc.fechaInicio)
    // ...y lo que pone aInputFecha() en el <input type="date">.
    const enElFormulario = doc.fechaInicio.toISOString().slice(0, 10)

    expect(enLaLista).toBe(enElFormulario)
    expect(enLaLista).toBe(DIA)
  })

  it('un rango de varios días conserva sus dos extremos y cuenta bien', async () => {
    const { actor } = await crearActor(null)
    const doc = await crearAusencia(
      { tipo: 'vacaciones', fechaInicio: '2027-08-20', fechaFin: '2027-08-24' },
      actor
    )

    expect(diaEnElTerminal(doc.fechaInicio)).toBe('2027-08-20')
    expect(diaEnElTerminal(doc.fechaFin)).toBe('2027-08-24')
    expect(doc.diasHabiles).toBe(5)
  })

  it('detecta el solape cuando dos solicitudes comparten un solo día', async () => {
    const { actor } = await crearActor(null)
    await crearAusencia({ tipo: 'vacaciones', fechaInicio: '2027-08-20', fechaFin: '2027-08-24' }, actor)

    // El último día de la primera es el primero de la segunda.
    await expect(
      crearAusencia({ tipo: 'permiso_no_remunerado', fechaInicio: '2027-08-24', fechaFin: '2027-08-25' }, actor)
    ).rejects.toThrow(/se cruza/)

    // El día siguiente ya no se cruza.
    const contigua = await crearAusencia(
      { tipo: 'permiso_no_remunerado', fechaInicio: '2027-08-25', fechaFin: '2027-08-25' },
      actor
    )
    expect(diaEnElTerminal(contigua.fechaInicio)).toBe('2027-08-25')
  })

  it('el calendario encuentra la ausencia por su día exacto en los bordes', async () => {
    const { actor } = await crearActor(null)
    const { actor: jefe } = await crearActor('ausencias:aprobar')
    const doc = await crearAusencia(
      { tipo: 'vacaciones', fechaInicio: '2027-08-20', fechaFin: '2027-08-24' },
      actor
    )
    await aprobarAusencia(doc._id, {}, jefe)

    // Consultar exactamente el último día debe encontrarla.
    expect(await calendario({ desde: '2027-08-24', hasta: '2027-08-24' })).toHaveLength(1)
    // Un día antes del primero, no.
    expect(await calendario({ desde: '2027-08-19', hasta: '2027-08-19' })).toHaveLength(0)
    // Un día después del último, tampoco.
    expect(await calendario({ desde: '2027-08-25', hasta: '2027-08-25' })).toHaveLength(0)
  })
})

// ── Trámite de incapacidades ───────────────────────────────────────────────
// trabajador -> SIG (verifica/devuelve) -> Secretaria (folía) -> Gerencia
// (direcciona) -> Talento Humano (recibe); la Secretaria completa el folio.

const SOPORTE_OK = { url: 'https://res.cloudinary.com/demo/soporte.pdf', publicId: 'demo/soporte', nombreArchivo: 'incapacidad.pdf' }

async function reportarIncapacidad(trabajador, dia = lunesFuturo(3)) {
  return crearAusencia(
    { tipo: 'incapacidad', fechaInicio: dia, fechaFin: sumarDias(dia, 2), soporte: SOPORTE_OK, motivo: 'Reposo' },
    trabajador
  )
}

async function equipoDelTramite() {
  const trabajador = await crearActor(null)
  const sig = await crearActor('ausencias:verificar_incapacidades')
  const secretaria = await crearActor('ausencias:foliar_incapacidades')
  const gerencia = await crearActor('ausencias:direccionar_incapacidades')
  const talentoHumano = await crearActor('ausencias:recibir_incapacidades')
  return { trabajador, sig, secretaria, gerencia, talentoHumano }
}

describe('Incapacidades — trámite completo', () => {
  it('nace en verificación y avisa a SIG, no a Talento Humano', async () => {
    const { trabajador, sig } = await equipoDelTramite()
    const { usuario: rrhh } = await crearActor('ausencias:aprobar')

    const doc = await reportarIncapacidad(trabajador.actor)
    expect(doc.estado).toBe('pendiente')
    expect(doc.etapa).toBe('en_verificacion')
    expect(doc.historial.map((h) => h.accion)).toEqual(['creada'])

    const avisoSig = await esperarNotificaciones({ usuario: sig.usuario._id })
    expect(avisoSig.length).toBeGreaterThan(0)
    // Con 'ausencias:aprobar' (decide vacaciones y permisos) no le toca verificar.
    await new Promise((r) => setTimeout(r, 150))
    expect(await EnvioNotificacion.find({ usuario: rrhh._id })).toHaveLength(0)
  })

  it('Talento Humano ya no aprueba ni rechaza una incapacidad por la vía de vacaciones', async () => {
    const { trabajador } = await equipoDelTramite()
    const { actor: rrhh } = await crearActor('ausencias:aprobar')
    const doc = await reportarIncapacidad(trabajador.actor)

    await expect(aprobarAusencia(doc._id, {}, rrhh)).rejects.toThrow(/no se aprueban aquí/)
    await expect(rechazarAusencia(doc._id, { motivoRechazo: 'x' }, rrhh)).rejects.toThrow(/no se aprueban aquí/)
    // Y no aparece en la bandeja de vacaciones y permisos.
    expect((await listarBandeja()).map((a) => String(a._id))).not.toContain(String(doc._id))
  })

  it('recorre todo el trámite, cada paso con su responsable, y deja la línea de tiempo', async () => {
    const { trabajador, sig, secretaria, gerencia, talentoHumano } = await equipoDelTramite()
    const doc = await reportarIncapacidad(trabajador.actor)

    // 1. SIG: verificado y aprobado -> ya es ausencia en firme.
    const verificada = await verificarIncapacidad(doc._id, { observacion: 'Soporte completo' }, sig.actor)
    expect(verificada.estado).toBe('aprobada')
    expect(verificada.etapa).toBe('por_foliar')
    expect(verificada.verificacion.nombre).toBe('Persona Prueba')
    expect(await calendario({ desde: doc.fechaInicio, hasta: doc.fechaFin })).toHaveLength(1)
    expect((await esperarNotificaciones({ usuario: secretaria.usuario._id })).length).toBeGreaterThan(0)

    // 2. Secretaria: folía y queda a la espera de direccionamiento.
    const foliada = await foliarIncapacidad(doc._id, { numeroFolio: ' 0457 ', observacion: 'Incapacidad EPS' }, secretaria.actor)
    expect(foliada.etapa).toBe('foliada')
    expect(foliada.folio.numero).toBe('0457')
    expect(foliada.folio.destinatarioRegistrado).toBe(false)
    expect((await esperarNotificaciones({ usuario: gerencia.usuario._id })).length).toBeGreaterThan(0)

    // 3. Gerencia: despacha a una persona de Talento Humano, con mensaje.
    const direccionada = await direccionarIncapacidad(
      doc._id,
      { destinatarioId: talentoHumano.usuario._id, mensaje: 'Para trámite de nómina' },
      gerencia.actor
    )
    expect(direccionada.etapa).toBe('direccionada')
    expect(direccionada.direccionamiento.nombreDestinatario).toBe('Persona Prueba')
    expect(direccionada.direccionamiento.mensaje).toBe('Para trámite de nómina')
    // El destinatario y la Secretaria (que debe completar el folio) reciben aviso.
    const avisoDestinatario = await esperarNotificaciones({ usuario: talentoHumano.usuario._id, titulo: /dirigida a ti/i })
    expect(avisoDestinatario.length).toBeGreaterThan(0)
    const avisoFolio = await esperarNotificaciones({ usuario: secretaria.usuario._id, titulo: /Completa el folio/i })
    expect(avisoFolio.length).toBeGreaterThan(0)

    // 4. Secretaria: ya conoce el destinatario y lo anota en el folio (una sola vez).
    const completa = await completarFolioIncapacidad(doc._id, {}, secretaria.actor)
    expect(completa.folio.destinatarioRegistrado).toBe(true)
    await expect(completarFolioIncapacidad(doc._id, {}, secretaria.actor)).rejects.toThrow(/ya tiene el destinatario/)

    expect(completa.historial.map((h) => h.accion)).toEqual([
      'creada', 'verificada', 'foliada', 'direccionada', 'folio_completado',
    ])
  })

  it('no deja saltarse pasos', async () => {
    const { trabajador, sig, secretaria, gerencia, talentoHumano } = await equipoDelTramite()
    const doc = await reportarIncapacidad(trabajador.actor)

    // Sin verificar no se puede foliar ni direccionar.
    await expect(foliarIncapacidad(doc._id, { numeroFolio: '1' }, secretaria.actor)).rejects.toThrow(/No se puede foliar/)
    await expect(
      direccionarIncapacidad(doc._id, { destinatarioId: talentoHumano.usuario._id }, gerencia.actor)
    ).rejects.toThrow(/No se puede direccionar/)

    await verificarIncapacidad(doc._id, {}, sig.actor)
    // Verificada pero sin foliar: tampoco se direcciona, ni se verifica de nuevo.
    await expect(
      direccionarIncapacidad(doc._id, { destinatarioId: talentoHumano.usuario._id }, gerencia.actor)
    ).rejects.toThrow(/No se puede direccionar/)
    await expect(verificarIncapacidad(doc._id, {}, sig.actor)).rejects.toThrow(/No se puede verificar/)
    // El número de folio es opcional (la Secretaria llena el folio en físico).
    const sinNumero = await foliarIncapacidad(doc._id, { numeroFolio: '  ' }, secretaria.actor)
    expect(sinNumero.etapa).toBe('foliada')
    expect(sinNumero.folio.numero).toBe('')
  })

  it('el destinatario tiene que poder recibir incapacidades en Talento Humano', async () => {
    const { trabajador, sig, secretaria, gerencia } = await equipoDelTramite()
    const { usuario: cualquiera } = await crearActor(null)
    const doc = await reportarIncapacidad(trabajador.actor)
    await verificarIncapacidad(doc._id, {}, sig.actor)
    await foliarIncapacidad(doc._id, { numeroFolio: '9' }, secretaria.actor)

    await expect(direccionarIncapacidad(doc._id, {}, gerencia.actor)).rejects.toThrow(/a quién de Talento Humano/)
    await expect(
      direccionarIncapacidad(doc._id, { destinatarioId: cualquiera._id }, gerencia.actor)
    ).rejects.toThrow(/no puede recibir/)
  })

  it('nadie verifica su propia incapacidad', async () => {
    const sig = await crearActor('ausencias:verificar_incapacidades')
    const doc = await reportarIncapacidad(sig.actor)
    await expect(verificarIncapacidad(doc._id, {}, sig.actor)).rejects.toThrow(/tu propia incapacidad/)
  })

  it('una incapacidad anterior al trámite que sigue pendiente entra a SIG', async () => {
    const { trabajador, sig } = await equipoDelTramite()
    const doc = await reportarIncapacidad(trabajador.actor)
    // Registro "viejo": sin etapa ni historial.
    await Ausencia.collection.updateOne({ _id: doc._id }, { $unset: { etapa: '', etapaDesde: '', historial: '' } })

    const { porVerificar } = await listarTramite(sig.actor)
    expect(porVerificar.map((a) => String(a._id))).toContain(String(doc._id))
    const verificada = await verificarIncapacidad(doc._id, {}, sig.actor)
    expect(verificada.etapa).toBe('por_foliar')
  })
})

describe('Incapacidades — Talento Humano cierra el ciclo', () => {
  async function hastaDireccionada() {
    const eq = await equipoDelTramite()
    const doc = await reportarIncapacidad(eq.trabajador.actor)
    await verificarIncapacidad(doc._id, {}, eq.sig.actor)
    await foliarIncapacidad(doc._id, { numeroFolio: '1' }, eq.secretaria.actor)
    await direccionarIncapacidad(doc._id, { destinatarioId: eq.talentoHumano.usuario._id }, eq.gerencia.actor)
    return { ...eq, doc }
  }

  it('la recibe y la tramita; el trabajador recibe el aviso y queda en la línea de tiempo', async () => {
    const { trabajador, talentoHumano, doc } = await hastaDireccionada()
    const otraPersonaDeTh = await crearActor('ausencias:recibir_incapacidades')

    // Cualquiera del área puede cerrarla, no solo la persona nombrada.
    const cerrada = await tramitarIncapacidad(doc._id, { observacion: 'Radicada ante la EPS' }, otraPersonaDeTh.actor)
    expect(cerrada.etapa).toBe('tramitada')
    expect(cerrada.tramite.observacion).toBe('Radicada ante la EPS')
    expect(cerrada.historial.at(-1).accion).toBe('tramitada')
    const aviso = await esperarNotificaciones({ usuario: trabajador.usuario._id, titulo: /tramitada/i })
    expect(aviso.length).toBeGreaterThan(0)

    // No se tramita dos veces, ni se tramita lo que no ha llegado.
    await expect(tramitarIncapacidad(doc._id, {}, talentoHumano.actor)).rejects.toThrow(/No se puede tramitar/)
    const sinLlegar = await reportarIncapacidad((await crearActor(null)).actor, lunesFuturo(6))
    await expect(tramitarIncapacidad(sinLlegar._id, {}, talentoHumano.actor)).rejects.toThrow(/No se puede tramitar/)
  })

  it('la Secretaria puede completar el folio aunque ya esté tramitada, y deja de contar días', async () => {
    const { secretaria, talentoHumano, doc } = await hastaDireccionada()
    await tramitarIncapacidad(doc._id, {}, talentoHumano.actor)

    expect((await listarTramite(secretaria.actor)).porCompletarFolio.map((x) => String(x._id))).toContain(String(doc._id))
    const completa = await completarFolioIncapacidad(doc._id, {}, secretaria.actor)
    expect(completa.folio.destinatarioRegistrado).toBe(true)
    expect(completa.etapa).toBe('tramitada')

    const { incapacidades, resumen } = await supervisarIncapacidades({ etapa: 'tramitada' })
    const item = incapacidades.find((x) => String(x._id) === String(doc._id))
    expect(item.diasEnEtapa).toBeNull()
    expect(resumen.tramitada).toBeGreaterThanOrEqual(1)
  })

  it('Talento Humano ve en Recibidas las pendientes y las ya tramitadas', async () => {
    const { talentoHumano, doc } = await hastaDireccionada()
    expect((await listarTramite(talentoHumano.actor)).recibidas.map((x) => x.etapa)).toContain('direccionada')
    await tramitarIncapacidad(doc._id, {}, talentoHumano.actor)
    expect((await listarTramite(talentoHumano.actor)).recibidas.map((x) => x.etapa)).toContain('tramitada')
  })

  it('exige el permiso de recibir por HTTP', async () => {
    const { sig, talentoHumano, doc } = await hastaDireccionada()
    const app = crearApp()
    expect((await request(app).post(`/api/ausencias/${doc._id}/tramitar`).set('Authorization', autorizacion(sig.usuario))).status).toBe(403)
    const ok = await request(app).post(`/api/ausencias/${doc._id}/tramitar`).set('Authorization', autorizacion(talentoHumano.usuario)).send({})
    expect(ok.status).toBe(200)
    expect(ok.body.ausencia.etapa).toBe('tramitada')
  })
})

describe('Incapacidades — devolución y corrección', () => {
  it('SIG la devuelve con el motivo y el trabajador la corrige y la reenvía', async () => {
    const { trabajador, sig } = await equipoDelTramite()
    const doc = await reportarIncapacidad(trabajador.actor)

    await expect(devolverIncapacidad(doc._id, {}, sig.actor)).rejects.toThrow(/qué falta/)
    const devuelta = await devolverIncapacidad(doc._id, { motivo: 'El certificado está cortado' }, sig.actor)
    expect(devuelta.etapa).toBe('devuelta')
    expect(devuelta.estado).toBe('pendiente')
    expect(devuelta.historial.at(-1).nota).toBe('El certificado está cortado')
    const aviso = await esperarNotificaciones({ usuario: trabajador.usuario._id, titulo: /corrección/i })
    expect(aviso[0].cuerpo).toContain('certificado está cortado')

    // No se puede verificar mientras está devuelta.
    await expect(verificarIncapacidad(doc._id, {}, sig.actor)).rejects.toThrow(/No se puede verificar/)
    // Reenviar sin corregir nada no sirve.
    await expect(reenviarIncapacidad(doc._id, {}, trabajador.actor)).rejects.toThrow(/Adjunta un soporte corregido/)
    // Solo el dueño la corrige.
    await expect(
      reenviarIncapacidad(doc._id, { comentario: 'x' }, sig.actor)
    ).rejects.toThrow(/Solo quien reportó/)

    const nuevoArchivo = { archivo: '123_nuevo.pdf', nombreArchivo: 'nuevo.pdf', mimetype: 'application/pdf', size: 10 }
    const reenviada = await reenviarIncapacidad(doc._id, { soporte: nuevoArchivo, comentario: 'Adjunto completo' }, trabajador.actor)
    expect(reenviada.etapa).toBe('en_verificacion')
    expect(reenviada.soporte.archivo).toBe('123_nuevo.pdf')
    expect(reenviada.historial.map((h) => h.accion)).toEqual(['creada', 'devuelta', 'reenviada'])

    // Y vuelve a SIG, que ahora sí la puede verificar.
    expect((await verificarIncapacidad(doc._id, {}, sig.actor)).etapa).toBe('por_foliar')
  })

  it('corregir las fechas revalida el cruce con otras ausencias', async () => {
    const { trabajador, sig } = await equipoDelTramite()
    const dia = lunesFuturo(3)
    const doc = await reportarIncapacidad(trabajador.actor, dia)
    await crearAusencia({ tipo: 'vacaciones', fechaInicio: sumarDias(dia, 10), fechaFin: sumarDias(dia, 12) }, trabajador.actor)
    await devolverIncapacidad(doc._id, { motivo: 'Las fechas no coinciden con el certificado' }, sig.actor)

    await expect(
      reenviarIncapacidad(doc._id, { fechaInicio: sumarDias(dia, 9), fechaFin: sumarDias(dia, 11) }, trabajador.actor)
    ).rejects.toThrow(/se cruza/)

    const ok = await reenviarIncapacidad(doc._id, { fechaInicio: dia, fechaFin: sumarDias(dia, 4) }, trabajador.actor)
    expect(ok.diasHabiles).toBe(5)
  })

  it('el trabajador puede retirar una incapacidad devuelta, y ya no se verifica', async () => {
    const { trabajador, sig } = await equipoDelTramite()
    const doc = await reportarIncapacidad(trabajador.actor)
    await devolverIncapacidad(doc._id, { motivo: 'Falta la hoja 2' }, sig.actor)

    const cancelada = await cancelarAusencia(doc._id, trabajador.actor)
    expect(cancelada.estado).toBe('cancelada')
    expect(cancelada.historial.at(-1).accion).toBe('cancelada')
    await expect(verificarIncapacidad(doc._id, {}, sig.actor)).rejects.toThrow(/cancelada/)
  })
})

describe('Incapacidades — bandejas y supervisión', () => {
  it('cada persona ve solo la bandeja del paso que le toca', async () => {
    const { trabajador, sig, secretaria, gerencia, talentoHumano } = await equipoDelTramite()
    const a = await reportarIncapacidad(trabajador.actor, lunesFuturo(3))
    const b = await reportarIncapacidad((await crearActor(null)).actor, lunesFuturo(3))
    await verificarIncapacidad(b._id, {}, sig.actor)

    const deSig = await listarTramite(sig.actor)
    expect(Object.keys(deSig)).toEqual(['porVerificar'])
    expect(deSig.porVerificar.map((x) => String(x._id))).toEqual([String(a._id)])

    const deSecretaria = await listarTramite(secretaria.actor)
    expect(deSecretaria.porFoliar.map((x) => String(x._id))).toEqual([String(b._id)])
    expect(deSecretaria.porCompletarFolio).toEqual([])
    expect(deSecretaria.porVerificar).toBeUndefined()

    expect(Object.keys(await listarTramite(gerencia.actor))).toEqual(['porDireccionar'])

    await foliarIncapacidad(b._id, { numeroFolio: '10' }, secretaria.actor)
    expect((await listarTramite(gerencia.actor)).porDireccionar).toHaveLength(1)

    await direccionarIncapacidad(b._id, { destinatarioId: talentoHumano.usuario._id }, gerencia.actor)
    const deRrhh = await listarTramite(talentoHumano.actor)
    expect(deRrhh.recibidas).toHaveLength(1)
    expect(deRrhh.recibidas[0].paraMi).toBe(true)
    // A la Secretaria le queda pendiente completar el folio.
    expect((await listarTramite(secretaria.actor)).porCompletarFolio).toHaveLength(1)
  })

  it('la supervisión ve todas, filtra por etapa y por folio, y cuenta cada etapa', async () => {
    const { trabajador, sig, secretaria } = await equipoDelTramite()
    const uno = await reportarIncapacidad(trabajador.actor, lunesFuturo(4))
    const dos = await reportarIncapacidad((await crearActor(null)).actor, lunesFuturo(4))
    await verificarIncapacidad(dos._id, {}, sig.actor)
    await foliarIncapacidad(dos._id, { numeroFolio: 'F-77' }, secretaria.actor)

    const todas = await supervisarIncapacidades({})
    const ids = todas.incapacidades.map((x) => String(x._id))
    expect(ids).toEqual(expect.arrayContaining([String(uno._id), String(dos._id)]))
    expect(todas.resumen.en_verificacion).toBeGreaterThanOrEqual(1)
    expect(todas.resumen.foliada).toBeGreaterThanOrEqual(1)
    expect(todas.incapacidades.find((x) => String(x._id) === String(uno._id)).diasEnEtapa).toBe(0)

    const foliadas = await supervisarIncapacidades({ etapa: 'foliada' })
    expect(foliadas.incapacidades.map((x) => String(x._id))).toContain(String(dos._id))
    expect(foliadas.incapacidades.map((x) => String(x._id))).not.toContain(String(uno._id))

    const porFolio = await supervisarIncapacidades({ q: 'f-77' })
    expect(porFolio.incapacidades.map((x) => String(x._id))).toEqual([String(dos._id)])
    // La búsqueda no interpreta regex del usuario.
    expect((await supervisarIncapacidades({ q: '.*' })).incapacidades).toEqual([])
  })

  it('lista como destinatarios solo a quien puede recibir incapacidades', async () => {
    const { talentoHumano } = await equipoDelTramite()
    const { usuario: otro } = await crearActor('ausencias:foliar_incapacidades')
    const ids = (await listarDestinatarios()).map((u) => String(u._id))
    expect(ids).toContain(String(talentoHumano.usuario._id))
    expect(ids).not.toContain(String(otro._id))
  })
})

describe('Incapacidades — capa HTTP', () => {
  const app = crearApp()

  it('las rutas del trámite exigen el permiso de cada paso', async () => {
    const { trabajador, sig, secretaria, gerencia } = await equipoDelTramite()
    const supervisor = await crearActor('ausencias:supervisar_incapacidades')
    const doc = await reportarIncapacidad(trabajador.actor)
    const de = (a) => autorizacion(a.usuario)

    // Sin ningún permiso del trámite: ni bandejas ni supervisión.
    expect((await request(app).get('/api/ausencias/incapacidades/tramite').set('Authorization', de(trabajador))).status).toBe(403)
    expect((await request(app).get('/api/ausencias/incapacidades/supervision').set('Authorization', de(sig))).status).toBe(403)
    expect((await request(app).get('/api/ausencias/incapacidades/tramite').set('Authorization', de(sig))).status).toBe(200)
    expect((await request(app).get('/api/ausencias/incapacidades/supervision').set('Authorization', de(supervisor))).status).toBe(200)

    // Cada acción, con su permiso: la Secretaria no verifica, SIG no folía.
    const verificarConSecretaria = await request(app).post(`/api/ausencias/${doc._id}/verificar`).set('Authorization', de(secretaria))
    expect(verificarConSecretaria.status).toBe(403)
    expect((await request(app).post(`/api/ausencias/${doc._id}/foliar`).set('Authorization', de(sig)).send({ numeroFolio: '1' })).status).toBe(403)
    expect((await request(app).post(`/api/ausencias/${doc._id}/direccionar`).set('Authorization', de(secretaria)).send({})).status).toBe(403)
    expect((await request(app).get('/api/ausencias/incapacidades/destinatarios').set('Authorization', de(sig))).status).toBe(403)
    expect((await request(app).get('/api/ausencias/incapacidades/destinatarios').set('Authorization', de(gerencia))).status).toBe(200)

    const ok = await request(app).post(`/api/ausencias/${doc._id}/verificar`).set('Authorization', de(sig)).send({ observacion: 'ok' })
    expect(ok.status).toBe(200)
    expect(ok.body.ausencia.etapa).toBe('por_foliar')
    // La vía antigua queda cerrada para incapacidades.
    const { usuario: rrhh } = await crearActor('ausencias:aprobar')
    expect((await request(app).post(`/api/ausencias/${doc._id}/aprobar`).set('Authorization', autorizacion(rrhh))).status).toBe(409)
  })

  it('quien interviene en el trámite abre el soporte de la incapacidad; un curioso no', async () => {
    const { trabajador, sig } = await equipoDelTramite()
    const { usuario: curioso } = await crearActor(null)
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF')
    const res = await request(app)
      .post('/api/ausencias')
      .set('Authorization', autorizacion(trabajador.usuario))
      .field('tipo', 'incapacidad')
      .field('fechaInicio', lunesFuturo(5).toISOString())
      .field('fechaFin', lunesFuturo(5).toISOString())
      .attach('soporte', pdf, { filename: 'certificado.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(201)
    const id = res.body.ausencia._id

    expect((await request(app).get(`/api/ausencias/${id}/soporte`).set('Authorization', autorizacion(sig.usuario))).status).toBe(200)
    expect((await request(app).get(`/api/ausencias/${id}/soporte`).set('Authorization', autorizacion(curioso))).status).toBe(409)
  })

  it('el trabajador reenvía la incapacidad devuelta subiendo un PDF real', async () => {
    const { trabajador, sig } = await equipoDelTramite()
    const doc = await reportarIncapacidad(trabajador.actor)
    await devolverIncapacidad(doc._id, { motivo: 'Ilegible' }, sig.actor)

    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF')
    const res = await request(app)
      .post(`/api/ausencias/${doc._id}/reenviar`)
      .set('Authorization', autorizacion(trabajador.usuario))
      .field('comentario', 'Escaneado de nuevo')
      .attach('soporte', pdf, { filename: 'nuevo.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(200)
    expect(res.body.ausencia.etapa).toBe('en_verificacion')
    expect(res.body.ausencia.soporte.archivo).toMatch(/_nuevo\.pdf$/)
  })
})
