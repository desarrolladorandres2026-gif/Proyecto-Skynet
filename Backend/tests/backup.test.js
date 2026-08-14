import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'

import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import RegistroAuditoria from '../src/models/RegistroAuditoria.js'
import ReporteDano from '../src/models/ReporteDano.js'
import '../src/models/Permiso.js'
import backupRoutes from '../src/modules/backup/backup.routes.js'
import { generarBackup } from '../src/modules/backup/backup.service.js'
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

function descargarBinario(req) {
  return req.buffer().parse((response, callback) => {
    response.setEncoding('binary')
    let data = ''
    response.on('data', (chunk) => { data += chunk })
    response.on('end', () => callback(null, Buffer.from(data, 'binary')))
  })
}

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

describe('Backup — catálogo de colecciones', () => {
  it('lista las colecciones disponibles para el panel de personalización', async () => {
    const rolAdmin = await crearRol({ esSuperAdmin: true })
    const admin = await crearUsuario(rolAdmin, { nombre_usuario: 'admin', email: 'admin@example.com' })
    const res = await request(app).get('/api/backup/colecciones').set('Authorization', `Bearer ${token(admin)}`)

    expect(res.status).toBe(200)
    const usuarios = res.body.colecciones.find((c) => c.clave === 'usuarios')
    expect(usuarios).toEqual({ clave: 'usuarios', hoja: 'Usuarios', filtrablePorFecha: false })
    const requerimientos = res.body.colecciones.find((c) => c.clave === 'requerimientos')
    expect(requerimientos.filtrablePorFecha).toBe(true)
  })
})

// A nivel de servicio (no HTTP): backupLimiter permite solo 5 peticiones por
// hora y este archivo ya consume parte de ese cupo en "control de acceso" y
// "generación del Excel" — probar cada combinación de colecciones/rango/
// formato vía supertest agotaría el límite real y estas pruebas empezarían a
// fallar con 429 en vez de validar la lógica. generarBackup() es la misma
// función que usa el controller, así que cubre exactamente lo mismo sin
// pasar por el rate limiter.
describe('Backup — panel de personalización (colecciones, rango, formato)', () => {
  let admin
  let usuarioActor

  beforeEach(async () => {
    const rolAdmin = await crearRol({ esSuperAdmin: true })
    admin = await crearUsuario(rolAdmin, { nombre_usuario: 'admin', email: 'admin@example.com' })
    usuarioActor = { id_usuario: admin._id, nombre_usuario: admin.nombre_usuario }

    await ReporteDano.create({
      tipo: 'dano',
      fecha: new Date('2025-01-15'),
      descripcion: 'Reporte fuera de rango',
      reportadoPor: admin._id,
    })
    await ReporteDano.create({
      tipo: 'dano',
      fecha: new Date('2026-06-15'),
      descripcion: 'Reporte dentro de rango',
      reportadoPor: admin._id,
    })
  })

  it('rechaza una clave de colección desconocida', async () => {
    await expect(generarBackup({ colecciones: 'usuarios,coleccion-inventada' }, usuarioActor)).rejects.toThrow()
  })

  it('rechaza un formato desconocido', async () => {
    await expect(generarBackup({ formato: 'pdf' }, usuarioActor)).rejects.toThrow()
  })

  it('rechaza "desde" posterior a "hasta"', async () => {
    await expect(
      generarBackup({ desde: '2026-06-01', hasta: '2026-01-01' }, usuarioActor)
    ).rejects.toThrow()
  })

  it('exporta solo las colecciones seleccionadas', async () => {
    const { buffer } = await generarBackup({ colecciones: 'usuarios' }, usuarioActor)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    expect(workbook.getWorksheet('Usuarios')).toBeDefined()
    expect(workbook.getWorksheet('Roles')).toBeUndefined()
    expect(workbook.getWorksheet('Reportes de daños')).toBeUndefined()
  })

  it('el rango de fechas filtra las colecciones con campoFecha, pero no las que no lo tienen', async () => {
    const { buffer } = await generarBackup(
      { colecciones: 'danos,usuarios', desde: '2026-01-01', hasta: '2026-12-31' },
      usuarioActor
    )
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const hojaDanos = workbook.getWorksheet('Reportes de daños')
    // fila 1 = encabezado, fila 2 = único registro dentro del rango
    expect(hojaDanos.rowCount).toBe(2)
    const colDescripcion = hojaDanos.getRow(1).values.indexOf('descripcion')
    expect(hojaDanos.getRow(2).getCell(colDescripcion).value).toBe('Reporte dentro de rango')

    // Usuarios no tiene campoFecha: el rango no le aplica, sigue completo.
    const hojaUsuarios = workbook.getWorksheet('Usuarios')
    expect(hojaUsuarios.rowCount).toBeGreaterThanOrEqual(2)
  })

  it('formato csv devuelve un .zip con un .csv por colección seleccionada', async () => {
    const { buffer, contentType, extension } = await generarBackup(
      { colecciones: 'usuarios,roles', formato: 'csv' },
      usuarioActor
    )
    expect(contentType).toBe('application/zip')
    expect(extension).toBe('zip')

    const zip = await JSZip.loadAsync(buffer)
    expect(Object.keys(zip.files).sort()).toEqual(['roles.csv', 'usuarios.csv'])
    const contenidoUsuarios = await zip.files['usuarios.csv'].async('string')
    expect(contenidoUsuarios).toContain('nombre_usuario')
    expect(contenidoUsuarios).not.toContain('password')
  })

  it('formato json devuelve un objeto con una clave por colección, referencias resueltas', async () => {
    const { buffer, contentType } = await generarBackup(
      { colecciones: 'usuarios,roles', formato: 'json' },
      usuarioActor
    )
    expect(contentType).toBe('application/json')

    const cuerpo = JSON.parse(buffer.toString('utf-8'))
    expect(Array.isArray(cuerpo.usuarios)).toBe(true)
    expect(Array.isArray(cuerpo.roles)).toBe(true)
    expect(cuerpo.usuarios.every((u) => !('password' in u))).toBe(true)

    const filaAdmin = cuerpo.usuarios.find((u) => u.nombre_usuario === 'admin')
    const rolDoc = await Rol.findById(admin.rol)
    expect(filaAdmin.rol).toBe(rolDoc.nombre)
  })

  it('la petición HTTP real también respeta colecciones/formato (una sola llamada, deja cupo al rate limiter)', async () => {
    const rolOtro = await crearRol({ esSuperAdmin: true })
    const otroAdmin = await crearUsuario(rolOtro, { nombre_usuario: 'admin2', email: 'admin2@example.com' })
    const res = await descargarBinario(
      request(app)
        .get('/api/backup/exportar?colecciones=usuarios&formato=xlsx')
        .set('Authorization', `Bearer ${token(otroAdmin)}`)
    )
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(res.body)
    expect(workbook.getWorksheet('Usuarios')).toBeDefined()
    expect(workbook.getWorksheet('Roles')).toBeUndefined()
  })

  // Regresión de BUG-005 (auditoría 2026-08-13). El límite superior del rango
  // se anclaba con `setHours(23,59,59,999)` sobre un Date parseado como UTC:
  // en el VPS (que corre en UTC), eso caía a las 6:59 p.m. hora de Neiva y
  // dejaba fuera del backup todo lo del turno de la noche del último día
  // pedido — silencioso, sin ningún error, en el módulo pensado justamente
  // para conservar el histórico.
  it('incluye un reporte del turno de la noche del último día del rango', async () => {
    await ReporteDano.create({
      tipo: 'dano',
      fecha: new Date('2026-08-14T04:00:00.000Z'), // 23:00 del 13 de agosto en Neiva
      descripcion: 'Reporte del turno de la noche',
      reportadoPor: admin._id,
    })

    const { buffer } = await generarBackup(
      { colecciones: 'danos', desde: '2026-08-13', hasta: '2026-08-13' },
      usuarioActor
    )
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const hoja = workbook.getWorksheet('Reportes de daños')
    expect(hoja.rowCount).toBe(2) // encabezado + el reporte de la noche
  })

  it('excluye un reporte del día siguiente al rango', async () => {
    await ReporteDano.create({
      tipo: 'dano',
      fecha: new Date('2026-08-14T05:00:00.000Z'), // 00:00 del 14 en Neiva: ya es el día 14
      descripcion: 'Reporte del día siguiente',
      reportadoPor: admin._id,
    })

    const { buffer } = await generarBackup(
      { colecciones: 'danos', desde: '2026-08-13', hasta: '2026-08-13' },
      usuarioActor
    )
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    expect(workbook.getWorksheet('Reportes de daños').rowCount).toBe(1) // solo encabezado
  })
})
