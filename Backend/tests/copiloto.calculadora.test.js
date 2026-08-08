import { describe, expect, it } from 'vitest'
import { calcular } from '../src/modules/copiloto/copiloto.calculadora.js'

// La calculadora recibe expresiones que ESCRIBE UN MODELO a partir de texto de
// un usuario, así que hay dos clases de prueba con pesos distintos:
//  - Que calcule bien: si falla, se responde una cifra equivocada con total
//    seguridad y nadie la verifica.
//  - Que no ejecute nada: es la razón por la que existe el parser en vez de
//    `eval`, y lo único que la hace segura por construcción.

describe('aritmética básica', () => {
  it('respeta la precedencia de operadores', () => {
    expect(calcular('2 + 3 * 4').resultado).toBe(14)
    expect(calcular('(2 + 3) * 4').resultado).toBe(20)
  })

  it('resuelve el ejemplo del enunciado', () => {
    expect(calcular('250 * 38').resultado).toBe(9500)
  })

  it('asocia la potencia por la derecha, como en matemáticas', () => {
    // 2^(3^2) = 512, NO (2^3)^2 = 64. Es el error clásico al escribir un
    // parser a mano y da resultados silenciosamente distintos.
    expect(calcular('2 ^ 3 ^ 2').resultado).toBe(512)
  })

  it('acepta ** como sinónimo de ^ (es lo que emite un modelo)', () => {
    expect(calcular('2 ** 10').resultado).toBe(1024)
  })

  it('aplica el signo unario', () => {
    expect(calcular('-5 + 3').resultado).toBe(-2)
    expect(calcular('10 * -2').resultado).toBe(-20)
  })

  it('soporta decimales', () => {
    expect(calcular('1.5 * 4').resultado).toBe(6)
  })
})

describe('porcentajes', () => {
  it('resuelve "X% de Y", que es como se pregunta en el Terminal', () => {
    expect(calcular('19% de 850000').resultado).toBe(161500)
    expect(calcular('19% de 2 millones').resultado).toBe(380000)
  })

  it('sin "de", el porcentaje es una fracción', () => {
    expect(calcular('50%').resultado).toBe(0.5)
    expect(calcular('1000 * 19%').resultado).toBe(190)
  })
})

describe('magnitudes en español', () => {
  it('interpreta mil y millones', () => {
    expect(calcular('2 millones').resultado).toBe(2_000_000)
    expect(calcular('700 mil').resultado).toBe(700_000)
  })

  it('resuelve la resta del enunciado ("gano 2 millones, gasto 700 mil")', () => {
    expect(calcular('2 millones - 700 mil').resultado).toBe(1_300_000)
  })

  it('billón es 10^12 (escala larga), no 10^9', () => {
    // Confundirlo con el billion inglés son tres órdenes de magnitud en una
    // cifra de dinero.
    expect(calcular('1 billon').resultado).toBe(1e12)
  })

  it('acepta operadores dictados en palabras', () => {
    expect(calcular('250 por 38').resultado).toBe(9500)
    expect(calcular('100 entre 4').resultado).toBe(25)
  })
})

describe('formato de salida', () => {
  it('usa separador de miles colombiano y omite decimales enteros', () => {
    expect(calcular('19% de 2 millones').formateado).toBe('380.000')
  })

  it('no arrastra basura de coma flotante', () => {
    expect(calcular('0.1 + 0.2').formateado).toBe('0,30')
  })
})

describe('separadores de miles y decimales', () => {
  it('lee la coma de miles como agrupador', () => {
    expect(calcular('1,000 + 1').resultado).toBe(1001)
  })

  it('lee la coma decimal cuando no agrupa tres dígitos', () => {
    expect(calcular('1,5 * 2').resultado).toBe(3)
  })

  it('ignora símbolos de moneda', () => {
    expect(calcular('$1500 + $200').resultado).toBe(1700)
  })
})

describe('seguridad: nada que no sea aritmética entra', () => {
  // Ninguno de estos casos debe ejecutar NADA. Que devuelvan error es lo
  // esperado; lo que se está verificando de verdad es que la gramática no
  // tenga forma de expresar una llamada, un acceso a propiedad ni un bucle.
  const ataques = [
    'process.exit(1)',
    'require("fs").readFileSync("/etc/passwd")',
    'globalThis.process.env.JWT_SECRET',
    'constructor.constructor("return 1")()',
    '(function(){ while(true){} })()',
    '__proto__',
    'fetch("http://malo.example")',
    '1; console.log("x")',
    'this',
  ]

  for (const entrada of ataques) {
    it(`rechaza: ${entrada}`, () => {
      const salida = calcular(entrada)
      expect(salida.error).toBeTruthy()
      expect(salida.resultado).toBeUndefined()
    })
  }
})

describe('errores de forma', () => {
  it('rechaza la división entre cero en vez de devolver Infinity', () => {
    expect(calcular('5 / 0').error).toMatch(/cero/i)
  })

  it('rechaza paréntesis sin cerrar', () => {
    expect(calcular('(2 + 3').error).toBeTruthy()
  })

  it('rechaza sobras al final', () => {
    expect(calcular('2 + 3 4').error).toBeTruthy()
  })

  it('rechaza la expresión vacía', () => {
    expect(calcular('').error).toBeTruthy()
    expect(calcular(null).error).toBeTruthy()
  })

  it('acota el exponente para que no cuelgue el proceso', () => {
    // Sin el techo, el motor intenta calcularlo y bloquea el event loop.
    expect(calcular('2 ^ 100000000').error).toMatch(/exponente/i)
  })

  it('acota la longitud de la expresión', () => {
    expect(calcular('1+'.repeat(400) + '1').error).toBeTruthy()
  })

  it('no devuelve Infinity ni NaN como resultado', () => {
    const salida = calcular('9 ^ 999')
    expect(salida.resultado === undefined || Number.isFinite(salida.resultado)).toBe(true)
  })
})
