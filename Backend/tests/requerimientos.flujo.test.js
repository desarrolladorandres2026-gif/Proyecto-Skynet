import { describe, it, expect, vi } from 'vitest'
import bcrypt from 'bcryptjs'

vi.mock('../src/utils/webpush.js', () => ({ default: { sendNotification: vi.fn() } }))
vi.mock('../src/utils/email.js', () => ({ enviarEmailGenerico: vi.fn() }))

import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import Requerimiento from '../src/models/Requerimiento.js'
import EnvioNotificacion from '../src/models/EnvioNotificacion.js'
import {
  crearRequerimiento,
  aprobarComoFinanciero,
  rechazarComoFinanciero,
  marcarEstadoBodega,
  exportarCsv,
  eliminarPorRangoFecha,
} from '../src/modules/requerimientos/requerimientos.service.js'

async function crearPermiso(codigo) {
  const [modulo, accion] = codigo.split(':')
  return Permiso.findOneAndUpdate(
    { codigo },
    { codigo, modulo, accion, nombre: codigo },
    { upsert: true, new: true }
  )
}

// Las notificaciones se disparan sin await a propósito (ver
// requerimientos.service.js: el solicitante no debe esperar a que salga el
// correo). Consultarlas inmediatamente después de la llamada al service es una
// carrera: hay que esperarlas activamente o la prueba falla de forma
// intermitente.
async function esperarNotificaciones(filtro, intentos = 50) {
  for (let i = 0; i < intentos; i += 1) {
    const encontradas = await EnvioNotificacion.find(filtro)
    if (encontradas.length > 0) return encontradas
    await new Promise((r) => setTimeout(r, 20))
  }
  return []
}

// Reproduce la forma de req.usuario que construye middleware/auth.js, sin
// pasar por HTTP: estos tests ejercitan la integración real entre el
// service de Requerimientos y el motor de notificaciones (vía Mongo en
// memoria), no la capa de transporte — el flujo era el gap real hasta este
// cambio (Requerimientos no avisaba a nadie en ningún paso).
// conFirma: aprobarComoFinanciero ahora exige usuario.firma.url (ver
// requerimientos.service.js) — cualquier test que apruebe como Financiero
// necesita crear a ese actor con conFirma:true, o el service corta con
// ErrorValidacion antes de tocar el documento.
async function crearUsuarioConPermiso(codigo, { conFirma = false } = {}) {
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
    firma: conFirma
      ? { url: 'https://res.cloudinary.com/test/firma.png', publicId: `test/firma-${sufijo}` }
      : undefined,
  })
  const actor = {
    id_usuario: usuario._id,
    nombre_usuario: usuario.nombre_usuario,
    rol: { id: rol._id, nombre: rol.nombre, slug: rol.slug },
    esSuperAdmin: false,
    // Antes quedaba siempre vacío: como ningún service leía permisos.has()
    // (solo el estado del doc + reautenticación), la omisión nunca se notó
    // hasta filtroAlcanceExport(). Reproduce lo que arma verificarToken en
    // producción a partir del rol resuelto.
    permisos: new Set(permiso ? [permiso.codigo] : []),
  }
  return { usuario, passwordPlano, actor }
}

describe('flujo de Requerimientos con notificaciones', () => {
  it('crear -> aprobar financiero -> aprobar bodega notifica en cada etapa', async () => {
    const { actor: actorSolicitante, usuario: solicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorFinanciero, usuario: financiero, passwordPlano: passFinanciero } =
      await crearUsuarioConPermiso('requerimientos:aprobar_financiero', { conFirma: true })
    const { actor: actorBodega, usuario: bodega, passwordPlano: passBodega } =
      await crearUsuarioConPermiso('requerimientos:gestionar_bodega')

    const req = await crearRequerimiento(
      { tipo: 'compra', itemsCompra: [{ descripcionProducto: 'Resma papel', cantidad: 2, fechaSolicitud: new Date() }] },
      actorSolicitante
    )

    const aviosFinanciero = await esperarNotificaciones({ usuario: financiero._id })
    expect(aviosFinanciero.length).toBeGreaterThan(0)
    expect(aviosFinanciero[0].categoria).toBe('requerimientos')

    await aprobarComoFinanciero(req._id, { password: passFinanciero }, actorFinanciero)

    const avisosBodega = await esperarNotificaciones({ usuario: bodega._id })
    expect(avisosBodega.length).toBeGreaterThan(0)

    await marcarEstadoBodega(req._id, { estado: 'aprobada', password: passBodega }, actorBodega)

    const avisosSolicitante = await esperarNotificaciones({ usuario: solicitante._id })
    expect(avisosSolicitante.length).toBeGreaterThan(0)
    expect(avisosSolicitante.some((e) => e.titulo.includes('despachado'))).toBe(true)
  })

  it('marcar Bodega como "pendiente" (estado de entrada) no genera aviso al solicitante', async () => {
    const { actor: actorSolicitante, usuario: solicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorFinanciero, passwordPlano: passFinanciero } =
      await crearUsuarioConPermiso('requerimientos:aprobar_financiero', { conFirma: true })
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

  it('marcar Bodega como "no se puede despachar" exige motivo y notifica a solicitante, Financiero y Admin', async () => {
    const { actor: actorSolicitante, usuario: solicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorFinanciero, usuario: financiero, passwordPlano: passFinanciero } =
      await crearUsuarioConPermiso('requerimientos:aprobar_financiero', { conFirma: true })
    const { actor: actorBodega } = await crearUsuarioConPermiso('requerimientos:gestionar_bodega')

    const rolAdmin = await Rol.create({ nombre: 'Administrador', slug: 'administrador', permisos: [] })
    const admin = await Usuario.create({
      nombre_usuario: `admin-${Math.random().toString(36).slice(2)}`,
      nombre: 'Admin Prueba',
      password: await bcrypt.hash('clave-segura-123', 4),
      email: `admin-${Math.random().toString(36).slice(2)}@example.com`,
      rol: rolAdmin._id,
      cargo: 'Administrador',
    })

    const req = await crearRequerimiento(
      { tipo: 'servicio', detalleServicio: { descripcionTipoServicio: 'Fumigación' } },
      actorSolicitante
    )
    await aprobarComoFinanciero(req._id, { password: passFinanciero }, actorFinanciero)

    await expect(
      marcarEstadoBodega(req._id, { estado: 'no_aprobada' }, actorBodega)
    ).rejects.toThrow(/motivo/i)

    await EnvioNotificacion.deleteMany({})
    await marcarEstadoBodega(req._id, { estado: 'no_aprobada', observacion: 'No hay stock disponible' }, actorBodega)

    const avisosSolicitante = await esperarNotificaciones({ usuario: solicitante._id })
    expect(avisosSolicitante.some((e) => e.cuerpo === 'No hay stock disponible')).toBe(true)

    const avisosFinanciero = await esperarNotificaciones({ usuario: financiero._id })
    expect(avisosFinanciero.length).toBeGreaterThan(0)

    const avisosAdmin = await esperarNotificaciones({ usuario: admin._id })
    expect(avisosAdmin.length).toBeGreaterThan(0)
  })

  it('el rechazo de Financiero notifica al solicitante con el motivo', async () => {
    const { actor: actorSolicitante, usuario: solicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorFinanciero } = await crearUsuarioConPermiso('requerimientos:aprobar_financiero')

    const req = await crearRequerimiento(
      { tipo: 'servicio', detalleServicio: { descripcionTipoServicio: 'Mantenimiento aire acondicionado' } },
      actorSolicitante
    )

    await rechazarComoFinanciero(req._id, { motivoRechazo: 'Presupuesto no disponible' }, actorFinanciero)

    const avisos = await esperarNotificaciones({ usuario: solicitante._id })
    expect(avisos.some((e) => e.cuerpo === 'Presupuesto no disponible')).toBe(true)
  })
})

describe('firma digital en la aprobación de Financiero', () => {
  it('rechaza la aprobación si el Financiero no tiene firma registrada', async () => {
    const { actor: actorSolicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorFinanciero, passwordPlano } =
      await crearUsuarioConPermiso('requerimientos:aprobar_financiero', { conFirma: false })

    const req = await crearRequerimiento(
      { tipo: 'servicio', detalleServicio: { descripcionTipoServicio: 'Fumigación' } },
      actorSolicitante
    )

    await expect(
      aprobarComoFinanciero(req._id, { password: passwordPlano }, actorFinanciero)
    ).rejects.toThrow(/firma/i)
  })

  it('al aprobar, el requerimiento queda firmado con un snapshot de la firma del aprobador', async () => {
    const { actor: actorSolicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorFinanciero, usuario: financiero, passwordPlano } = await crearUsuarioConPermiso(
      'requerimientos:aprobar_financiero',
      { conFirma: true }
    )

    const req = await crearRequerimiento(
      { tipo: 'servicio', detalleServicio: { descripcionTipoServicio: 'Fumigación' } },
      actorSolicitante
    )

    const aprobado = await aprobarComoFinanciero(req._id, { password: passwordPlano }, actorFinanciero)

    expect(aprobado.estado).toBe('pendiente_bodega')
    expect(aprobado.financiero.firma.url).toBe(financiero.firma.url)
    expect(aprobado.financiero.firma.publicId).toBe(financiero.firma.publicId)

    // Snapshot, no referencia: si el usuario cambia su firma después, el
    // documento ya aprobado debe conservar la rúbrica original.
    financiero.firma = { url: 'https://res.cloudinary.com/test/firma-nueva.png', publicId: 'test/firma-nueva' }
    await financiero.save()

    const releido = await Requerimiento.findById(req._id)
    expect(releido.financiero.firma.url).not.toBe(financiero.firma.url)
    expect(releido.financiero.firma.publicId).toMatch(/^test\/firma-/)
  })
})

describe('exportar y eliminar requerimientos por rango de fechas', () => {
  // fechaSolicitud se fija a mano tras crear (crearRequerimiento siempre usa
  // Date.now()) para poder ejercitar el filtro de rango de forma determinista.
  async function crearConFecha(actorSolicitante, fechaISO, extra = {}) {
    const req = await crearRequerimiento(
      { tipo: 'servicio', detalleServicio: { descripcionTipoServicio: `Servicio ${fechaISO}` }, ...extra },
      actorSolicitante
    )
    await Requerimiento.updateOne({ _id: req._id }, { $set: { fechaSolicitud: new Date(`${fechaISO}T10:00:00.000Z`) } })
    return req._id
  }

  async function crearActorSuperAdmin() {
    const rolSuperAdmin = await Rol.create({ nombre: 'Super Admin test', slug: `superadmin-${Math.random().toString(36).slice(2)}`, esSuperAdmin: true, permisos: [] })
    const password = 'clave-super-999'
    const superAdmin = await Usuario.create({
      nombre_usuario: `super-${Math.random().toString(36).slice(2)}`,
      nombre: 'Super Admin Prueba',
      password: await bcrypt.hash(password, 4),
      email: `super-${Math.random().toString(36).slice(2)}@example.com`,
      rol: rolSuperAdmin._id,
      cargo: 'Super Admin',
    })
    return { actor: { id_usuario: superAdmin._id, nombre_usuario: superAdmin.nombre_usuario, esSuperAdmin: true, permisos: new Set() }, password }
  }

  it('exportarCsv incluye ambos extremos del rango y excluye lo que queda afuera', async () => {
    const { actor: actorSolicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorSuperAdmin } = await crearActorSuperAdmin()
    await crearConFecha(actorSolicitante, '2026-02-04')
    await crearConFecha(actorSolicitante, '2026-02-05')
    await crearConFecha(actorSolicitante, '2026-02-10')
    await crearConFecha(actorSolicitante, '2026-02-11')

    // Regresión: el límite "hasta" se calculaba con Date#setHours (zona
    // horaria LOCAL del proceso) sobre un Date parseado como UTC — en un
    // servidor con TZ distinta de UTC, el día 10 (el extremo "hasta")
    // quedaba fuera. El fix usa aritmética en UTC explícita.
    const { total } = await exportarCsv({ desde: '2026-02-05', hasta: '2026-02-10' }, actorSuperAdmin)
    expect(total).toBe(2)
  })

  it('exportarCsv recorta el resultado al alcance del rol: Financiero solo ve pendiente_financiero, Bodega solo pendiente_bodega', async () => {
    const { actor: actorSolicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorFinanciero, passwordPlano } = await crearUsuarioConPermiso('requerimientos:aprobar_financiero', { conFirma: true })
    const { actor: actorBodega } = await crearUsuarioConPermiso('requerimientos:gestionar_bodega')

    // Uno se queda pendiente_financiero, el otro se aprueba y pasa a
    // pendiente_bodega — mismo rango de fecha para los dos.
    await crearConFecha(actorSolicitante, '2026-04-10')
    const idAprobado = await crearConFecha(actorSolicitante, '2026-04-11')
    await aprobarComoFinanciero(idAprobado, { password: passwordPlano }, actorFinanciero)
    await Requerimiento.updateOne({ _id: idAprobado }, { $set: { fechaSolicitud: new Date('2026-04-11T10:00:00.000Z') } })

    const rango = { desde: '2026-04-10', hasta: '2026-04-11' }

    // Regresión: antes exportarCsv no filtraba por alcance en absoluto —
    // Financiero/Bodega podían exportar TODO el rango, incluyendo lo que su
    // propia bandeja nunca les muestra (ver requerimientos.routes.js: los
    // 3 permisos comparten el mismo endpoint /exportar).
    const comoFinanciero = await exportarCsv(rango, actorFinanciero)
    expect(comoFinanciero.total).toBe(1)
    expect(comoFinanciero.csv).toContain('pendiente_financiero')
    expect(comoFinanciero.csv).not.toContain('pendiente_bodega')

    const comoBodega = await exportarCsv(rango, actorBodega)
    expect(comoBodega.total).toBe(1)
    expect(comoBodega.csv).toContain('pendiente_bodega')
    expect(comoBodega.csv).not.toContain(',pendiente_financiero,')
  })

  it('exportarCsv neutraliza celdas que empiezan como fórmula (CSV formula injection)', async () => {
    const { actor: actorSolicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorSuperAdmin } = await crearActorSuperAdmin()

    await crearConFecha(actorSolicitante, '2026-05-01', {
      areaOProceso: '=cmd|\' /C calc\'!A1',
    })

    const { csv } = await exportarCsv({ desde: '2026-05-01', hasta: '2026-05-01' }, actorSuperAdmin)
    // La celda debe quedar prefijada con comilla simple, nunca con "=" como
    // primer carácter real — si un programa como Excel/Sheets la
    // interpretara como fórmula, ejecutaría el comando.
    expect(csv).toContain("'=cmd")
    expect(csv).not.toMatch(/,=cmd/)
  })

  it('eliminarPorRangoFecha exige contraseña de Super Admin y borra solo lo que cae en el rango', async () => {
    const { actor: actorSolicitante } = await crearUsuarioConPermiso(null)
    const { actor: actorSuperAdmin, password: passwordSuper } = await crearActorSuperAdmin()

    const idFuera = await crearConFecha(actorSolicitante, '2026-03-01')
    const idDentro = await crearConFecha(actorSolicitante, '2026-03-15')

    await expect(
      eliminarPorRangoFecha({ desde: '2026-03-10', hasta: '2026-03-20', password: 'clave-incorrecta' }, actorSuperAdmin)
    ).rejects.toThrow(/contraseña/i)
    expect(await Requerimiento.findById(idDentro)).not.toBeNull()

    const { eliminados } = await eliminarPorRangoFecha(
      { desde: '2026-03-10', hasta: '2026-03-20', password: passwordSuper },
      actorSuperAdmin
    )
    expect(eliminados).toBe(1)
    expect(await Requerimiento.findById(idDentro)).toBeNull()
    expect(await Requerimiento.findById(idFuera)).not.toBeNull()
  })
})
