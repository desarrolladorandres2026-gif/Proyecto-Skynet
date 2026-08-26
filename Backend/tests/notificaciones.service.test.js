import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/utils/webpush.js', () => ({ default: { sendNotification: vi.fn() } }))
vi.mock('../src/utils/email.js', () => ({ enviarEmailGenerico: vi.fn() }))

import webpush from '../src/utils/webpush.js'
import { enviarEmailGenerico } from '../src/utils/email.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import PushSubscription from '../src/models/PushSubscription.js'
import PreferenciaNotificacion from '../src/models/PreferenciaNotificacion.js'
import ConfiguracionCanalesNotificacion from '../src/models/ConfiguracionCanalesNotificacion.js'
import EnvioNotificacion from '../src/models/EnvioNotificacion.js'
import {
  notificar,
  procesarPendientes,
  obtenerConfiguracionCanales,
  actualizarConfiguracionCanales,
} from '../src/modules/notificaciones/notificaciones.service.js'
import { notificarUsuarios } from '../src/utils/sendPush.js'

async function crearUsuario() {
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol-${sufijo}` })
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Prueba',
    password: 'hash-no-usado-en-estos-tests',
    email: `${sufijo}@example.com`,
    rol: rol._id,
  })
}

describe('notificaciones.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('un usuario sin preferencias recibe push y email por defecto', async () => {
    const usuario = await crearUsuario()
    await PushSubscription.create({ usuario: usuario._id, endpoint: 'https://push.test/1', p256dh: 'p', auth: 'a' })

    await notificar({
      usuarios: [usuario._id], categoria: 'requerimientos', tipo: 'test', titulo: 'Título', cuerpo: 'Cuerpo',
    })

    const envios = await EnvioNotificacion.find({ usuario: usuario._id })
    expect(envios).toHaveLength(2)
    expect(envios.map((e) => e.canal).sort()).toEqual(['email', 'push'])
    expect(envios.every((e) => e.estado === 'pendiente')).toBe(true)
  })

  it('una categoría desactivada por el usuario bloquea ambos canales para esa categoría', async () => {
    const usuario = await crearUsuario()
    await PushSubscription.create({ usuario: usuario._id, endpoint: 'https://push.test/2', p256dh: 'p', auth: 'a' })
    await PreferenciaNotificacion.create({ usuario: usuario._id, categorias: { requerimientos: false } })

    await notificar({
      usuarios: [usuario._id], categoria: 'requerimientos', tipo: 'test', titulo: 'Título', cuerpo: 'Cuerpo',
    })

    expect(await EnvioNotificacion.countDocuments({ usuario: usuario._id })).toBe(0)
  })

  it('un evento transaccional ignora las preferencias del usuario', async () => {
    const usuario = await crearUsuario()
    await PreferenciaNotificacion.create({ usuario: usuario._id, email: { activo: false }, push: { activo: false } })

    await notificar({
      usuarios: [usuario._id], categoria: 'sistema', tipo: 'alerta-seguridad', titulo: 'Alerta', cuerpo: 'Cuerpo',
      transaccional: true,
    })

    const envios = await EnvioNotificacion.find({ usuario: usuario._id })
    expect(envios).toHaveLength(1) // solo email: sin suscripción push registrada
    expect(envios[0].canal).toBe('email')
  })

  it('notificarUsuarios (API legada, sin categoría) nunca manda email aunque el usuario tenga uno', async () => {
    const usuario = await crearUsuario()
    await PushSubscription.create({ usuario: usuario._id, endpoint: 'https://push.test/3', p256dh: 'p', auth: 'a' })

    await notificarUsuarios([usuario._id], { titulo: 'Aviso', cuerpo: 'Cuerpo' })

    const envios = await EnvioNotificacion.find({ usuario: usuario._id })
    expect(envios).toHaveLength(1)
    expect(envios[0].canal).toBe('push')
  })

  it('notificarUsuarios con categoría sí respeta la preferencia de esa categoría', async () => {
    const usuario = await crearUsuario()
    await PreferenciaNotificacion.create({ usuario: usuario._id, categorias: { mantenimiento: false } })

    await notificarUsuarios([usuario._id], { titulo: 'Orden asignada', cuerpo: 'Cuerpo' }, 'mantenimiento')

    expect(await EnvioNotificacion.countDocuments({ usuario: usuario._id })).toBe(0)
  })

  it('un push que responde 410 borra la suscripción y marca el envío como fallido sin reintentar', async () => {
    const usuario = await crearUsuario()
    const sub = await PushSubscription.create({ usuario: usuario._id, endpoint: 'https://push.test/4', p256dh: 'p', auth: 'a' })
    webpush.sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))

    const envio = await EnvioNotificacion.create({
      usuario: usuario._id, canal: 'push', categoria: 'requerimientos', tipo: 'test',
      titulo: 'T', cuerpo: 'C', pushSubscription: sub._id, estado: 'pendiente', proximoIntentoEn: new Date(),
    })

    await procesarPendientes(10)

    const envioActualizado = await EnvioNotificacion.findById(envio._id)
    expect(envioActualizado.estado).toBe('fallido')
    expect(await PushSubscription.findById(sub._id)).toBeNull()
  })

  it('un fallo de email genérico se reintenta con backoff en vez de marcarse fallido de inmediato', async () => {
    const usuario = await crearUsuario()
    enviarEmailGenerico.mockRejectedValueOnce(new Error('SMTP caído'))

    const envio = await EnvioNotificacion.create({
      usuario: usuario._id, canal: 'email', categoria: 'requerimientos', tipo: 'test',
      titulo: 'T', cuerpo: 'C', emailDestino: usuario.email, estado: 'pendiente', proximoIntentoEn: new Date(),
    })

    await procesarPendientes(10)

    const envioActualizado = await EnvioNotificacion.findById(envio._id)
    expect(envioActualizado.estado).toBe('pendiente')
    expect(envioActualizado.intentos).toBe(1)
    expect(envioActualizado.proximoIntentoEn.getTime()).toBeGreaterThan(Date.now())
  })

  it('un envío que agota maxIntentos se marca fallido', async () => {
    const usuario = await crearUsuario()
    enviarEmailGenerico.mockRejectedValueOnce(new Error('SMTP caído'))

    const envio = await EnvioNotificacion.create({
      usuario: usuario._id, canal: 'email', categoria: 'requerimientos', tipo: 'test',
      titulo: 'T', cuerpo: 'C', emailDestino: usuario.email, estado: 'pendiente', proximoIntentoEn: new Date(),
      intentos: 4, maxIntentos: 5,
    })

    await procesarPendientes(10)

    const envioActualizado = await EnvioNotificacion.findById(envio._id)
    expect(envioActualizado.estado).toBe('fallido')
    expect(envioActualizado.intentos).toBe(5)
  })

  describe('Configuracion global de canales (Elección de notificaciones)', () => {
    it('si una categoría tiene email:false en la configuración global, solo envía push y no email', async () => {
      const usuario = await crearUsuario()
      await PushSubscription.create({ usuario: usuario._id, endpoint: 'https://push.test/canal1', p256dh: 'p', auth: 'a' })

      await actualizarConfiguracionCanales({
        canales: {
          sig_pregunta_dia: { email: false, push: true, activo: true },
        },
      })

      await notificar({
        usuarios: [usuario._id],
        categoria: 'sig_pregunta_dia',
        tipo: 'pregunta-publicada',
        titulo: 'Pregunta SIG',
        cuerpo: 'Contenido',
      })

      const envios = await EnvioNotificacion.find({ usuario: usuario._id })
      expect(envios).toHaveLength(1)
      expect(envios[0].canal).toBe('push')
    })

    it('si emailGlobal está desactivado, ninguna categoría envía email', async () => {
      const usuario = await crearUsuario()
      await PushSubscription.create({ usuario: usuario._id, endpoint: 'https://push.test/canal2', p256dh: 'p', auth: 'a' })

      await actualizarConfiguracionCanales({
        emailGlobal: { activo: false },
        canales: {
          requerimientos: { email: true, push: true, activo: true },
        },
      })

      await notificar({
        usuarios: [usuario._id],
        categoria: 'requerimientos',
        tipo: 'aprobado',
        titulo: 'Requerimiento',
        cuerpo: 'Aprobado',
      })

      const envios = await EnvioNotificacion.find({ usuario: usuario._id })
      expect(envios).toHaveLength(1)
      expect(envios[0].canal).toBe('push')
    })

    it('permite consultar la configuración por defecto y actualizarla', async () => {
      await ConfiguracionCanalesNotificacion.deleteMany({})

      const configInicial = await obtenerConfiguracionCanales()
      expect(configInicial.emailGlobal.activo).toBe(true)
      expect(configInicial.pushGlobal.activo).toBe(true)
      expect(configInicial.canales.mantenimiento).toEqual({ email: true, push: true, activo: true })

      const configActualizada = await actualizarConfiguracionCanales({
        canales: {
          danos: { email: false, push: true, activo: true },
        },
      })

      expect(configActualizada.canales.danos.email).toBe(false)
      expect(configActualizada.canales.danos.push).toBe(true)
    })
  })
})

