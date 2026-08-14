import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import Mantenimiento from '../src/models/mantenimiento/Mantenimiento.js'
import Equipo from '../src/models/mantenimiento/Equipo.js'
import { actualizarEstadosVencidos } from '../src/modules/mantenimiento/mantenimientos.controller.js'
import { obtenerPanel } from '../src/modules/mantenimiento/panel.controller.js'

// Regresión de BUG-005/BUG-014 (auditoría 2026-08-13).
//
// `actualizarEstadosVencidos` calculaba "hoy en Bogotá" con
// `new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Bogota' }))`
// seguido de `setHours(0,0,0,0)`: el truco del toLocaleString sí produce la
// hora de pared correcta de Bogotá, pero setHours vuelve a zonificar ese
// resultado según la zona del PROCESO — en el VPS (UTC) el resultado final
// terminaba siendo 5 horas más tarde de lo debido. Un mantenimiento
// "programado" para exactamente hoy podía tardar hasta 5 horas de más en
// pasar a "pendiente", o pasar antes de tiempo según el signo del desfase.
//
// `obtenerPanel` (para "próximos 7 días") tenía el mismo patrón con
// `new Date(); setHours(0,0,0,0)` directo, sin ni siquiera el truco de zona.

function refCatalogo(nombre) {
  return { id: new mongoose.Types.ObjectId(), nombre }
}

async function crearEquipo() {
  const sufijo = Math.random().toString(36).slice(2)
  return Equipo.create({
    numero_inventario: `INV-${sufijo}`,
    serial: `SER-${sufijo}`,
    tipo: refCatalogo('Vehículo'),
    marca: refCatalogo('Marca de prueba'),
    modelo: 'Modelo X',
    ubicacion: 'Patio 1',
    responsable: 'Juan',
    dependencia: 'Operaciones',
    estado_actual: 'operativo',
  })
}

function fakeRes() {
  const res = { body: null }
  res.json = (payload) => { res.body = payload; return res }
  res.status = () => res
  return res
}

describe('Mantenimiento — "hoy" se calcula en el Terminal', () => {
  it('un mantenimiento programado para exactamente hoy pasa a pendiente', async () => {
    const equipo = await crearEquipo()
    // hoy() (utils/fechas.js) da la medianoche exacta del Terminal: si la
    // comparación usa una hora distinta, este caso borde falla.
    const { hoy } = await import('../src/utils/fechas.js')
    const doc = await Mantenimiento.create({
      equipo: equipo._id,
      fecha: hoy(),
      tipo: 'preventivo',
      tecnico: 'Juan',
      descripcion: 'Revisión',
      estado: 'programado',
    })

    await actualizarEstadosVencidos()

    expect((await Mantenimiento.findById(doc._id)).estado).toBe('pendiente')
  })

  it('un mantenimiento programado para mañana en el Terminal sigue programado', async () => {
    const equipo = await crearEquipo()
    const { hoy } = await import('../src/utils/fechas.js')
    const mañana = new Date(hoy().getTime() + 24 * 60 * 60 * 1000)
    const doc = await Mantenimiento.create({
      equipo: equipo._id,
      fecha: mañana,
      tipo: 'preventivo',
      tecnico: 'Juan',
      descripcion: 'Revisión',
      estado: 'programado',
    })

    await actualizarEstadosVencidos()

    expect((await Mantenimiento.findById(doc._id)).estado).toBe('programado')
  })
})

describe('Mantenimiento — panel de próximos 7 días', () => {
  it('incluye un mantenimiento programado para exactamente dentro de 7 días', async () => {
    const equipo = await crearEquipo()
    const { hoy } = await import('../src/utils/fechas.js')
    const en7dias = new Date(hoy().getTime() + 7 * 24 * 60 * 60 * 1000)
    await Mantenimiento.create({
      equipo: equipo._id,
      fecha: en7dias,
      tipo: 'preventivo',
      tecnico: 'Juan',
      descripcion: 'Revisión',
      estado: 'programado',
    })

    const res = fakeRes()
    await obtenerPanel({}, res)

    expect(res.body.mantenimientos_proximos).toHaveLength(1)
  })

  it('excluye un mantenimiento programado para dentro de 8 días', async () => {
    const equipo = await crearEquipo()
    const { hoy } = await import('../src/utils/fechas.js')
    const en8dias = new Date(hoy().getTime() + 8 * 24 * 60 * 60 * 1000)
    await Mantenimiento.create({
      equipo: equipo._id,
      fecha: en8dias,
      tipo: 'preventivo',
      tecnico: 'Juan',
      descripcion: 'Revisión',
      estado: 'programado',
    })

    const res = fakeRes()
    await obtenerPanel({}, res)

    expect(res.body.mantenimientos_proximos).toHaveLength(0)
  })
})
