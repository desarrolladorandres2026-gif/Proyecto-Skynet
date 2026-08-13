import { describe, it, expect } from 'vitest'
import Ausencia from '../src/models/Ausencia.js'
import { OFFSET_TERMINAL } from '../src/utils/fechas.js'

// La lógica de scripts/migrar-fechas-ausencias.js, probada contra Mongo real.
// El script en sí abre su propia conexión y lee argv, así que se replica aquí
// la única parte con riesgo —decidir qué documento tocar y a qué valor— para
// no ejecutar un script de migración contra la base de pruebas.

const MS_HORA = 60 * 60 * 1000

function msDelDia(fecha) {
  return (
    fecha.getUTCHours() * MS_HORA +
    fecha.getUTCMinutes() * 60000 +
    fecha.getUTCSeconds() * 1000 +
    fecha.getUTCMilliseconds()
  )
}

function reanclar(fecha) {
  return new Date(`${fecha.toISOString().slice(0, 10)}T00:00:00.000${OFFSET_TERMINAL}`)
}

function clasificar(doc) {
  const ms = [doc.fechaInicio, doc.fechaFin].filter(Boolean).map(msDelDia)
  if (ms.every((m) => m === 5 * MS_HORA)) return 'ya-correcta'
  if (ms.every((m) => m === 0)) return 'por-migrar'
  return 'inesperada'
}

async function crearAusenciaCruda(fechaInicio, fechaFin) {
  // insertMany con validación desactivada: se están fabricando a propósito
  // documentos con la forma VIEJA, que el service ya no produce.
  const [doc] = await Ausencia.collection.insertMany([
    {
      solicitante: new (await import('mongoose')).default.Types.ObjectId(),
      tipo: 'vacaciones',
      fechaInicio: new Date(fechaInicio),
      fechaFin: new Date(fechaFin),
      diasHabiles: 1,
      estado: 'pendiente',
      decision: {},
    },
  ]).then((r) => Object.values(r.insertedIds))
  return Ausencia.findById(doc)
}

describe('Migración de fechas de ausencias', () => {
  it('reancla un documento viejo al mismo día, no al anterior', async () => {
    // Forma vieja: medianoche UTC del 20 de agosto.
    const doc = await crearAusenciaCruda('2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z')
    expect(clasificar(doc)).toBe('por-migrar')

    // Antes de migrar, un navegador de Colombia lo veía como el día 19.
    expect(doc.fechaInicio.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })).toBe('2026-08-19')

    const migrada = reanclar(doc.fechaInicio)
    expect(migrada.toISOString()).toBe('2026-08-20T05:00:00.000Z')
    expect(migrada.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })).toBe('2026-08-20')
  })

  it('es idempotente: un documento ya migrado no se vuelve a tocar', async () => {
    const doc = await crearAusenciaCruda('2026-08-20T05:00:00.000Z', '2026-08-24T05:00:00.000Z')
    expect(clasificar(doc)).toBe('ya-correcta')
  })

  it('no toca un documento con un horario que no sabe interpretar', async () => {
    // P. ej. uno guardado con hora real, o migrado a medias.
    const doc = await crearAusenciaCruda('2026-08-20T13:45:00.000Z', '2026-08-20T13:45:00.000Z')
    expect(clasificar(doc)).toBe('inesperada')
  })

  it('marca como inesperado un documento con los dos extremos en formas distintas', async () => {
    const doc = await crearAusenciaCruda('2026-08-20T00:00:00.000Z', '2026-08-24T05:00:00.000Z')
    expect(clasificar(doc)).toBe('inesperada')
  })

  it('conserva la duración del rango al migrar los dos extremos', async () => {
    const doc = await crearAusenciaCruda('2026-08-20T00:00:00.000Z', '2026-08-24T00:00:00.000Z')
    const inicio = reanclar(doc.fechaInicio)
    const fin = reanclar(doc.fechaFin)
    expect((fin - inicio) / (24 * MS_HORA)).toBe(4)
  })
})
