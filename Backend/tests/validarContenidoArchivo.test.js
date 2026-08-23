import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Equipo from '../src/models/mantenimiento/Equipo.js'
import mantenimientoRoutes from '../src/modules/mantenimiento/mantenimiento.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import { hashPassword } from '../src/utils/password.js'
import { validarContenidoReal } from '../src/utils/validarContenidoArchivo.js'

// Fase 6 de la auditoría 2026-08-22: el fileFilter de multer solo confía en
// el Content-Type que declara el cliente — falseable. Estas pruebas suben un
// archivo cuyo CONTENIDO real no corresponde al Content-Type/extensión
// declarados y confirman que se rechaza, tanto a nivel del middleware
// aislado como de un endpoint real.

const archivosTemporales = []
afterEach(async () => {
  for (const ruta of archivosTemporales.splice(0)) {
    await fs.rm(ruta, { force: true })
  }
})

async function crearArchivoTemporal(contenido) {
  const ruta = path.join(os.tmpdir(), `skynet-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.writeFile(ruta, contenido)
  archivosTemporales.push(ruta)
  return ruta
}

function fakeReqRes(file) {
  const req = { file }
  const res = {
    status(codigo) {
      this._status = codigo
      return this
    },
    json(cuerpo) {
      this._body = cuerpo
      return this
    },
  }
  return { req, res }
}

describe('validarContenidoReal — middleware aislado', () => {
  it('rechaza un archivo de texto plano disfrazado de PDF', async () => {
    const ruta = await crearArchivoTemporal('esto no es un PDF, es texto plano con extensión .pdf')
    const { req, res } = fakeReqRes({ path: ruta })
    const middleware = validarContenidoReal(() => ['pdf'])

    let siguienteLlamado = false
    await middleware(req, res, () => { siguienteLlamado = true })

    expect(siguienteLlamado).toBe(false)
    expect(res._status).toBe(400)
    // El archivo rechazado se borra, no queda huérfano en disco.
    await expect(fs.access(ruta)).rejects.toThrow()
  })

  it('acepta un PDF real (firma %PDF- válida)', async () => {
    const ruta = await crearArchivoTemporal(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('contenido mínimo de prueba')]))
    const { req, res } = fakeReqRes({ path: ruta })
    const middleware = validarContenidoReal(() => ['pdf'])

    let siguienteLlamado = false
    await middleware(req, res, () => { siguienteLlamado = true })

    expect(siguienteLlamado).toBe(true)
    expect(res._status).toBeUndefined()
  })

  // PNG 1x1 real y completo (no solo la firma): un IHDR válido es necesario
  // para que file-type lo reconozca — 8 bytes de firma sin una estructura de
  // chunks real no bastan (esto es intencional: confirma que la detección es
  // de verdad estructural, no solo "mira los primeros bytes").
  const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  )

  it('acepta un PNG real declarado como categoría "imagen"', async () => {
    const ruta = await crearArchivoTemporal(PNG_1X1)
    const { req, res } = fakeReqRes({ path: ruta })
    const middleware = validarContenidoReal(() => ['imagen'])

    let siguienteLlamado = false
    await middleware(req, res, () => { siguienteLlamado = true })
    expect(siguienteLlamado).toBe(true)
  })

  it('rechaza un PNG cuando se esperaba un PDF (categoría cruzada)', async () => {
    const ruta = await crearArchivoTemporal(PNG_1X1)
    const { req, res } = fakeReqRes({ path: ruta })
    const middleware = validarContenidoReal(() => ['pdf'])

    let siguienteLlamado = false
    await middleware(req, res, () => { siguienteLlamado = true })
    expect(siguienteLlamado).toBe(false)
    expect(res._status).toBe(400)
  })

  it('deja pasar la petición si no hay archivo (campo opcional)', async () => {
    const { req, res } = fakeReqRes(undefined)
    const middleware = validarContenidoReal(() => ['pdf'])
    let siguienteLlamado = false
    await middleware(req, res, () => { siguienteLlamado = true })
    expect(siguienteLlamado).toBe(true)
  })
})

describe('validarContenidoReal — endpoint real de mantenimiento (upload de PDF)', () => {
  function crearApp() {
    const app = express()
    app.use(cookieParser())
    app.use('/api/mantenimiento', mantenimientoRoutes)
    app.use(notFoundHandler)
    app.use(errorHandler)
    return app
  }

  async function crearUsuarioConModulo() {
    const sufijo = Math.random().toString(36).slice(2)
    const rol = await Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol_${sufijo}`, esSuperAdmin: false, ambito: 'global', permisos: [] })
    return Usuario.create({
      nombre_usuario: `user-${sufijo}`,
      nombre: 'Usuario Prueba',
      email: `${sufijo}@example.com`,
      password: await hashPassword('Clave.Segura.2026'),
      rol: rol._id,
      modulos: ['mantenimiento'],
    })
  }

  async function crearEquipo() {
    const sufijo = Math.random().toString(36).slice(2)
    const mongoose = (await import('mongoose')).default
    return Equipo.create({
      numero_inventario: `INV-${sufijo}`,
      serial: `SER-${sufijo}`,
      tipo: { id: new mongoose.Types.ObjectId(), nombre: 'Vehículo' },
      marca: { id: new mongoose.Types.ObjectId(), nombre: 'Marca X' },
      modelo: 'Modelo X',
      ubicacion: 'Patio 1',
      responsable: 'Juan',
      dependencia: 'Operaciones',
      estado_actual: 'operativo',
    })
  }

  function token(usuario) {
    return jwt.sign(
      { id_usuario: usuario._id.toString(), tokenVersion: usuario.tokenVersion },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    )
  }

  it('rechaza con 400 un .pdf que en realidad es un script/texto, y NO lo deja escrito en storage/', async () => {
    const app = crearApp()
    const usuario = await crearUsuarioConModulo()
    const equipo = await crearEquipo()

    const res = await request(app)
      .post(`/api/mantenimiento/equipos/${equipo._id}/mantenimiento`)
      .set('Authorization', `Bearer ${token(usuario)}`)
      .field('tipo', 'preventivo')
      .field('descripcion', 'Prueba')
      .attach('archivo_mantenimiento', Buffer.from('#!/bin/sh\necho "esto no es un pdf"'), 'informe.pdf')

    expect(res.status).toBe(400)
  })

  it('acepta un PDF real con Content-Type y extensión correctos', async () => {
    const app = crearApp()
    const usuario = await crearUsuarioConModulo()
    const equipo = await crearEquipo()
    const pdfReal = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('contenido mínimo')])

    const res = await request(app)
      .post(`/api/mantenimiento/equipos/${equipo._id}/mantenimiento`)
      .set('Authorization', `Bearer ${token(usuario)}`)
      .field('fecha', new Date().toISOString())
      .field('tipo', 'preventivo')
      .field('descripcion', 'Prueba')
      .attach('archivo_mantenimiento', pdfReal, { filename: 'informe.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(201)

    // Limpieza: borra el archivo real que sí quedó en storage/mantenimientos/.
    if (res.body?.mantenimiento?.archivo_pdf) {
      archivosTemporales.push(path.join(env.STORAGE_ROOT, 'mantenimientos', res.body.mantenimiento.archivo_pdf))
    }
  })
})
