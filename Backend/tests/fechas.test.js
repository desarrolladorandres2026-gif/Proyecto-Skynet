import { describe, it, expect } from 'vitest'
import { inicioDelDia, rangoDeDias, contarDias, restarMeses, hoy } from '../src/utils/fechas.js'
import { ErrorValidacion } from '../src/utils/errores.js'

// Regresión de BUG-003, BUG-005 y BUG-012 (auditoría 2026-08-13).
//
// El objetivo de estas pruebas no es solo que los cálculos den bien: es que
// den IGUAL corra donde corra el servidor. Los tres bugs venían de mezclar
// `new Date('YYYY-MM-DD')` (que parsea en UTC) con `setHours` (que opera en la
// zona del proceso Node), así que el resultado dependía de la variable TZ del
// VPS — algo que nadie fija a propósito y que cambia si alguien intenta
// "arreglar las fechas" en el servidor.
//
// Vitest fija la TZ por proceso, así que aquí no se puede cambiar en caliente;
// scripts/verificar-fechas-tz.js corre esta misma comprobación bajo TZ=UTC y
// TZ=America/Bogota. Lo que sí se puede fijar aquí es el resultado exacto en
// UTC, que es lo que hace que un cambio de TZ se note como fallo.

describe('inicioDelDia', () => {
  it('ancla el día a la medianoche del Terminal, no a la del servidor', () => {
    // 00:00 en Neiva (UTC-5) son las 05:00 UTC del mismo día.
    expect(inicioDelDia('2026-08-20').toISOString()).toBe('2026-08-20T05:00:00.000Z')
  })

  it('guarda el día que el usuario eligió, no el anterior', () => {
    // El bug concreto: con TZ=America/Bogota, aDia('2026-08-20') guardaba el 19.
    const guardado = inicioDelDia('2026-08-20')
    expect(guardado.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })).toBe('2026-08-20')
  })

  it('se muestra con el día correcto en un navegador de Colombia', () => {
    // Este es el síntoma que veía el usuario: la lista mostraba un día y el
    // formulario de edición otro, para el mismo registro.
    const guardado = inicioDelDia('2026-08-20')
    const enLista = guardado.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
    const enFormulario = guardado.toISOString().slice(0, 10) // lo que hace aInputFecha()
    expect(enLista).toContain('20')
    expect(enFormulario).toBe('2026-08-20')
  })

  it('acepta un Date o un ISO completo y toma el día visto desde el Terminal', () => {
    // 2026-08-20T02:00Z son las 9 p.m. del 19 en Neiva: el día es el 19.
    expect(inicioDelDia(new Date('2026-08-20T02:00:00.000Z')).toISOString())
      .toBe('2026-08-19T05:00:00.000Z')
  })

  it('devuelve null ante una fecha inválida en vez de un Invalid Date', () => {
    expect(inicioDelDia('no-es-fecha')).toBeNull()
    expect(inicioDelDia('')).toBeNull()
  })

  it('hoy() cae en el día actual del Terminal', () => {
    const esperado = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    expect(hoy().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })).toBe(esperado)
  })
})

describe('rangoDeDias', () => {
  it('incluye el día "hasta" completo, hasta la medianoche del Terminal', () => {
    const rango = rangoDeDias('2026-08-01', '2026-08-13')
    expect(rango.$gte.toISOString()).toBe('2026-08-01T05:00:00.000Z')
    // El bug: el límite quedaba en 2026-08-13T23:59:59.999Z, que en Colombia
    // son las 6:59 p.m. — todo el turno de la noche quedaba fuera del filtro.
    expect(rango.$lt.toISOString()).toBe('2026-08-14T05:00:00.000Z')
  })

  it('un evento de las 11 p.m. hora Neiva entra en el rango de ese día', () => {
    const rango = rangoDeDias('2026-08-13', '2026-08-13')
    const eventoNocturno = new Date('2026-08-14T04:00:00.000Z') // 23:00 del 13 en Neiva
    expect(eventoNocturno >= rango.$gte && eventoNocturno < rango.$lt).toBe(true)
  })

  it('un evento del día siguiente NO entra', () => {
    const rango = rangoDeDias('2026-08-13', '2026-08-13')
    const diaSiguiente = new Date('2026-08-14T05:00:00.000Z') // 00:00 del 14 en Neiva
    expect(diaSiguiente < rango.$lt).toBe(false)
  })

  it('un solo día es un rango válido de 24 horas', () => {
    const rango = rangoDeDias('2026-08-13', '2026-08-13')
    expect(rango.$lt - rango.$gte).toBe(24 * 60 * 60 * 1000)
  })

  it('rechaza rangos invertidos, incompletos o inválidos', () => {
    expect(() => rangoDeDias('2026-08-13', '2026-08-01')).toThrow(ErrorValidacion)
    expect(() => rangoDeDias('2026-08-13', null)).toThrow(ErrorValidacion)
    expect(() => rangoDeDias('ayer', 'hoy')).toThrow(ErrorValidacion)
  })
})

describe('contarDias', () => {
  it('cuenta días naturales con ambos extremos incluidos', () => {
    expect(contarDias('2026-08-20', '2026-08-20')).toBe(1)
    expect(contarDias('2026-08-20', '2026-08-22')).toBe(3)
  })

  it('cuenta fines de semana: el Terminal opera 24/7', () => {
    // Viernes 2026-08-21 a lunes 2026-08-24.
    expect(contarDias('2026-08-21', '2026-08-24')).toBe(4)
  })

  it('cruza el cambio de mes y de año', () => {
    expect(contarDias('2026-01-30', '2026-02-02')).toBe(4)
    expect(contarDias('2026-12-31', '2027-01-01')).toBe(2)
  })

  it('no se descuadra si los extremos vienen con horas distintas', () => {
    expect(contarDias(new Date('2026-08-20T18:00:00Z'), new Date('2026-08-22T09:00:00Z'))).toBe(3)
  })
})

describe('restarMeses', () => {
  it('no desborda al restar desde un día 31', () => {
    // El bug: 31 de mayo menos 3 meses daba el 3 de MARZO (el 31 de febrero
    // no existe y JS corre la fecha hacia adelante), así que la purga por
    // retención borraba hasta 3 días de historial de más.
    expect(restarMeses(new Date('2026-05-31T12:00:00Z'), 3).toISOString().slice(0, 10))
      .toBe('2026-02-28')
    expect(restarMeses(new Date('2026-03-31T12:00:00Z'), 1).toISOString().slice(0, 10))
      .toBe('2026-02-28')
  })

  it('respeta el año bisiesto', () => {
    expect(restarMeses(new Date('2028-03-31T12:00:00Z'), 1).toISOString().slice(0, 10))
      .toBe('2028-02-29')
  })

  it('resta normalmente cuando el día existe en el mes destino', () => {
    expect(restarMeses(new Date('2026-08-13T12:00:00Z'), 3).toISOString().slice(0, 10))
      .toBe('2026-05-13')
    expect(restarMeses(new Date('2026-08-13T12:00:00Z'), 12).toISOString().slice(0, 10))
      .toBe('2025-08-13')
  })

  it('cruza el cambio de año', () => {
    expect(restarMeses(new Date('2026-02-15T12:00:00Z'), 6).toISOString().slice(0, 10))
      .toBe('2025-08-15')
  })

  it('conserva la hora del instante original', () => {
    expect(restarMeses(new Date('2026-08-13T17:42:11.123Z'), 3).toISOString())
      .toBe('2026-05-13T17:42:11.123Z')
  })
})
