import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'

import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import Mantenimiento from '../src/models/mantenimiento/Mantenimiento.js'
import Equipo from '../src/models/mantenimiento/Equipo.js'
import ordenesRoutes from '../src/modules/mantenimiento/ordenes.routes.js'
import mantenimientoRoutes from '../src/modules/mantenimiento/mantenimiento.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import { hashPassword } from '../src/utils/password.js'

// Fase 2 de la auditoría 2026-08-22: /storage se servía con express.static
// (autenticaba pero no autorizaba por recurso). Estas pruebas cubren el
// reemplazo: endpoints por-recurso bajo /api/mantenimiento/... que verifican
// que el archivo pedido de verdad pertenece a la orden/mantenimiento al que
// el usuario tiene acceso.
function crearApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  // Mismo orden de montaje que routes/index.js: /ordenes antes que la base.
  app.use('/api/mantenimiento/ordenes', ordenesRoutes)
  app.use('/api/mantenimiento', mantenimientoRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

const app = crearApp()
const PASSWORD_OK = 'Clave.Segura.2026'

const CARPETA_EVIDENCIAS = path.join(env.STORAGE_ROOT, 'mantenimiento_evidencias')
const CARPETA_MANTENIMIENTOS = path.join(env.STORAGE_ROOT, 'mantenimientos')
const archivosDePrueba = []

function token(usuario) {
  return jwt.sign(
    { id_usuario: usuario._id.toString(), tokenVersion: usuario.tokenVersion },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  )
}

function refCatalogo(nombre) {
  return { id: new mongoose.Types.ObjectId(), nombre }
}

async function crearEquipo() {
  const sufijo = Math.random().toString(36).slice(2)
  return Equipo.create({
    numero_inventario: `INV-${sufijo}`,
    serial: `SER-${sufijo}`,
    tipo: refCatalogo('Vehículo'),
    marca: refCatalogo('Marca de prueba'),
    modelo: 'Modelo X',
    ubicacion: 'Patio 1',
    responsable: 'Juan',
    dependencia: 'Operaciones',
    estado_actual: 'operativo',
  })
}

async function crearUsuario(rol, extra = {}) {
  const sufijo = Math.random().toString(36).slice(2)
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Prueba',
    email: `${sufijo}@example.com`,
    password: await hashPassword(PASSWORD_OK),
    rol: rol._id,
    ...extra,
  })
}

// Crea de verdad el archivo en disco (bajo storage/ del propio repo, igual
// que en producción) para poder probar la descarga real, y lo registra para
// borrarlo al terminar.
function crearArchivoDePrueba(carpeta, nombre, contenido = 'contenido de prueba') {
  fs.mkdirSync(carpeta, { recursive: true })
  const ruta = path.join(carpeta, nombre)
  fs.writeFileSync(ruta, contenido)
  archivosDePrueba.push(ruta)
  return nombre
}

afterAll(() => {
  for (const ruta of archivosDePrueba) {
    fs.rmSync(ruta, { force: true })
  }
})

let rolBasico
let rolVerTodas

beforeEach(async () => {
  const permisoEjecutar = await Permiso.findOne({ codigo: 'mantenimiento:ejecutar' }) || (await Permiso.create({ codigo: 'mantenimiento:ejecutar', modulo: 'mantenimiento', accion: 'ejecutar', nombre: 'Ejecutar' }))
  const permisoVerTodas = await Permiso.findOne({ codigo: 'mantenimiento:ver_todas' }) || (await Permiso.create({ codigo: 'mantenimiento:ver_todas', modulo: 'mantenimiento', accion: 'ver_todas', nombre: 'Ver todas' }))

  rolBasico = await Rol.create({
    nombre: `Tecnico-${Date.now()}-${Math.random()}`,
    slug: `tecnico_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    esSuperAdmin: false,
    ambito: 'global',
    permisos: [permisoEjecutar._id],
  })
  rolVerTodas = await Rol.create({
    nombre: `Supervisor-${Date.now()}-${Math.random()}`,
    slug: `supervisor_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    esSuperAdmin: false,
    ambito: 'global',
    permisos: [permisoEjecutar._id, permisoVerTodas._id],
  })
})

describe('Evidencias de Orden de Trabajo — autorización por-recurso', () => {
  it('el técnico asignado SÍ puede descargar la evidencia de su propia orden', async () => {
    const equipo = await crearEquipo()
    const tecnicoA = await crearUsuario(rolBasico)
    const nombreArchivo = crearArchivoDePrueba(CARPETA_EVIDENCIAS, `${Date.now()}_evidencia-a.png`)
    const ot = await Mantenimiento.create({
      equipo: equipo._id,
      fecha: new Date(),
      tipo: 'correctivo',
      descripcion: 'Falla reportada',
      tecnico_asignado: tecnicoA._id,
      evidencias: [{ tipo: 'foto', archivo: nombreArchivo, subidoPor: tecnicoA._id }],
    })

    const res = await request(app)
      .get(`/api/mantenimiento/ordenes/${ot._id}/archivos/${nombreArchivo}`)
      .set('Authorization', `Bearer ${token(tecnicoA)}`)

    expect(res.status).toBe(200)
  })

  it('un técnico NO asignado a la orden NO puede descargar la evidencia de otro (IDOR)', async () => {
    const equipo = await crearEquipo()
    const tecnicoA = await crearUsuario(rolBasico)
    const tecnicoB = await crearUsuario(rolBasico)
    const nombreArchivo = crearArchivoDePrueba(CARPETA_EVIDENCIAS, `${Date.now()}_evidencia-b.png`)
    const ot = await Mantenimiento.create({
      equipo: equipo._id,
      fecha: new Date(),
      tipo: 'correctivo',
      descripcion: 'Falla reportada',
      tecnico_asignado: tecnicoA._id,
      evidencias: [{ tipo: 'foto', archivo: nombreArchivo, subidoPor: tecnicoA._id }],
    })

    const res = await request(app)
      .get(`/api/mantenimiento/ordenes/${ot._id}/archivos/${nombreArchivo}`)
      .set('Authorization', `Bearer ${token(tecnicoB)}`)

    expect(res.status).toBe(404)
  })

  it('quien tiene mantenimiento:ver_todas SÍ puede descargar la evidencia de cualquier orden', async () => {
    const equipo = await crearEquipo()
    const tecnicoA = await crearUsuario(rolBasico)
    const supervisor = await crearUsuario(rolVerTodas)
    const nombreArchivo = crearArchivoDePrueba(CARPETA_EVIDENCIAS, `${Date.now()}_evidencia-c.png`)
    const ot = await Mantenimiento.create({
      equipo: equipo._id,
      fecha: new Date(),
      tipo: 'correctivo',
      descripcion: 'Falla reportada',
      tecnico_asignado: tecnicoA._id,
      evidencias: [{ tipo: 'foto', archivo: nombreArchivo, subidoPor: tecnicoA._id }],
    })

    const res = await request(app)
      .get(`/api/mantenimiento/ordenes/${ot._id}/archivos/${nombreArchivo}`)
      .set('Authorization', `Bearer ${token(supervisor)}`)

    expect(res.status).toBe(200)
  })

  it('un archivo real en disco pero que NO está en las evidencias de la orden da 404 (no basta con adivinar el nombre)', async () => {
    const equipo = await crearEquipo()
    const tecnicoA = await crearUsuario(rolBasico)
    const nombreArchivoAjeno = crearArchivoDePrueba(CARPETA_EVIDENCIAS, `${Date.now()}_no-vinculado.png`)
    const ot = await Mantenimiento.create({
      equipo: equipo._id,
      fecha: new Date(),
      tipo: 'correctivo',
      descripcion: 'Falla reportada',
      tecnico_asignado: tecnicoA._id,
      evidencias: [],
    })

    const res = await request(app)
      .get(`/api/mantenimiento/ordenes/${ot._id}/archivos/${nombreArchivoAjeno}`)
      .set('Authorization', `Bearer ${token(tecnicoA)}`)

    expect(res.status).toBe(404)
  })

  it('una orden inexistente da 404, el mismo código que "sin acceso" (no filtra si existe)', async () => {
    const tecnicoA = await crearUsuario(rolBasico)
    const idInexistente = new mongoose.Types.ObjectId()

    const res = await request(app)
      .get(`/api/mantenimiento/ordenes/${idInexistente}/archivos/cualquiera.png`)
      .set('Authorization', `Bearer ${token(tecnicoA)}`)

    expect(res.status).toBe(404)
  })

  it('sin token, se rechaza antes de llegar a la autorización por recurso', async () => {
    const res = await request(app).get('/api/mantenimiento/ordenes/000000000000000000000000/archivos/x.png')
    expect(res.status).toBe(401)
  })
})

describe('PDF legado de mantenimiento — autorización por-recurso', () => {
  it('con el módulo legado activo, SÍ puede descargar el PDF adjunto a ESE mantenimiento', async () => {
    const equipo = await crearEquipo()
    const usuario = await crearUsuario(rolBasico, { modulos: ['mantenimiento'] })
    const nombreArchivo = crearArchivoDePrueba(CARPETA_MANTENIMIENTOS, `${Date.now()}_informe.pdf`)
    const mantenimiento = await Mantenimiento.create({
      equipo: equipo._id,
      fecha: new Date(),
      tipo: 'preventivo',
      descripcion: 'Mantenimiento programado',
      archivo_pdf: nombreArchivo,
    })

    const res = await request(app)
      .get(`/api/mantenimiento/mantenimientos/${mantenimiento._id}/archivo/${nombreArchivo}`)
      .set('Authorization', `Bearer ${token(usuario)}`)

    expect(res.status).toBe(200)
  })

  it('sin el flag legado del módulo, no puede acceder (403), aunque el PDF exista', async () => {
    const equipo = await crearEquipo()
    const usuarioSinModulo = await crearUsuario(rolBasico, { modulos: [] })
    const nombreArchivo = crearArchivoDePrueba(CARPETA_MANTENIMIENTOS, `${Date.now()}_informe2.pdf`)
    const mantenimiento = await Mantenimiento.create({
      equipo: equipo._id,
      fecha: new Date(),
      tipo: 'preventivo',
      descripcion: 'Mantenimiento programado',
      archivo_pdf: nombreArchivo,
    })

    const res = await request(app)
      .get(`/api/mantenimiento/mantenimientos/${mantenimiento._id}/archivo/${nombreArchivo}`)
      .set('Authorization', `Bearer ${token(usuarioSinModulo)}`)

    expect(res.status).toBe(403)
  })

  it('un nombre de archivo que no coincide con el adjunto real de ESE registro da 404', async () => {
    const equipo = await crearEquipo()
    const usuario = await crearUsuario(rolBasico, { modulos: ['mantenimiento'] })
    const nombreArchivoReal = crearArchivoDePrueba(CARPETA_MANTENIMIENTOS, `${Date.now()}_informe3.pdf`)
    const nombreArchivoAjeno = crearArchivoDePrueba(CARPETA_MANTENIMIENTOS, `${Date.now()}_informe-otro.pdf`)
    const mantenimiento = await Mantenimiento.create({
      equipo: equipo._id,
      fecha: new Date(),
      tipo: 'preventivo',
      descripcion: 'Mantenimiento programado',
      archivo_pdf: nombreArchivoReal,
    })

    const res = await request(app)
      .get(`/api/mantenimiento/mantenimientos/${mantenimiento._id}/archivo/${nombreArchivoAjeno}`)
      .set('Authorization', `Bearer ${token(usuario)}`)

    expect(res.status).toBe(404)
  })
})
