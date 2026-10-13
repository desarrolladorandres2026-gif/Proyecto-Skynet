import { describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import Ausencia from '../src/models/Ausencia.js'
import PreferenciaIA from '../src/models/PreferenciaIA.js'
import { obtenerRecordatorio, INTERVALO_MS } from '../src/modules/ia/ia.recordatorios.js'

vi.mock('../src/modules/sistema/sistema.service.js', () => ({ estaModuloActivo: async () => true }))

// Lo que esta suite fija es la parte que NO es pura: el reloj compartido en
// PreferenciaIA. Si se rompe, Skynet le habla al usuario cada vez que cambia
// de pestaña (el fallo que haría que lo silencie para siempre) o nunca más.

const superAdmin = (id) => ({
  id_usuario: id,
  nombre_usuario: 'Andrés Pérez',
  esSuperAdmin: true,
  permisos: new Set(),
  rol: { slug: 'super_admin' },
})

async function sembrarAusenciaPendiente(solicitante) {
  await Ausencia.create({
    solicitante,
    tipo: 'vacaciones',
    estado: 'pendiente',
    fechaInicio: new Date(),
    fechaFin: new Date(Date.now() + 86_400_000),
    diasHabiles: 1,
  })
}

describe('obtenerRecordatorio', () => {
  it('guarda silencio y NO gasta el turno cuando no hay nada pendiente', async () => {
    const id = new mongoose.Types.ObjectId()

    expect(await obtenerRecordatorio(superAdmin(id))).toBeNull()
    expect(await PreferenciaIA.findOne({ usuario: id })).toBeNull()
  })

  it('recuerda lo pendiente la primera vez y registra el turno', async () => {
    const id = new mongoose.Types.ObjectId()
    await sembrarAusenciaPendiente(id)
    const ahora = new Date()

    const r = await obtenerRecordatorio(superAdmin(id), ahora)

    expect(r.texto).toContain('Recordatorio, Andrés.')
    expect(r.texto).toContain('1 solicitud de ausencia por revisar')
    expect(r.acciones).toEqual([{ etiqueta: 'Ausencias por decidir', ruta: '/ausencias/bandeja' }])
    const pref = await PreferenciaIA.findOne({ usuario: id })
    expect(pref.ultimoRecordatorioEn.getTime()).toBe(ahora.getTime())
  })

  it('no repite dentro del intervalo y vuelve a recordar al cumplirse', async () => {
    const id = new mongoose.Types.ObjectId()
    await sembrarAusenciaPendiente(id)
    const t0 = new Date('2026-10-13T10:00:00Z')

    expect(await obtenerRecordatorio(superAdmin(id), t0)).not.toBeNull()
    expect(await obtenerRecordatorio(superAdmin(id), new Date(t0.getTime() + 60 * 60 * 1000))).toBeNull()
    expect(await obtenerRecordatorio(superAdmin(id), new Date(t0.getTime() + INTERVALO_MS))).not.toBeNull()
  })

  it('respeta al usuario que apagó los recordatorios', async () => {
    const id = new mongoose.Types.ObjectId()
    await sembrarAusenciaPendiente(id)
    await PreferenciaIA.create({ usuario: id, recordatorios: { activo: false } })

    expect(await obtenerRecordatorio(superAdmin(id))).toBeNull()
  })

  it('con dos pestañas llegando a la vez, solo una recibe el recordatorio', async () => {
    const id = new mongoose.Types.ObjectId()
    await sembrarAusenciaPendiente(id)
    // Se garantiza que el documento YA exista: el caso real más común (el
    // usuario ya tiene preferencias) y el que ejercita el filtro de la
    // actualización atómica en vez del índice único del insert.
    await PreferenciaIA.create({ usuario: id })
    const ahora = new Date()

    const resultados = await Promise.all(
      Array.from({ length: 5 }, () => obtenerRecordatorio(superAdmin(id), ahora))
    )

    expect(resultados.filter(Boolean)).toHaveLength(1)
  })

  it('con dos pestañas a la vez y sin documento previo, tampoco se duplica ni lanza', async () => {
    const id = new mongoose.Types.ObjectId()
    await sembrarAusenciaPendiente(id)
    const ahora = new Date()

    const resultados = await Promise.all(
      Array.from({ length: 5 }, () => obtenerRecordatorio(superAdmin(id), ahora))
    )

    expect(resultados.filter(Boolean)).toHaveLength(1)
  })
})
