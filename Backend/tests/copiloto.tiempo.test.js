import { describe, expect, it } from 'vitest'
import { horaActual, fechaActual, resolverZona } from '../src/modules/copiloto/copiloto.tiempo.js'
import { resolverMoneda } from '../src/modules/copiloto/copiloto.divisas.js'

// Las dos capas que se prueban aquí son las que traducen lo que DICE el
// usuario a un identificador técnico. Es donde un error no se nota: responder
// la hora de Bogotá a quien preguntó por Tokio, o convertir a pesos mexicanos
// cuando pidieron colombianos, produce una respuesta con toda la apariencia de
// ser correcta.
//
// Lo que NO se prueba aquí es la hora concreta: depende del reloj, y afirmar
// un valor haría el test inútil o intermitente. Se verifica la FORMA y la
// coherencia entre zonas, que es lo que puede romperse al tocar el código.

describe('resolverZona', () => {
  it('sin lugar, la del Terminal', () => {
    expect(resolverZona()).toBe('America/Bogota')
  })

  it('reconoce ciudades colombianas y el país', () => {
    expect(resolverZona('Neiva')).toBe('America/Bogota')
    expect(resolverZona('Colombia')).toBe('America/Bogota')
  })

  it('ignora tildes y mayúsculas (llega de voz transcrita)', () => {
    expect(resolverZona('BOGOTÁ')).toBe('America/Bogota')
    expect(resolverZona('méxico')).toBe('America/Mexico_City')
  })

  it('acepta una zona IANA literal que no esté en la lista de alias', () => {
    expect(resolverZona('Europe/Lisbon')).toBe('Europe/Lisbon')
  })

  it('devuelve null ante un lugar desconocido en vez de caer a Bogotá', () => {
    // Responder la hora del Terminal a quien preguntó por otro sitio es peor
    // que decir que no se sabe: el usuario no tiene forma de notar el error.
    expect(resolverZona('Ciudad Inventada')).toBeNull()
    expect(resolverZona('DROP TABLE usuarios')).toBeNull()
  })
})

describe('horaActual', () => {
  it('devuelve hora, fecha y desfase con forma válida', () => {
    const r = horaActual()
    expect(r.zona).toBe('America/Bogota')
    expect(r.hora24).toMatch(/^\d{2}:\d{2}$/)
    expect(r.desfaseUTC).toBe('UTC-5') // Colombia no tiene horario de verano
    expect(() => new Date(r.iso).toISOString()).not.toThrow()
  })

  it('zonas distintas dan horas distintas', () => {
    expect(horaActual('Bogotá').hora24).not.toBe(horaActual('Tokio').hora24)
  })

  it('reporta el error del lugar desconocido en vez de responder otra hora', () => {
    const r = horaActual('Ciudad Inventada')
    expect(r.error).toBeTruthy()
    expect(r.hora).toBeUndefined()
  })
})

describe('fechaActual', () => {
  it('devuelve el ISO corto y las partes para resolver fechas relativas', () => {
    const r = fechaActual()
    expect(r.fechaISO).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof r.dia).toBe('number')
    expect(typeof r.anio).toBe('number')
    expect(r.diaSemana).toBeTruthy()
  })

  it('el día del mes coincide con el ISO corto', () => {
    // Cubre el error clásico de componer la fecha a mano: mes 0-indexado o
    // padding mal puesto desincronizan las dos representaciones.
    const r = fechaActual()
    expect(Number(r.fechaISO.slice(8, 10))).toBe(r.dia)
    expect(Number(r.fechaISO.slice(0, 4))).toBe(r.anio)
  })
})

describe('resolverMoneda', () => {
  it('mapea "pesos" a COP, no a otro peso', () => {
    // En un ERP colombiano, "pesos" sin más es COP. Resolverlo a MXN daría una
    // cifra plausible y equivocada.
    expect(resolverMoneda('pesos')).toBe('COP')
    expect(resolverMoneda('peso colombiano')).toBe('COP')
    expect(resolverMoneda('pesos mexicanos')).toBe('MXN')
  })

  it('reconoce nombres comunes y códigos ISO', () => {
    expect(resolverMoneda('dólares')).toBe('USD')
    expect(resolverMoneda('usd')).toBe('USD')
    expect(resolverMoneda('euros')).toBe('EUR')
  })

  it('deja pasar códigos ISO que no están en la lista de alias', () => {
    expect(resolverMoneda('sek')).toBe('SEK')
  })

  it('devuelve null ante lo desconocido en vez de asumir una moneda', () => {
    expect(resolverMoneda('monedas de chocolate')).toBeNull()
    expect(resolverMoneda('')).toBeNull()
    expect(resolverMoneda(null)).toBeNull()
  })
})
