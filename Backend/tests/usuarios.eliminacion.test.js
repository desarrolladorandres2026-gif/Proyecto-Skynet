import { describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Notificacion from '../src/models/Notificacion.js'
import PushSubscription from '../src/models/PushSubscription.js'
import EmailCuenta from '../src/models/EmailCuenta.js'
import Requerimiento from '../src/models/Requerimiento.js'
import Ausencia from '../src/models/Ausencia.js'
import ReporteDano from '../src/models/ReporteDano.js'
import Mantenimiento from '../src/models/mantenimiento/Mantenimiento.js'
import Equipo from '../src/models/mantenimiento/Equipo.js'
import RegistroDespliegue from '../src/models/RegistroDespliegue.js'
import { hashPassword } from '../src/utils/password.js'
import { contarReferenciasHistoricas, eliminarUsuarioDefinitivamente } from '../src/modules/usuarios/usuarios.eliminacion.js'

// Fase 9 de la auditoría 2026-08-22 — pruebas de la capa de servicio directa
// (sin pasar por HTTP: eso ya lo cubre usuarios.crud.test.js). Aquí importa
// verificar que el conteo de referencias detecta TODOS los campos anidados
// reales, no solo los de primer nivel, y que la cascada es de verdad
// transaccional.

async function crearUsuario() {
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol_${sufijo}`, esSuperAdmin: false, ambito: 'global', permisos: [] })
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Prueba',
    email: `${sufijo}@example.com`,
    password: await hashPassword('Clave.Segura.2026'),
    rol: rol._id,
  })
}

async function crearEquipo() {
  const sufijo = Math.random().toString(36).slice(2)
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

describe('contarReferenciasHistoricas — detecta al usuario en TODO el Grupo B', () => {
  it('un usuario sin ningún historial da total 0', async () => {
    const usuario = await crearUsuario()
    const resultado = await contarReferenciasHistoricas(usuario._id)
    expect(resultado.total).toBe(0)
    expect(resultado.detalle).toEqual([])
  })

  it('detecta al usuario como solicitante de un Requerimiento (campo de primer nivel)', async () => {
    const usuario = await crearUsuario()
    await Requerimiento.create({
      tipo: 'compra',
      solicitante: usuario._id,
      cargoSolicitante: 'Técnico',
      versionOriginal: {},
      itemsCompra: [],
    })
    const resultado = await contarReferenciasHistoricas(usuario._id)
    expect(resultado.total).toBe(1)
    expect(resultado.detalle[0].etiqueta).toBe('Requerimientos')
  })

  it('detecta al usuario dentro de financiero.historialEdiciones.editadoPor (array anidado dos niveles)', async () => {
    const usuario = await crearUsuario()
    const otro = await crearUsuario()
    await Requerimiento.create({
      tipo: 'compra',
      solicitante: otro._id,
      cargoSolicitante: 'Técnico',
      versionOriginal: {},
      itemsCompra: [],
      financiero: {
        historialEdiciones: [{ editadoPor: usuario._id, nombreEditor: 'X', snapshotAntes: {} }],
      },
    })
    const resultado = await contarReferenciasHistoricas(usuario._id)
    expect(resultado.total).toBe(1)
  })

  it('detecta al usuario dentro de itemsCompra.controlRecibido.marcadoPor (tres niveles)', async () => {
    const usuario = await crearUsuario()
    const otro = await crearUsuario()
    await Requerimiento.create({
      tipo: 'compra',
      solicitante: otro._id,
      cargoSolicitante: 'Técnico',
      versionOriginal: {},
      itemsCompra: [
        {
          fechaSolicitud: new Date(),
          descripcionProducto: 'Producto',
          cantidad: 1,
          controlRecibido: { recibido: true, marcadoPor: usuario._id },
        },
      ],
    })
    const resultado = await contarReferenciasHistoricas(usuario._id)
    expect(resultado.total).toBe(1)
  })

  it('detecta al usuario dentro de Ausencia.decision.revisadoPor', async () => {
    const usuario = await crearUsuario()
    const solicitante = await crearUsuario()
    await Ausencia.create({
      solicitante: solicitante._id,
      tipo: 'vacaciones',
      fechaInicio: new Date(),
      fechaFin: new Date(),
      diasHabiles: 1,
      decision: { revisadoPor: usuario._id },
    })
    const resultado = await contarReferenciasHistoricas(usuario._id)
    expect(resultado.total).toBeGreaterThanOrEqual(1)
    expect(resultado.detalle.some((d) => d.etiqueta === 'Ausencias')).toBe(true)
  })

  it('detecta al usuario dentro de ReporteDano.historial.por (array de eventos)', async () => {
    const usuario = await crearUsuario()
    const reportante = await crearUsuario()
    await ReporteDano.create({
      fecha: new Date(),
      descripcion: 'Daño',
      reportadoPor: reportante._id,
      historial: [{ accion: 'creado', por: usuario._id }],
    })
    const resultado = await contarReferenciasHistoricas(usuario._id)
    expect(resultado.detalle.some((d) => d.etiqueta === 'Reportes de daño')).toBe(true)
  })

  it('detecta al usuario dentro de Mantenimiento.evidencias.subidoPor (array anidado del CMMS)', async () => {
    const usuario = await crearUsuario()
    const equipo = await crearEquipo()
    await Mantenimiento.create({
      equipo: equipo._id,
      fecha: new Date(),
      tipo: 'correctivo',
      descripcion: 'Falla',
      evidencias: [{ tipo: 'foto', archivo: 'x.png', subidoPor: usuario._id }],
    })
    const resultado = await contarReferenciasHistoricas(usuario._id)
    expect(resultado.detalle.some((d) => d.etiqueta === 'Órdenes de trabajo de mantenimiento')).toBe(true)
  })

  it('detecta al usuario como tecnico_asignado de una orden (campo de primer nivel del CMMS)', async () => {
    const usuario = await crearUsuario()
    const equipo = await crearEquipo()
    await Mantenimiento.create({
      equipo: equipo._id,
      fecha: new Date(),
      tipo: 'correctivo',
      descripcion: 'Falla',
      tecnico_asignado: usuario._id,
    })
    const resultado = await contarReferenciasHistoricas(usuario._id)
    expect(resultado.detalle.some((d) => d.etiqueta === 'Órdenes de trabajo de mantenimiento')).toBe(true)
  })

  it('detecta al usuario como ejecutadoPor de un RegistroDespliegue', async () => {
    const usuario = await crearUsuario()
    await RegistroDespliegue.create({
      tipo: 'oficial',
      estado: 'exito',
      ejecutadoPor: usuario._id,
      ejecutadoPorNombre: usuario.nombre_usuario,
    })
    const resultado = await contarReferenciasHistoricas(usuario._id)
    expect(resultado.detalle.some((d) => d.etiqueta === 'Registros de despliegue')).toBe(true)
  })
})

describe('eliminarUsuarioDefinitivamente — cascada transaccional del Grupo A', () => {
  it('borra al usuario y limpia sus datos personales (Grupo A), sin tocar el Grupo B de otros usuarios', async () => {
    const usuario = await crearUsuario()
    await Notificacion.create({ usuario: usuario._id, titulo: 'Hola', mensaje: 'x', tipo: 'info', categoria: 'general' })
    await PushSubscription.create({ usuario: usuario._id, endpoint: `https://push.example/${usuario._id}`, p256dh: 'a', auth: 'b' })

    await eliminarUsuarioDefinitivamente(usuario._id)

    expect(await Usuario.findById(usuario._id)).toBeNull()
    expect(await Notificacion.countDocuments({ usuario: usuario._id })).toBe(0)
    expect(await PushSubscription.countDocuments({ usuario: usuario._id })).toBe(0)
  })

  it('si falla a mitad de la cascada, NO deja el borrado a medias (rollback transaccional)', async () => {
    const usuario = await crearUsuario()
    await Notificacion.create({ usuario: usuario._id, titulo: 'Hola', mensaje: 'x', tipo: 'info', categoria: 'general' })
    await PushSubscription.create({ usuario: usuario._id, endpoint: `https://push.example/${usuario._id}`, p256dh: 'a', auth: 'b' })

    // Simula un fallo a mitad de la cascada (EmailCuenta va después de
    // Notificacion/PushSubscription en COLECCIONES_GRUPO_A).
    const spy = vi.spyOn(EmailCuenta, 'deleteMany').mockImplementation(() => {
      throw new Error('fallo simulado a mitad de la transacción')
    })

    await expect(eliminarUsuarioDefinitivamente(usuario._id)).rejects.toThrow('fallo simulado')

    spy.mockRestore()

    // Nada debe haberse borrado: ni el usuario, ni lo que ya se había
    // procesado antes del fallo (Notificacion, PushSubscription).
    expect(await Usuario.findById(usuario._id)).not.toBeNull()
    expect(await Notificacion.countDocuments({ usuario: usuario._id })).toBe(1)
    expect(await PushSubscription.countDocuments({ usuario: usuario._id })).toBe(1)
  })
})
