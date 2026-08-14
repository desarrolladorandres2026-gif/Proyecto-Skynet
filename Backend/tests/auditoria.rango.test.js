import { describe, it, expect } from 'vitest'
import RegistroAuditoria from '../src/models/RegistroAuditoria.js'
import { listarAuditoria } from '../src/modules/auditoria/auditoria.service.js'

// Regresión de BUG-005 y BUG-012 (auditoría 2026-08-13).
//
// El filtro por rango de fechas mezclaba `new Date('2026-08-13')` (medianoche
// UTC) con `setHours(23,59,59,999)` (zona del PROCESO Node): en el VPS, que
// corre en UTC, el límite superior de "hasta" caía a las 6:59 p.m. hora de
// Neiva. El Terminal opera 24/7, así que todo lo que hizo el turno de la
// noche desaparecía silenciosamente del filtro de auditoría — justo el módulo
// cuyo propósito es la trazabilidad.
//
// `creadoEn` lo pone Mongoose automáticamente (timestamps: { createdAt:
// 'creadoEn' }), así que para fijar un instante exacto se inserta directo en
// la colección en vez de usar RegistroAuditoria.create().
async function crearRegistro(creadoEn, resto = {}) {
  await RegistroAuditoria.collection.insertOne({
    modulo: 'usuarios',
    accion: 'crear',
    resultado: 'exito',
    creadoEn,
    ...resto,
  })
}

describe('Auditoría — rango de fechas con solo el día (sin hora)', () => {
  it('incluye un evento del turno de la noche del último día del rango', async () => {
    // 23:00 hora Neiva del 13 de agosto = 04:00 UTC del 14.
    await crearRegistro(new Date('2026-08-14T04:00:00.000Z'))

    const { total } = await listarAuditoria({ desde: '2026-08-13', hasta: '2026-08-13' })
    expect(total).toBe(1)
  })

  it('excluye un evento del día siguiente', async () => {
    // 00:00 hora Neiva del 14 = 05:00 UTC del 14: ya es el día 14, no el 13.
    await crearRegistro(new Date('2026-08-14T05:00:00.000Z'))

    const { total } = await listarAuditoria({ desde: '2026-08-13', hasta: '2026-08-13' })
    expect(total).toBe(0)
  })

  it('excluye un evento del día anterior', async () => {
    await crearRegistro(new Date('2026-08-12T23:00:00.000Z'))

    const { total } = await listarAuditoria({ desde: '2026-08-13', hasta: '2026-08-13' })
    expect(total).toBe(0)
  })

  it('un rango de varios días incluye la noche del último', async () => {
    await crearRegistro(new Date('2026-08-01T12:00:00.000Z')) // dentro
    await crearRegistro(new Date('2026-08-14T04:00:00.000Z')) // 23:00 Neiva del 13, último día
    await crearRegistro(new Date('2026-08-14T05:00:01.000Z')) // ya día 14, fuera

    const { total } = await listarAuditoria({ desde: '2026-08-01', hasta: '2026-08-13' })
    expect(total).toBe(2)
  })
})

describe('Auditoría — rango de fechas con hora explícita (datetime-local)', () => {
  it('respeta el minuto exacto elegido, sin redondear al fin del día', async () => {
    await crearRegistro(new Date('2026-08-13T19:31:00.000Z')) // 14:31 Neiva
    await crearRegistro(new Date('2026-08-13T19:31:01.000Z')) // un segundo después

    const { total } = await listarAuditoria({ hasta: '2026-08-13T14:31' })
    expect(total).toBe(1)
  })
})
