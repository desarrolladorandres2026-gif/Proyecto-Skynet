import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import ExcelJS from 'exceljs'

import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
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

describe('Backup — control de acceso', () => {
  it('rechaza sin token', async () => {
    const res = await request(app).get('/api/backup/exportar')
    expect(res.status).toBe(401)
  })

  it('rechaza a un usuario que no es superadmin', async () => {
    const rolBasico = await crearRol()
    const comun = await crearUsuario(rolBasico)
    const res = await request(app).get('/api/backup/exportar').set('Authorization', `Bearer ${token(comun)}`)
    expect(res.status).toBe(403)
  })
})

describe('Backup — generación del Excel', () => {
  let admin
  let authAdmin

  beforeEach(async () => {
    const rolAdmin = await crearRol({ esSuperAdmin: true })
    admin = await crearUsuario(rolAdmin, { nombre_usuario: 'admin', email: 'admin@example.com' })
    authAdmin = `Bearer ${token(admin)}`
  })

  it('devuelve un .xlsx descargable con hoja Resumen y Usuarios, sin exponer contraseñas', async () => {
    const res = await request(app)
      .get('/api/backup/exportar')
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
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="skynet-backup-\d{4}-\d{2}-\d{2}\.xlsx"/)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(res.body)

    const resumen = workbook.getWorksheet('Resumen')
    expect(resumen).toBeDefined()

    const hojaUsuarios = workbook.getWorksheet('Usuarios')
    expect(hojaUsuarios).toBeDefined()
    const encabezados = hojaUsuarios.getRow(1).values.filter(Boolean)
    expect(encabezados).not.toContain('password')
    expect(encabezados).toContain('nombre_usuario')

    const filaAdmin = hojaUsuarios.getRow(2).values
    expect(filaAdmin.some((v) => v === 'admin')).toBe(true)
  })

  it('el rol del usuario sale resuelto por nombre, no como ObjectId crudo', async () => {
    const res = await request(app)
      .get('/api/backup/exportar')
      .set('Authorization', authAdmin)
      .buffer()
      .parse((response, callback) => {
        response.setEncoding('binary')
        let data = ''
        response.on('data', (chunk) => { data += chunk })
        response.on('end', () => callback(null, Buffer.from(data, 'binary')))
      })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(res.body)
    const hojaUsuarios = workbook.getWorksheet('Usuarios')
    const encabezados = hojaUsuarios.getRow(1).values
    const colRol = encabezados.indexOf('rol')
    const valorRol = hojaUsuarios.getRow(2).getCell(colRol).value

    const rolDoc = await Rol.findById((await Usuario.findOne({ nombre_usuario: 'admin' })).rol)
    expect(valorRol).toBe(rolDoc.nombre)
  })

  it('registra la generación del backup en la auditoría', async () => {
    await request(app).get('/api/backup/exportar').set('Authorization', authAdmin)

    const registro = await RegistroAuditoria.findOne({ modulo: 'backup', accion: 'generar_backup' })
    expect(registro).not.toBeNull()
    expect(registro.usuarioNombre).toBe('admin')
  })
})
