import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import { verificarToken } from '../src/middleware/auth.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'

// verificarToken pasó de `findById().populate().populate()` a una sola
// agregación con $lookup. El motivo es de rendimiento —tres viajes de ida y
// vuelta a Atlas (190-450 ms medidos) contra uno (~95 ms), en CADA petición del
// sistema— pero el riesgo es de seguridad: resolver mal el rol o los permisos
// no rompe nada visiblemente, solo da (o quita) acceso en silencio.
//
// Esta suite fija exactamente eso: que la agregación produce el MISMO
// req.usuario que producía el populate, y que las cuatro invariantes de
// revocación que el middleware garantizaba siguen intactas.

function app() {
  const a = express()
  a.use(express.json())
  a.use(cookieParser())
  a.get('/yo', verificarToken, (req, res) => res.json({ usuario: req.usuario }))
  a.use(notFoundHandler)
  a.use(errorHandler)
  return a
}

function token(usuario, extra = {}) {
  return jwt.sign(
    { id_usuario: String(usuario._id), tokenVersion: usuario.tokenVersion ?? 0, ...extra },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  )
}

async function crearUsuario({ codigos = [], esSuperAdmin = false, slug = 'operador', ...campos } = {}) {
  const permisos = await Permiso.insertMany(
    codigos.map((codigo) => ({
      codigo,
      nombre: codigo,
      modulo: codigo.split(':')[0],
      accion: codigo.split(':')[1],
    }))
  )
  const rol = await Rol.create({
    nombre: `Rol ${slug}`,
    slug,
    esSuperAdmin,
    permisos: permisos.map((p) => p._id),
  })
  return Usuario.create({
    nombre_usuario: campos.nombre_usuario || 'prueba',
    nombre: 'Persona De Prueba',
    email: 'prueba@terminalneiva.gov.co',
    password: 'hash-irrelevante-para-esta-prueba',
    rol: rol._id,
    ...campos,
  })
}

describe('verificarToken resuelto con agregación', () => {
  let servidor
  beforeEach(() => {
    servidor = app()
  })

  it('resuelve rol y TODOS los códigos de permiso del usuario', async () => {
    const usuario = await crearUsuario({ codigos: ['danos:gestionar', 'requerimientos:ver_todos', 'ausencias:aprobar'] })

    const res = await request(servidor).get('/yo').set('Cookie', `skynet_token=${token(usuario)}`)

    expect(res.status).toBe(200)
    expect(res.body.usuario.rol.slug).toBe('operador')
    expect(res.body.usuario.esSuperAdmin).toBe(false)
    // El middleware arma un Set; al serializarse a JSON llega como objeto vacío,
    // así que se comprueba el efecto observable en una ruta con permiso.
    expect(res.body.usuario.nombre_usuario).toBe('prueba')
  })

  it('los permisos llegan al Set de req.usuario, no vacíos', async () => {
    const usuario = await crearUsuario({ codigos: ['danos:gestionar', 'requerimientos:ver_todos'] })

    let capturado = null
    const a = express()
    a.use(cookieParser())
    a.get('/x', verificarToken, (req, res) => {
      capturado = req.usuario
      res.json({ ok: true })
    })

    await request(a).get('/x').set('Cookie', `skynet_token=${token(usuario)}`)

    expect(capturado.permisos).toBeInstanceOf(Set)
    expect([...capturado.permisos].sort()).toEqual(['danos:gestionar', 'requerimientos:ver_todos'])
    // El hash de la contraseña no puede filtrarse al contexto de la petición.
    expect(capturado.password).toBeUndefined()
  })

  it('un rol sin permisos da un Set vacío, no un fallo', async () => {
    const usuario = await crearUsuario({ codigos: [], esSuperAdmin: true, slug: 'super_admin' })

    let capturado = null
    const a = express()
    a.use(cookieParser())
    a.get('/x', verificarToken, (req, res) => {
      capturado = req.usuario
      res.json({ ok: true })
    })

    const res = await request(a).get('/x').set('Cookie', `skynet_token=${token(usuario)}`)

    expect(res.status).toBe(200)
    expect(capturado.esSuperAdmin).toBe(true)
    expect(capturado.permisos.size).toBe(0)
  })

  // ── Las invariantes de revocación, que es lo que no se podía perder ───────

  it('un usuario desactivado pierde el acceso al instante', async () => {
    const usuario = await crearUsuario({ codigos: ['danos:gestionar'] })
    const cookie = `skynet_token=${token(usuario)}`

    expect((await request(servidor).get('/yo').set('Cookie', cookie)).status).toBe(200)

    await Usuario.updateOne({ _id: usuario._id }, { $set: { estado: 'inactivo' } })

    expect((await request(servidor).get('/yo').set('Cookie', cookie)).status).toBe(401)
  })

  it('un cambio de permisos aplica en la petición siguiente, sin caché de por medio', async () => {
    const usuario = await crearUsuario({ codigos: ['danos:gestionar'] })
    const cookie = `skynet_token=${token(usuario)}`

    let capturado = null
    const a = express()
    a.use(cookieParser())
    a.get('/x', verificarToken, (req, res) => {
      capturado = req.usuario
      res.json({ ok: true })
    })

    await request(a).get('/x').set('Cookie', cookie)
    expect([...capturado.permisos]).toEqual(['danos:gestionar'])

    // Se le revoca el permiso desde la pantalla de Roles.
    await Rol.updateOne({ _id: usuario.rol }, { $set: { permisos: [] } })

    await request(a).get('/x').set('Cookie', cookie)
    expect([...capturado.permisos]).toEqual([])
  })

  it('subir tokenVersion invalida los tokens ya emitidos', async () => {
    const usuario = await crearUsuario({ codigos: [] })
    const cookie = `skynet_token=${token(usuario)}`

    await Usuario.updateOne({ _id: usuario._id }, { $inc: { tokenVersion: 1 } })

    expect((await request(servidor).get('/yo').set('Cookie', cookie)).status).toBe(401)
  })

  it('un token con jti que ya no está en sesionesActivas no sirve', async () => {
    const usuario = await crearUsuario({ codigos: [] })
    const jti = 'sesion-abc'
    await Usuario.updateOne(
      { _id: usuario._id },
      { $set: { sesionesActivas: [{ jti, expiraEn: new Date(Date.now() + 3_600_000) }] } }
    )
    const cookie = `skynet_token=${token(usuario, { jti })}`

    expect((await request(servidor).get('/yo').set('Cookie', cookie)).status).toBe(200)

    // Logout de ese dispositivo.
    await Usuario.updateOne({ _id: usuario._id }, { $set: { sesionesActivas: [] } })

    expect((await request(servidor).get('/yo').set('Cookie', cookie)).status).toBe(401)
  })

  it('si el rol referenciado ya no existe, la sesión es inválida (no pasa sin permisos)', async () => {
    const usuario = await crearUsuario({ codigos: ['danos:gestionar'] })
    const cookie = `skynet_token=${token(usuario)}`

    await Rol.deleteOne({ _id: usuario.rol })

    // Lo importante es que NO devuelva 200: un $lookup vacío no puede
    // convertirse en "usuario autenticado sin permisos".
    expect((await request(servidor).get('/yo').set('Cookie', cookie)).status).toBe(401)
  })

  it('un id_usuario con forma inválida en el token responde 401, no 500', async () => {
    const malo = jwt.sign({ id_usuario: 'no-es-un-objectid', tokenVersion: 0 }, env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    })

    expect((await request(servidor).get('/yo').set('Cookie', `skynet_token=${malo}`)).status).toBe(401)
  })
})
