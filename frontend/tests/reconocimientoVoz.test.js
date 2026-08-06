import { describe, expect, it } from 'vitest'
import { detectarActivacion, detectarInterrupcion } from '../src/components/copiloto/useReconocimientoVoz.js'
import { limpiarParaVoz } from '../src/components/copiloto/useHablar.js'

// Las tres piezas puras del audio, probadas sin navegador. Son las más
// frágiles del asistente: dependen de cómo el transcriptor en es-CO deforme
// una palabra inglesa, y sus fallos se manifiestan como "a veces no me oye" o
// "se calla solo", que es casi imposible de depurar en vivo.

describe('detectarActivacion (encender el asistente)', () => {
  it('acepta la frase completa y devuelve lo que sigue como pregunta', () => {
    expect(detectarActivacion('Oye Skynet, ¿cuántos requerimientos tengo?')).toEqual({
      resto: 'cuantos requerimientos tengo',
    })
  })

  it('acepta variantes fonéticas de un nombre inglés dicho en español', () => {
    expect(detectarActivacion('hey eskinet')).not.toBeNull()
    expect(detectarActivacion('oye sky net')).not.toBeNull()
    expect(detectarActivacion('oiga asistente')).not.toBeNull()
  })

  it('acepta el nombre solo al inicio, por si se comió el disparador', () => {
    expect(detectarActivacion('Skynet, dime mis pendientes')).toEqual({ resto: 'dime mis pendientes' })
  })

  it('NO activa cuando el nombre aparece a mitad de otra frase', () => {
    expect(detectarActivacion('el requerimiento de skynet quedó listo')).toBeNull()
    expect(detectarActivacion('necesito un asistente de bodega')).toBeNull()
  })
})

describe('detectarInterrupcion (cortar a Skynet mientras habla)', () => {
  it('acepta la frase completa, igual que la activación normal', () => {
    expect(detectarInterrupcion('oye skynet para')).toEqual({ resto: 'para' })
  })

  // ── La propiedad que evita el bucle de auto-interrupción ─────────────────
  // Durante la respuesta el micrófono está oyendo el propio altavoz. Si el
  // patrón laxo valiera aquí, bastaría que Skynet dijera su nombre para
  // cortarse a sí mismo, una y otra vez.
  it('NO se dispara con el nombre suelto, que es lo que Skynet dice de sí mismo', () => {
    expect(detectarInterrupcion('Skynet')).toBeNull()
    expect(detectarInterrupcion('Hola, soy Skynet. Así sueno con esta voz.')).toBeNull()
    expect(detectarInterrupcion('asistente')).toBeNull()
    // Contraste explícito: la activación normal SÍ acepta estas dos, y por eso
    // hacen falta las dos funciones y no una sola.
    expect(detectarActivacion('Skynet')).not.toBeNull()
  })

  it('NO se dispara con una respuesta larga que mencione el Terminal', () => {
    const respuestaTipica =
      'Tienes 3 requerimientos pendientes de aprobación de Financiero y 1 en Bodega desde el martes.'
    expect(detectarInterrupcion(respuestaTipica)).toBeNull()
  })
})

describe('limpiarParaVoz', () => {
  it('quita el Markdown que el sintetizador leería en voz alta', () => {
    expect(limpiarParaVoz('- **Estado:** pendiente')).toBe('Estado: pendiente')
    expect(limpiarParaVoz('## Resumen')).toBe('Resumen')
    expect(limpiarParaVoz('usa `npm test`')).toBe('usa npm test')
  })
})
