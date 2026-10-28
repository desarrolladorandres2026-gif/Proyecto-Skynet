import { describe, it, expect, vi } from 'vitest'
import bcrypt from 'bcryptjs'

// Mismo mock que requerimientos.flujo.test.js/ausencias.flujo.test.js: la
// redistribución automática notifica al técnico elegido, y sin esto el test
// intentaría mandar push/email reales.
vi.mock('../src/utils/webpush.js', () => ({ default: { sendNotification: vi.fn() } }))
vi.mock('../src/utils/email.js', () => ({ enviarEmailGenerico: vi.fn() }))

import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import ReporteDano from '../src/models/ReporteDano.js'
// obtenerReporte() popula 'requerimientos' (ref: 'Requerimiento'): sin
// importar el modelo aquí, mongoose no tiene el schema registrado en este
// archivo de test aislado.
import '../src/models/Requerimiento.js'
import Notificacion from '../src/models/Notificacion.js'
import { redistribuirPendientes, avisarReporteNuevo, MAX_ACTIVAS_TECNICO } from '../src/modules/danos/danos.service.js'

async function crearPermiso(codigo) {
  const [modulo, accion] = codigo.split(':')
  return Permiso.findOneAndUpdate({ codigo }, { codigo, modulo, accion, nombre: codigo }, { upsert: true, new: true })
}

async function crearUsuarioConPermiso(codigo) {
  const permiso = codigo ? await crearPermiso(codigo) : null
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({
    nombre: `Rol-${sufijo}`,
    slug: `rol-${sufijo}`,
    permisos: permiso ? [permiso._id] : [],
  })
  const usuario = await Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Prueba',
    password: await bcrypt.hash('clave-segura-123', 4),
    email: `${sufijo}@example.com`,
    rol: rol._id,
    cargo: 'Tester',
    estado: 'activo',
  })
  const actor = {
    id_usuario: usuario._id,
    nombre_usuario: usuario.nombre_usuario,
    rol: { id: rol._id, nombre: rol.nombre, slug: rol.slug },
    esSuperAdmin: false,
    permisos: new Set(codigo ? [codigo] : []),
  }
  return { usuario, actor }
}

async function crearReporteActivo({ asignadoA, reportadoPor }) {
  // 'en_proceso' (no 'asignado'): la máquina de estados exige pasar por ahí
  // antes de poder llegar a 'resuelto' (ver TRANSICIONES en danos.service.js).
  return ReporteDano.create({
    tipo: 'dano',
    fecha: new Date(),
    descripcion: 'Bache en el andén',
    reportadoPor,
    estado: 'en_proceso',
    asignadoA,
    asignadoEn: new Date(),
    asignacionAutomatica: true,
  })
}

describe('reparto automático de daños — encargado único', () => {
  it('un reporte pendiente se asigna a DIEGO ARMANDO OSSA ANAYA aunque tenga el tope de tareas activas', async () => {
    const { usuario: diego } = await crearUsuarioConPermiso('mantenimiento:ejecutar')
    await Usuario.updateOne({ _id: diego._id }, { nombre: 'DIEGO ARMANDO OSSA ANAYA' })
    const { usuario: reportante } = await crearUsuarioConPermiso(null)

    for (let i = 0; i < MAX_ACTIVAS_TECNICO; i += 1) {
      await crearReporteActivo({ asignadoA: diego._id, reportadoPor: reportante._id })
    }
    const pendiente = await ReporteDano.create({
      tipo: 'dano',
      fecha: new Date(),
      descripcion: 'Fuga de agua en el módulo mixto',
      reportadoPor: reportante._id,
      estado: 'pendiente',
    })

    await redistribuirPendientes()

    const actualizado = await ReporteDano.findById(pendiente._id)
    expect(actualizado.estado).toBe('asignado')
    expect(String(actualizado.asignadoA)).toBe(String(diego._id))
    expect(actualizado.asignacionAutomatica).toBe(true)
  })

  it('si el encargado no existe, el pendiente se queda pendiente', async () => {
    await Usuario.updateMany({ nombre: 'DIEGO ARMANDO OSSA ANAYA' }, { estado: 'inactivo' })
    const { usuario: reportante } = await crearUsuarioConPermiso(null)
    const pendiente = await ReporteDano.create({
      tipo: 'dano',
      fecha: new Date(),
      descripcion: 'Puerta trabada',
      reportadoPor: reportante._id,
      estado: 'pendiente',
    })

    await redistribuirPendientes()

    expect((await ReporteDano.findById(pendiente._id)).estado).toBe('pendiente')
  })
})

describe('aviso de reporte nuevo a los gestores', () => {
  it('avisa a quien tiene danos:gestionar de cualquier tipo de reporte, sin avisar al que reporta ni al técnico asignado', async () => {
    const { usuario: gestor } = await crearUsuarioConPermiso('danos:gestionar')
    const { usuario: tecnicoGestor, actor: _a } = await crearUsuarioConPermiso('danos:gestionar')
    const { usuario: reportante, actor } = await crearUsuarioConPermiso('danos:gestionar')
    const reporte = await ReporteDano.create({
      tipo: 'sugerencia',
      fecha: new Date(),
      descripcion: 'Poner más bancas en la sala de espera',
      reportadoPor: reportante._id,
      estado: 'asignado',
      asignadoA: tecnicoGestor._id,
    })

    await avisarReporteNuevo(reporte, actor)

    const avisados = (await Notificacion.find({ categoria: 'danos' }).lean()).map((e) => String(e.usuario))
    expect(avisados).toContain(String(gestor._id))
    expect(avisados).not.toContain(String(reportante._id))
    expect(avisados).not.toContain(String(tecnicoGestor._id))
    const envio = await Notificacion.findOne({ usuario: gestor._id, categoria: 'danos' }).lean()
    expect(envio.titulo).toBe('Nuevo reporte: sugerencia')
  })
})
