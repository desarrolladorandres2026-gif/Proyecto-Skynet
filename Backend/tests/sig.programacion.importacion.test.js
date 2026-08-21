import { describe, it, expect, vi, beforeEach } from 'vitest'
import ExcelJS from 'exceljs'
import mongoose from 'mongoose'

// El motor de publicación notifica a la audiencia; sin este mock el test
// intentaría mandar push reales (mismo criterio que danos.reparto.test.js).
vi.mock('../src/utils/sendPush.js', () => ({ notificarUsuarios: vi.fn() }))

import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import PreguntaSig from '../src/models/PreguntaSig.js'
import ProgramacionSig from '../src/models/ProgramacionSig.js'
import ConfiguracionSig from '../src/models/ConfiguracionSig.js'
import { crearProgramacionIndividual, publicarPendientes } from '../src/modules/sig_pregunta_dia/sig-programaciones.service.js'
import { obtenerPreguntaDelDia, responder } from '../src/modules/sig_pregunta_dia/sig-respuestas.service.js'
import { importarPreguntasDesdeExcel, generarPlantillaExcel } from '../src/modules/sig_pregunta_dia/sig-importacion.service.js'
import { listarTrabajadoresParticipantes } from '../src/modules/sig_pregunta_dia/sig-dashboard.service.js'

let actor

async function crearUsuario(extra = {}) {
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol-${sufijo}`, permisos: [] })
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: extra.nombre || 'Usuario Prueba',
    password: 'hash-irrelevante-para-este-test',
    email: `${sufijo}@example.com`,
    rol: rol._id,
    cargo: 'Operario',
    dependencia: 'Operaciones',
    estado: 'activo',
    ...extra,
  })
}

async function crearPregunta(enunciado, componenteSig = 'SST') {
  return PreguntaSig.create({
    enunciado,
    opciones: [
      { texto: 'A', esCorrecta: true },
      { texto: 'B', esCorrecta: false },
      { texto: 'C', esCorrecta: false },
      { texto: 'D', esCorrecta: false },
    ],
    componenteSig,
    tema: 'Tema de prueba',
    creadoPor: actor.id_usuario,
  })
}

// Un día futuro seguro: la validación exige que la publicación sea futura.
function fechaFutura(diasAdelante = 1) {
  const fecha = new Date(Date.now() + diasAdelante * 24 * 60 * 60 * 1000)
  return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

beforeEach(async () => {
  const usuario = await crearUsuario()
  actor = { id_usuario: usuario._id, nombre_usuario: usuario.nombre_usuario, rol: { slug: 'tester' } }
})

describe('programar varias preguntas para el mismo día', () => {
  it('crea una programación por pregunta, todas en la misma fecha', async () => {
    const a = await crearPregunta('Pregunta uno')
    const b = await crearPregunta('Pregunta dos')
    const c = await crearPregunta('Pregunta tres')
    const fecha = fechaFutura()

    const creadas = await crearProgramacionIndividual(
      { preguntaIds: [a._id, b._id, c._id], fecha, hora: '09:00' },
      actor
    )

    expect(creadas).toHaveLength(3)
    expect(await ProgramacionSig.countDocuments({})).toBe(3)
    const dias = new Set(creadas.map((p) => p.fechaProgramada.toISOString()))
    expect(dias.size).toBe(1)
  })

  it('acepta una hora distinta por pregunta', async () => {
    const a = await crearPregunta('Mañana')
    const b = await crearPregunta('Tarde')
    const fecha = fechaFutura()

    const creadas = await crearProgramacionIndividual(
      {
        preguntas: [
          { preguntaId: a._id, hora: '07:00' },
          { preguntaId: b._id, hora: '15:30' },
        ],
        fecha,
      },
      actor
    )

    const horas = creadas.map((p) =>
      p.fechaHoraPublicacion.toLocaleTimeString('en-GB', { timeZone: 'America/Bogota', hour12: false })
    )
    expect(horas).toEqual(['07:00:00', '15:30:00'])
  })

  it('sigue aceptando la forma antigua de una sola pregunta', async () => {
    const a = await crearPregunta('Sola')
    const creadas = await crearProgramacionIndividual({ preguntaId: a._id, fecha: fechaFutura() }, actor)
    expect(creadas).toHaveLength(1)
  })

  it('rechaza la misma pregunta repetida en el mismo envío', async () => {
    const a = await crearPregunta('Repetida')
    await expect(
      crearProgramacionIndividual({ preguntaIds: [a._id, a._id], fecha: fechaFutura() }, actor)
    ).rejects.toThrow(/Repetiste/)
  })

  it('rechaza una pregunta que ya está programada para ese día y no crea nada del lote', async () => {
    const a = await crearPregunta('Ya programada')
    const b = await crearPregunta('Nueva')
    const fecha = fechaFutura()

    await crearProgramacionIndividual({ preguntaId: a._id, fecha }, actor)
    await expect(
      crearProgramacionIndividual({ preguntaIds: [b._id, a._id], fecha }, actor)
    ).rejects.toThrow(/ya está programada/)

    // El lote entero se descarta: 'Nueva' no debe haber entrado.
    expect(await ProgramacionSig.countDocuments({})).toBe(1)
  })
})

describe('el trabajador recibe todas las preguntas publicadas del día', () => {
  it('devuelve la lista completa y marca cuáles faltan por responder', async () => {
    const trabajador = await crearUsuario({ nombre: 'Trabajador Uno' })
    const a = await crearPregunta('Primera del día')
    const b = await crearPregunta('Segunda del día')
    const c = await crearPregunta('Tercera del día')

    // Publicación inmediata: se programa a futuro (lo exige la validación) y
    // luego se adelanta la hora para que el worker la considere vencida.
    const creadas = await crearProgramacionIndividual(
      { preguntaIds: [a._id, b._id, c._id], fecha: fechaFutura() },
      actor
    )
    await ProgramacionSig.updateMany(
      { _id: { $in: creadas.map((p) => p._id) } },
      { $set: { fechaProgramada: new Date(), fechaHoraPublicacion: new Date(Date.now() - 60_000) } }
    )

    const publicadas = await publicarPendientes()
    expect(publicadas).toBe(3)

    const actorTrabajador = { id_usuario: trabajador._id, nombre_usuario: trabajador.nombre_usuario, rol: {} }
    let dia = await obtenerPreguntaDelDia(actorTrabajador)

    expect(dia.disponible).toBe(true)
    expect(dia.preguntas).toHaveLength(3)
    expect(dia.totalPendientes).toBe(3)
    expect(dia.preguntas.map((p) => p.enunciado)).toContain('Segunda del día')
    // La respuesta correcta no viaja antes de responder.
    expect(dia.preguntas[0].opciones.every((o) => o.esCorrecta === undefined)).toBe(true)

    await responder(dia.preguntas[0]._id, 0, actorTrabajador)

    dia = await obtenerPreguntaDelDia(actorTrabajador)
    expect(dia.totalPendientes).toBe(2)
    expect(dia.totalRespondidas).toBe(1)
    // La forma singular heredada apunta a la primera pendiente.
    expect(dia.programacion.yaRespondida).toBe(false)
  })

  it('manda un solo aviso aunque se publiquen varias preguntas a la vez', async () => {
    const { notificarUsuarios } = await import('../src/utils/sendPush.js')
    notificarUsuarios.mockClear()

    await crearUsuario({ nombre: 'Destinatario' })
    const a = await crearPregunta('Una')
    const b = await crearPregunta('Dos')

    const creadas = await crearProgramacionIndividual({ preguntaIds: [a._id, b._id], fecha: fechaFutura() }, actor)
    await ProgramacionSig.updateMany(
      { _id: { $in: creadas.map((p) => p._id) } },
      { $set: { fechaProgramada: new Date(), fechaHoraPublicacion: new Date(Date.now() - 60_000) } }
    )

    await publicarPendientes()

    expect(notificarUsuarios).toHaveBeenCalledTimes(1)
    expect(notificarUsuarios.mock.calls[0][1].body).toMatch(/2 preguntas/)
  })
})

// ── Importación desde Excel ────────────────────────────────────────────────

async function libroDePrueba(filas, encabezados) {
  const workbook = new ExcelJS.Workbook()
  const hoja = workbook.addWorksheet('Preguntas')
  hoja.addRow(encabezados)
  filas.forEach((f) => hoja.addRow(f))
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

// Encabezados escritos "a la mala" a propósito: sin tildes, en mayúsculas y
// con guiones bajos. El importador debe reconocerlos igual.
const ENCABEZADOS_DESPROLIJOS = [
  'ENUNCIADO',
  'Componente',
  'TEMA',
  'Opcion_A',
  'OPCION B',
  'opción c',
  'Respuesta D',
  'CLAVE',
  'Retroalimentacion correcta',
  'Retroalimentacion incorrecta',
  'Tags',
]

describe('importación de preguntas desde Excel', () => {
  it('importa las filas válidas reconociendo encabezados con variaciones', async () => {
    const buffer = await libroDePrueba(
      [
        ['¿Qué es un EPP?', 'SST', 'Elementos de protección', 'Un elemento de protección', 'Una máquina', 'Un permiso', 'Un turno', 'A', 'Bien', 'Repasa', 'epp, sst'],
        ['¿Cada cuánto se audita?', 'Calidad', 'Auditorías', 'Nunca', 'Cada año', 'Cada década', 'Cada hora', 'B', '', '', ''],
      ],
      ENCABEZADOS_DESPROLIJOS
    )

    const resultado = await importarPreguntasDesdeExcel(buffer, actor)

    expect(resultado.importadas).toBe(2)
    expect(resultado.errores).toHaveLength(0)
    expect(await PreguntaSig.countDocuments({})).toBe(2)

    const auditoria = await PreguntaSig.findOne({ enunciado: '¿Cada cuánto se audita?' })
    expect(auditoria.componenteSig).toBe('Calidad')
    expect(auditoria.opciones[1].esCorrecta).toBe(true)
    expect(auditoria.opciones.filter((o) => o.esCorrecta)).toHaveLength(1)
    expect(auditoria.estado).toBe('activa')

    const epp = await PreguntaSig.findOne({ enunciado: '¿Qué es un EPP?' })
    expect(epp.etiquetas).toEqual(['epp', 'sst'])
    expect(epp.retroalimentacion.correcta).toBe('Bien')
  })

  it('acepta el número de la opción y el texto completo como respuesta correcta', async () => {
    const buffer = await libroDePrueba(
      [
        ['Por número', 'SST', 'T', 'uno', 'dos', 'tres', 'cuatro', '3', '', '', ''],
        ['Por texto', 'SST', 'T', 'uno', 'dos', 'tres', 'cuatro', 'cuatro', '', '', ''],
      ],
      ENCABEZADOS_DESPROLIJOS
    )

    await importarPreguntasDesdeExcel(buffer, actor)

    expect((await PreguntaSig.findOne({ enunciado: 'Por número' })).opciones[2].esCorrecta).toBe(true)
    expect((await PreguntaSig.findOne({ enunciado: 'Por texto' })).opciones[3].esCorrecta).toBe(true)
  })

  it('importa lo bueno y reporta fila por fila lo que falló, sin abortar el archivo', async () => {
    const buffer = await libroDePrueba(
      [
        ['Buena', 'SST', 'T', 'a', 'b', 'c', 'd', 'A', '', '', ''],
        ['Componente inventado', 'Marketing', 'T', 'a', 'b', 'c', 'd', 'A', '', '', ''],
        ['Sin opción C', 'SST', 'T', 'a', 'b', '', 'd', 'A', '', '', ''],
        ['Clave ilegible', 'SST', 'T', 'a', 'b', 'c', 'd', 'la primera', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', ''],
        ['Otra buena', 'Calidad', 'T', 'a', 'b', 'c', 'd', 'D', '', '', ''],
      ],
      ENCABEZADOS_DESPROLIJOS
    )

    const resultado = await importarPreguntasDesdeExcel(buffer, actor)

    expect(resultado.importadas).toBe(2)
    expect(resultado.errores).toHaveLength(3)
    expect(resultado.errores.map((e) => e.fila)).toEqual([3, 4, 5])
    expect(resultado.errores[0].mensaje).toMatch(/no está configurado/)
    expect(resultado.errores[1].mensaje).toMatch(/opción C está vacía/)
    expect(resultado.errores[2].mensaje).toMatch(/respuesta correcta/)
  })

  it('omite duplicados contra el banco y dentro del mismo archivo', async () => {
    await crearPregunta('Ya existo en el banco')

    const buffer = await libroDePrueba(
      [
        ['ya existo en el banco', 'SST', 'T', 'a', 'b', 'c', 'd', 'A', '', '', ''],
        ['Nueva de verdad', 'SST', 'T', 'a', 'b', 'c', 'd', 'A', '', '', ''],
        ['Nueva de verdad', 'SST', 'T', 'a', 'b', 'c', 'd', 'B', '', '', ''],
      ],
      ENCABEZADOS_DESPROLIJOS
    )

    const resultado = await importarPreguntasDesdeExcel(buffer, actor)

    expect(resultado.importadas).toBe(1)
    expect(resultado.duplicadas).toHaveLength(2)
    expect(await PreguntaSig.countDocuments({})).toBe(2)
  })

  it('rechaza el archivo entero si le faltan columnas obligatorias', async () => {
    const buffer = await libroDePrueba([['Solo enunciado']], ['Enunciado'])
    await expect(importarPreguntasDesdeExcel(buffer, actor)).rejects.toThrow(/columnas obligatorias/)
  })

  it('la plantilla generada se importa sin errores', async () => {
    // El contrato que más importa: lo que el sistema entrega como plantilla
    // tiene que ser algo que el propio sistema sepa leer.
    await ConfiguracionSig.create({})
    const plantilla = Buffer.from(await generarPlantillaExcel())

    const resultado = await importarPreguntasDesdeExcel(plantilla, actor)

    expect(resultado.errores).toHaveLength(0)
    expect(resultado.importadas).toBe(1)
  })
})

describe('listado de trabajadores que han respondido', () => {
  it('resume el desempeño de cada uno en una sola llamada', async () => {
    const ana = await crearUsuario({ nombre: 'Ana Torres' })
    const beto = await crearUsuario({ nombre: 'Beto Ruiz' })

    const a = await crearPregunta('P1')
    const b = await crearPregunta('P2')
    const creadas = await crearProgramacionIndividual({ preguntaIds: [a._id, b._id], fecha: fechaFutura() }, actor)
    await ProgramacionSig.updateMany(
      { _id: { $in: creadas.map((p) => p._id) } },
      { $set: { fechaProgramada: new Date(), fechaHoraPublicacion: new Date(Date.now() - 60_000) } }
    )
    await publicarPendientes()

    const dia = await obtenerPreguntaDelDia({ id_usuario: ana._id, rol: {} })
    await responder(dia.preguntas[0]._id, 0, { id_usuario: ana._id, nombre_usuario: ana.nombre_usuario, rol: {} }) // correcta
    await responder(dia.preguntas[1]._id, 1, { id_usuario: ana._id, nombre_usuario: ana.nombre_usuario, rol: {} }) // incorrecta
    await responder(dia.preguntas[0]._id, 1, { id_usuario: beto._id, nombre_usuario: beto.nombre_usuario, rol: {} }) // incorrecta

    const lista = await listarTrabajadoresParticipantes()

    expect(lista).toHaveLength(2)
    expect(lista[0].nombre).toBe('Ana Torres') // orden alfabético
    expect(lista[0].total).toBe(2)
    expect(lista[0].correctas).toBe(1)
    expect(lista[0].porcentaje).toBe(50)
    expect(lista[0].nivel).toBeTruthy()
    expect(lista[0].dependencia).toBe('Operaciones')
    expect(lista[1].nombre).toBe('Beto Ruiz')
    expect(lista[1].total).toBe(1)
    expect(lista[1].porcentaje).toBe(0)
    // Quien nunca respondió no aparece.
    expect(lista.some((t) => String(t._id) === String(actor.id_usuario))).toBe(false)
  })
})

describe('sanidad de los ObjectId de prueba', () => {
  it('usa ids reales de mongoose', () => {
    expect(mongoose.isValidObjectId(actor.id_usuario)).toBe(true)
  })
})
