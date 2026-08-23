import { describe, it, expect } from 'vitest'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import ProgramacionSig from '../src/models/ProgramacionSig.js'
import PreguntaSig from '../src/models/PreguntaSig.js'
import RespuestaSig from '../src/models/RespuestaSig.js'
import { hashPassword } from '../src/utils/password.js'
import { responder } from '../src/modules/sig_pregunta_dia/sig-respuestas.service.js'

// Auditoría de producción 2026-08-22 (segunda ronda): responder() persistía
// una respuesta sin volver a comprobar que la programación estuviera
// dirigida a la audiencia del usuario (GET /pregunta-del-dia sí lo hacía,
// pero POST /responder no) — cualquier autenticado que adivinara un
// programacionId publicado podía "completar" cuestionarios de otra
// dependencia/cargo, contaminando las estadísticas de cumplimiento SIG/HSEQ.

async function crearUsuario({ dependencia, cargo } = {}) {
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol_${sufijo}`, esSuperAdmin: false, ambito: 'global', permisos: [] })
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Prueba',
    email: `${sufijo}@example.com`,
    password: await hashPassword('Clave.Segura.2026'),
    rol: rol._id,
    dependencia,
    cargo,
  })
}

async function crearProgramacionPublicada({ audiencia, creador }) {
  const pregunta = await PreguntaSig.create({
    enunciado: '¿Pregunta de prueba?',
    opciones: [
      { texto: 'A', esCorrecta: true },
      { texto: 'B', esCorrecta: false },
      { texto: 'C', esCorrecta: false },
      { texto: 'D', esCorrecta: false },
    ],
    componenteSig: 'Calidad',
    tema: 'Tema de prueba',
    creadoPor: creador._id,
  })
  return ProgramacionSig.create({
    pregunta: pregunta._id,
    fechaProgramada: new Date(),
    fechaHoraPublicacion: new Date(),
    audiencia,
    estado: 'publicada',
    publicadaEn: new Date(),
    snapshotPregunta: {
      enunciado: pregunta.enunciado,
      opciones: pregunta.opciones,
      componenteSig: pregunta.componenteSig,
      tema: pregunta.tema,
    },
    creadoPor: creador._id,
  })
}

describe('SIG — responder() respeta la audiencia de la programación', () => {
  it('rechaza responder una programación dirigida a OTRA dependencia', async () => {
    const admin = await crearUsuario({ dependencia: 'Sistemas' })
    const trabajador = await crearUsuario({ dependencia: 'Operaciones', cargo: 'Operador' })
    const programacion = await crearProgramacionPublicada({
      audiencia: { todos: false, dependencias: ['Mantenimiento'], cargos: [] },
      creador: admin,
    })

    await expect(
      responder(programacion._id.toString(), 0, { id_usuario: trabajador._id.toString() })
    ).rejects.toThrow('no está dirigida a ti')

    expect(await RespuestaSig.countDocuments({ programacion: programacion._id })).toBe(0)
  })

  it('rechaza responder una programación dirigida a OTRO cargo', async () => {
    const admin = await crearUsuario({ dependencia: 'Sistemas' })
    const trabajador = await crearUsuario({ dependencia: 'Mantenimiento', cargo: 'Auxiliar' })
    const programacion = await crearProgramacionPublicada({
      audiencia: { todos: false, dependencias: [], cargos: ['Supervisor'] },
      creador: admin,
    })

    await expect(
      responder(programacion._id.toString(), 0, { id_usuario: trabajador._id.toString() })
    ).rejects.toThrow('no está dirigida a ti')
  })

  it('permite responder cuando la audiencia es "todos"', async () => {
    const admin = await crearUsuario({ dependencia: 'Sistemas' })
    const trabajador = await crearUsuario({ dependencia: 'Operaciones', cargo: 'Operador' })
    const programacion = await crearProgramacionPublicada({
      audiencia: { todos: true, dependencias: [], cargos: [] },
      creador: admin,
    })

    const resultado = await responder(programacion._id.toString(), 0, { id_usuario: trabajador._id.toString() })
    expect(resultado.esCorrecta).toBe(true)
    expect(await RespuestaSig.countDocuments({ programacion: programacion._id })).toBe(1)
  })

  it('permite responder cuando SÍ coincide la dependencia', async () => {
    const admin = await crearUsuario({ dependencia: 'Sistemas' })
    const trabajador = await crearUsuario({ dependencia: 'Mantenimiento', cargo: 'Auxiliar' })
    const programacion = await crearProgramacionPublicada({
      audiencia: { todos: false, dependencias: ['Mantenimiento'], cargos: [] },
      creador: admin,
    })

    const resultado = await responder(programacion._id.toString(), 0, { id_usuario: trabajador._id.toString() })
    expect(resultado).toHaveProperty('esCorrecta')
    expect(await RespuestaSig.countDocuments({ programacion: programacion._id })).toBe(1)
  })
})
