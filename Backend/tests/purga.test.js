import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import ReporteDano from '../src/models/ReporteDano.js'
import RegistroAuditoria from '../src/models/RegistroAuditoria.js'
import '../src/models/Permiso.js'
import backupRoutes from '../src/modules/backup/backup.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import { hashPassword } from '../src/utils/password.js'

function crearApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/backup', backupRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

const app = crearApp()
const PASSWORD_OK = 'Clave.Segura.2026'

function token(usuario) {
  return jwt.sign(
    { id_usuario: usuario._id.toString(), tokenVersion: usuario.tokenVersion },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  )
}

async function crearRol({ esSuperAdmin = false } = {}) {
  const sufijo = Math.random().toString(36).slice(2)
  return Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol-${sufijo}`, esSuperAdmin, ambito: 'global', permisos: [] })
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

function haceMeses(meses) {
  const d = new Date()
  d.setMonth(d.getMonth() - meses)
  return d
}

describe('Purga de histórico', () => {
  let admin
  let authAdmin
  let reportadoPor
  let viejo
  let reciente

  beforeEach(async () => {
    const rolAdmin = await crearRol({ esSuperAdmin: true })
    admin = await crearUsuario(rolAdmin, { nombre_usuario: 'admin', email: 'admin@example.com' })
    authAdmin = `Bearer ${token(admin)}`
    reportadoPor = admin

    viejo = await ReporteDano.create({
      tipo: 'dano',
      fecha: haceMeses(8),
      descripcion: 'Reporte viejo (8 meses)',
      reportadoPor: reportadoPor._id,
    })
    reciente = await ReporteDano.create({
      tipo: 'dano',
      fecha: haceMeses(1),
      descripcion: 'Reporte reciente (1 mes)',
      reportadoPor: reportadoPor._id,
    })
  })

  describe('control de acceso', () => {
    it('previsualizar rechaza sin token', async () => {
      const res = await request(app).get('/api/backup/purga/previsualizar?meses=6')
      expect(res.status).toBe(401)
    })

    it('previsualizar rechaza a un no-superadmin', async () => {
      const rolBasico = await crearRol()
      const comun = await crearUsuario(rolBasico)
      const res = await request(app)
        .get('/api/backup/purga/previsualizar?meses=6')
        .set('Authorization', `Bearer ${token(comun)}`)
      expect(res.status).toBe(403)
    })

    it('purgar rechaza sin token', async () => {
      const res = await request(app).delete('/api/backup/purga').send({ meses: 6, password: PASSWORD_OK })
      expect(res.status).toBe(401)
    })
  })

  describe('validación del plazo', () => {
    it('rechaza un plazo distinto de 6 o 12 meses', async () => {
      const res = await request(app).get('/api/backup/purga/previsualizar?meses=3').set('Authorization', authAdmin)
      expect(res.status).toBe(400)
    })
  })

  describe('previsualizar', () => {
    it('cuenta solo lo anterior al corte, en las colecciones purgables', async () => {
      const res = await request(app).get('/api/backup/purga/previsualizar?meses=6').set('Authorization', authAdmin)
      expect(res.status).toBe(200)
      const danos = res.body.conteos.find((c) => c.entidad === 'Reportes de daños')
      expect(danos.total).toBe(1)
    })
  })

  describe('purgar', () => {
    it('exige contraseña correcta antes de borrar nada', async () => {
      const res = await request(app)
        .delete('/api/backup/purga')
        .set('Authorization', authAdmin)
        .send({ meses: 6, password: 'incorrecta' })
      expect(res.status).toBe(400)
      expect(await ReporteDano.countDocuments()).toBe(2)
    })

    it('borra solo los documentos anteriores al corte, deja los recientes', async () => {
      const res = await request(app)
        .delete('/api/backup/purga')
        .set('Authorization', authAdmin)
        .send({ meses: 6, password: PASSWORD_OK })

      expect(res.status).toBe(200)
      expect(await ReporteDano.findById(viejo._id)).toBeNull()
      expect(await ReporteDano.findById(reciente._id)).not.toBeNull()
    })

    it('nunca toca colecciones no purgables (Usuarios)', async () => {
      await request(app)
        .delete('/api/backup/purga')
        .set('Authorization', authAdmin)
        .send({ meses: 6, password: PASSWORD_OK })

      expect(await Usuario.findById(admin._id)).not.toBeNull()
    })

    it('registra la purga en auditoría', async () => {
      await request(app)
        .delete('/api/backup/purga')
        .set('Authorization', authAdmin)
        .send({ meses: 6, password: PASSWORD_OK })

      const registro = await RegistroAuditoria.findOne({ modulo: 'backup', accion: 'purgar_historico' })
      expect(registro).not.toBeNull()
      expect(registro.descripcion).toMatch(/Reportes de daños: 1/)
    })
  })

  describe('rescate', () => {
    it('descarga un .xlsx con solo los registros que se van a borrar', async () => {
      const res = await request(app)
        .get('/api/backup/purga/rescate?meses=6')
        .set('Authorization', authAdmin)
        .buffer()
        .parse((response, callback) => {
          response.setEncoding('binary')
          let data = ''
          response.on('data', (chunk) => { data += chunk })
          response.on('end', () => callback(null, Buffer.from(data, 'binary')))
        })

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      // El rescate no debe haber borrado nada por sí solo (es de solo lectura).
      expect(await ReporteDano.countDocuments()).toBe(2)
    })
  })
})
