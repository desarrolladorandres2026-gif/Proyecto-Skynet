import { describe, it, expect, vi, afterEach } from 'vitest'
import { calcularCorte } from '../src/modules/backup/purga.service.js'

// Regresión de BUG-012 (auditoría 2026-08-13). `new Date('2026-05-31')
// .setMonth(mes - 6)` desborda: el 31 de mayo menos 6 meses no da el 30 de
// noviembre sino el 1 de diciembre (noviembre solo tiene 30 días, y
// setMonth "arregla" la fecha corriéndola hacia adelante). Esta operación
// BORRA documentos con `$lt: corte`, así que el desborde hacía que la purga
// se comiera un día de historial de más cada vez que "hoy" caía en el día
// 29, 30 o 31 de un mes.

function fijarHoyEn(iso) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('purga.service — corte de retención', () => {
  it('no desborda de mes cuando hoy es un día 31', () => {
    fijarHoyEn('2026-05-31T12:00:00Z')
    // 6 meses atrás desde el 31 de mayo: noviembre no tiene día 31, así que
    // debe caer en el ÚLTIMO día de noviembre, no en diciembre.
    expect(calcularCorte(6).toISOString().slice(0, 10)).toBe('2025-11-30')
  })

  it('retención de 12 meses desde un día 31', () => {
    fijarHoyEn('2026-05-31T12:00:00Z')
    expect(calcularCorte(12).toISOString().slice(0, 10)).toBe('2025-05-31')
  })

  it('rechaza cualquier plazo que no sea 6 o 12', () => {
    expect(() => calcularCorte(3)).toThrow(/6 o 12 meses/)
    expect(() => calcularCorte('todo')).toThrow(/6 o 12 meses/)
  })
})
