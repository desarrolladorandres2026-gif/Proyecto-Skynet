import { describe, it, expect, vi } from 'vitest'
import bcrypt from 'bcryptjs'

vi.mock('../src/utils/webpush.js', () => ({ default: { sendNotification: vi.fn() } }))
vi.mock('../src/utils/email.js', () => ({ enviarEmailGenerico: vi.fn() }))

import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import EnvioNotificacion from '../src/models/EnvioNotificacion.js'
import {
  crearRequerimiento,
  aprobarComoFinanciero,
  rechazarComoFinanciero,
  marcarEstadoBodega,
} from '../src/modules/requerimientos/requerimientos.service.js'

async function crearPermiso(codigo) {
  const [modulo, accion] = codigo.split(':')
  return Permiso.findOneAndUpdate(
    { codigo },
    { codigo, modulo, accion, nombre: codigo },
    { upsert: true, new: true }
  )
}

// Reproduce la forma de req.usuario que construye middleware/auth.js, sin
// pasar por HTTP: estos tests ejercitan la integración real entre el
// service de Requerimientos y el motor de notificaciones (vía Mongo en
// memoria), no la capa de transporte — el flujo era el gap real hasta este
// cambio (Requerimientos no avisaba a nadie en ningún paso).
async function crearUsuarioConPermiso(codigo) {
  const permiso = codigo ? await crearPermiso(codigo) : null
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({
    nombre: `Rol-${sufijo}`,
    slug: `rol-${sufijo}`,
    permisos: permiso ? [permiso._id] : [],
  })
  const passwordPlano = 'clave-segura-123'
  const usuario = await Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Prueba',
    password: await bcrypt.hash(passwordPlano, 4),
    email: `${sufijo}@example.com`,
    rol: rol._id,
    cargo: 'Tester',
  })
  const actor = {
    id_usuario: usuario._id,
    nombre_usuario: usuario.nombre_usuario,
    rol: { id: rol._id, nombre: rol.nombre, slug: rol.slug },
    esSuperAdmin: false,
    permisos: new Set(),
  }
  return { usuario, passwordPlano, actor }
}

describe('flujo de Requerimientos con notificaciones', () => {
  it('crear -> aprobar financiero -> aprobar bodega notifica en cada etapa', async () => {
    const { actor: actorSolicitante, usuario: solicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorFinanciero, usuario: financiero, passwordPlano: passFinanciero } =
      await crearUsuarioConPermiso('requerimientos:aprobar_financiero')
    const { actor: actorBodega, usuario: bodega } = await crearUsuarioConPermiso('requerimientos:gestionar_bodega')

    const req = await crearRequerimiento(
      { tipo: 'compra', itemsCompra: [{ descripcionProducto: 'Resma papel', cantidad: 2, fechaSolicitud: new Date() }] },
      actorSolicitante
    )

    const aviosFinanciero = await EnvioNotificacion.find({ usuario: financiero._id })
    expect(aviosFinanciero.length).toBeGreaterThan(0)
    expect(aviosFinanciero[0].categoria).toBe('requerimientos')

    await aprobarComoFinanciero(req._id, { password: passFinanciero }, actorFinanciero)

    const avisosBodega = await EnvioNotificacion.find({ usuario: bodega._id })
    expect(avisosBodega.length).toBeGreaterThan(0)

    await marcarEstadoBodega(req._id, { estado: 'aprobada' }, actorBodega)

    const avisosSolicitante = await EnvioNotificacion.find({ usuario: solicitante._id })
    expect(avisosSolicitante.length).toBeGreaterThan(0)
    expect(avisosSolicitante.some((e) => e.titulo.includes('aprobado'))).toBe(true)
  })

  it('marcar Bodega como "pendiente" (estado de entrada) no genera aviso al solicitante', async () => {
    const { actor: actorSolicitante, usuario: solicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorFinanciero, passwordPlano: passFinanciero } =
      await crearUsuarioConPermiso('requerimientos:aprobar_financiero')
    const { actor: actorBodega } = await crearUsuarioConPermiso('requerimientos:gestionar_bodega')

    const req = await crearRequerimiento(
      { tipo: 'servicio', detalleServicio: { descripcionTipoServicio: 'Aseo de oficinas' } },
      actorSolicitante
    )
    await aprobarComoFinanciero(req._id, { password: passFinanciero }, actorFinanciero)
    await EnvioNotificacion.deleteMany({ usuario: solicitante._id })

    await marcarEstadoBodega(req._id, { estado: 'pendiente' }, actorBodega)

    expect(await EnvioNotificacion.countDocuments({ usuario: solicitante._id })).toBe(0)
  })

  it('el rechazo de Financiero notifica al solicitante con el motivo', async () => {
    const { actor: actorSolicitante, usuario: solicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorFinanciero } = await crearUsuarioConPermiso('requerimientos:aprobar_financiero')

    const req = await crearRequerimiento(
      { tipo: 'servicio', detalleServicio: { descripcionTipoServicio: 'Mantenimiento aire acondicionado' } },
      actorSolicitante
    )

    await rechazarComoFinanciero(req._id, { motivoRechazo: 'Presupuesto no disponible' }, actorFinanciero)

    const avisos = await EnvioNotificacion.find({ usuario: solicitante._id })
    expect(avisos.some((e) => e.cuerpo === 'Presupuesto no disponible')).toBe(true)
  })
})
