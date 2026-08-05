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
import { cambiarEstadoReporte, redistribuirPendientes, MAX_ACTIVAS_TECNICO } from '../src/modules/danos/danos.service.js'

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

describe('reparto automático de daños — redistribución al liberar cupo', () => {
  it('un reporte pendiente por falta de cupo se asigna solo cuando el técnico resuelve una tarea y libera espacio', async () => {
    const { actor: actorTecnico, usuario: tecnico } = await crearUsuarioConPermiso('mantenimiento:ejecutar')
    const { usuario: reportante } = await crearUsuarioConPermiso(null)

    // Satura al único técnico exactamente al tope (MAX_ACTIVAS_TECNICO).
    const activos = []
    for (let i = 0; i < MAX_ACTIVAS_TECNICO; i += 1) {
      activos.push(await crearReporteActivo({ asignadoA: tecnico._id, reportadoPor: reportante._id }))
    }

    // Un daño nuevo queda pendiente: nadie tiene cupo (simula lo que ya hace
    // asignarAutomaticamente al crear, pero se prueba redistribuirPendientes
    // directamente para no depender de Cloudinary en este test).
    const pendiente = await ReporteDano.create({
      tipo: 'dano',
      fecha: new Date(),
      descripcion: 'Fuga de agua en el módulo mixto',
      reportadoPor: reportante._id,
      estado: 'pendiente',
    })

    await redistribuirPendientes()
    expect((await ReporteDano.findById(pendiente._id)).estado).toBe('pendiente')

    // El técnico resuelve una de sus tareas activas: libera un cupo. Esto
    // debe disparar la redistribución automáticamente (no hace falta llamar
    // redistribuirPendientes a mano) y el pendiente debe encontrar hogar.
    await cambiarEstadoReporte(
      activos[0]._id,
      {
        estado: 'resuelto',
        nota: 'Reparado el bache',
        reparacion: {
          fecha: new Date().toISOString(),
          modulo: 'regional',
          evidenciasNuevas: [{ url: 'https://res.cloudinary.com/demo/image/upload/v1/skynet/danos_reparacion/foto.jpg' }],
        },
      },
      actorTecnico
    )

    const pendienteActualizado = await ReporteDano.findById(pendiente._id)
    expect(pendienteActualizado.estado).toBe('asignado')
    expect(String(pendienteActualizado.asignadoA)).toBe(String(tecnico._id))
    expect(pendienteActualizado.asignacionAutomatica).toBe(true)
  })

  it('si nadie tiene cupo libre, el pendiente se queda pendiente (no se fuerza a nadie por encima del tope)', async () => {
    const { usuario: tecnico } = await crearUsuarioConPermiso('mantenimiento:ejecutar')
    const { usuario: reportante } = await crearUsuarioConPermiso(null)

    for (let i = 0; i < MAX_ACTIVAS_TECNICO; i += 1) {
      await crearReporteActivo({ asignadoA: tecnico._id, reportadoPor: reportante._id })
    }
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
