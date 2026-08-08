// Calculadora del copiloto: parser de descenso recursivo, SIN eval ni Function.
//
// ── Por qué un parser propio y no `eval` / `new Function` ───────────────────
// Aquí la expresión la escribe un MODELO a partir de texto de un usuario, así
// que hay que asumir que puede llegar cualquier cosa. `eval("process.exit()")`
// mata el servidor; `eval("while(1){}")` lo cuelga. Ni siquiera "sanear con
// una regex y después evaluar" es defendible: cada lista negra que se escribe
// es una apuesta a haber pensado en todo, y basta un caso para perder.
//
// Un parser no tiene ese problema por construcción: solo sabe leer números y
// cinco operadores. No existe la sintaxis con la que pedirle otra cosa — no
// hay nada que filtrar porque no hay nada que ejecutar.
//
// Tampoco se usó una librería (mathjs): son ~180 KB para lo que aquí cabe en
// un archivo, y su evaluador trae funciones, variables y asignación, que es
// justo la superficie que no queremos exponer.

// Techo de longitud. Una expresión legítima de este dominio ("el 19% de
// 2500000") no pasa de 40 caracteres; el techo existe para que nadie pueda
// mandar una cadena de megabytes y hacer trabajar al tokenizador en balde.
const MAX_CARACTERES = 500

// Techo del exponente. `2 ** 1e9` no es una expresión, es una forma de colgar
// el proceso: el motor de JS intenta calcularlo y bloquea el event loop. Con
// exponentes acotados el peor caso es Infinity, que se detecta y se reporta.
const MAX_EXPONENTE = 1000

// Multiplicadores en español. Existen porque el usuario habla así ("dos
// millones", "700 mil") y el modelo los pasa tal cual con frecuencia; sin
// esto la herramienta devolvería un error de sintaxis por algo que cualquier
// persona lee sin dudar.
//
// OJO con `billon`: en español son 10^12 (escala larga), no 10^9 como en
// inglés. Traducir mal esto son tres órdenes de magnitud en una cifra de
// dinero, así que se deja explícito y comentado.
const MULTIPLICADORES = {
  mil: 1e3,
  miles: 1e3,
  millon: 1e6,
  millones: 1e6,
  billon: 1e12,
  billones: 1e12,
}

// Operadores dictados en palabras. El modelo normalmente emite símbolos, pero
// cuando el usuario dicta por voz ("250 por 38") a veces los pasa literales.
const OPERADORES_PALABRA = {
  mas: '+',
  menos: '-',
  por: '*',
  entre: '/',
  dividido: '/',
  sobre: '/',
  elevado: '^',
}

class ErrorSintaxis extends Error {}

/**
 * Normaliza el texto antes de tokenizar.
 *
 * El caso interesante es el separador de miles. En Colombia se escribe
 * "1.000,50" y en notación programática "1000.50" — el mismo punto significa
 * cosas opuestas. La regla aplicada: una coma seguida de EXACTAMENTE tres
 * dígitos y que no cierre el número es separador de miles y se borra;
 * cualquier otra coma es un separador decimal y pasa a punto. Así "1,000"
 * es mil y "1,5" es uno coma cinco, que es como los escribe cada uno.
 */
function normalizarNumeros(texto) {
  return texto
    .replace(/(\d),(\d{3})(?=\D|$)/g, '$1$2')
    .replace(/(\d),(\d+)/g, '$1.$2')
}

// Marcas diacríticas combinantes. Escrito con escapes y no con los caracteres
// literales, siguiendo la misma convención que copiloto.memoria.js: ponerlos
// crudos en el fuente convierte el archivo en binario para Git.
const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

function tokenizar(expresion) {
  const texto = normalizarNumeros(expresion.toLowerCase().normalize('NFD').replace(DIACRITICOS, ''))

  const tokens = []
  let i = 0

  while (i < texto.length) {
    const c = texto[i]

    if (c === ' ' || c === '\t' || c === '\n') {
      i++
      continue
    }

    if (c >= '0' && c <= '9') {
      let j = i
      while (j < texto.length && ((texto[j] >= '0' && texto[j] <= '9') || texto[j] === '.')) j++
      const crudo = texto.slice(i, j)
      // Dos puntos en un mismo número ("1.2.3") no es un número: se corta aquí
      // en vez de dejar que Number() devuelva NaN y el error salga más tarde
      // disfrazado de otra cosa.
      if ((crudo.match(/\./g) || []).length > 1) throw new ErrorSintaxis(`Número mal formado: ${crudo}`)
      tokens.push({ tipo: 'numero', valor: Number(crudo) })
      i = j
      continue
    }

    if (/[a-z]/.test(c)) {
      let j = i
      while (j < texto.length && /[a-z]/.test(texto[j])) j++
      const palabra = texto.slice(i, j)
      if (MULTIPLICADORES[palabra] !== undefined) {
        tokens.push({ tipo: 'multiplicador', valor: MULTIPLICADORES[palabra] })
      } else if (OPERADORES_PALABRA[palabra]) {
        tokens.push({ tipo: 'op', valor: OPERADORES_PALABRA[palabra] })
      } else if (palabra === 'mod' || palabra === 'modulo') {
        tokens.push({ tipo: 'op', valor: 'mod' })
      } else if (palabra === 'de' || palabra === 'del') {
        // "el 19% DE 2000" — el "de" es la marca de que el porcentaje se
        // aplica sobre lo que sigue (ver parsePosfijo).
        tokens.push({ tipo: 'de' })
      } else if (palabra === 'y' || palabra === 'con') {
        // Ruido de dictado ("dos mil y quinientos"): se ignora en vez de
        // fallar. Nunca cambia el valor de la expresión.
        // (no se emite token)
      } else {
        throw new ErrorSintaxis(`No entiendo "${palabra}" dentro de un cálculo`)
      }
      i = j
      continue
    }

    if ('+-*/^%()'.includes(c)) {
      // `**` de JS: se acepta como sinónimo de `^` porque es lo que emite un
      // modelo entrenado con código.
      if (c === '*' && texto[i + 1] === '*') {
        tokens.push({ tipo: 'op', valor: '^' })
        i += 2
        continue
      }
      if (c === '(') tokens.push({ tipo: 'abre' })
      else if (c === ')') tokens.push({ tipo: 'cierra' })
      else if (c === '%') tokens.push({ tipo: 'porcentaje' })
      else tokens.push({ tipo: 'op', valor: c })
      i++
      continue
    }

    // Símbolos de moneda y separadores sueltos: se ignoran en vez de fallar.
    // "$1.500 + $200" es una expresión perfectamente clara.
    if ('$€ '.includes(c)) {
      i++
      continue
    }

    throw new ErrorSintaxis(`Carácter no permitido en un cálculo: "${c}"`)
  }

  return tokens
}

/**
 * Gramática (precedencia de menor a mayor):
 *
 *   expresion := termino (('+' | '-') termino)*
 *   termino   := potencia (('*' | '/' | 'mod') potencia)*
 *   potencia  := unario ('^' potencia)?          // asociativo por la DERECHA
 *   unario    := ('-' | '+')* posfijo
 *   posfijo   := primario multiplicador? ('%' ('de' expresion)?)?
 *   primario  := NUMERO | '(' expresion ')'
 */
function analizar(tokens) {
  let pos = 0

  const actual = () => tokens[pos]
  const consumir = () => tokens[pos++]

  function expresion() {
    let izq = termino()
    while (actual()?.tipo === 'op' && (actual().valor === '+' || actual().valor === '-')) {
      const op = consumir().valor
      const der = termino()
      izq = op === '+' ? izq + der : izq - der
    }
    return izq
  }

  function termino() {
    let izq = potencia()
    while (actual()?.tipo === 'op' && ['*', '/', 'mod'].includes(actual().valor)) {
      const op = consumir().valor
      const der = potencia()
      if ((op === '/' || op === 'mod') && der === 0) throw new ErrorSintaxis('No se puede dividir entre cero')
      if (op === '*') izq = izq * der
      else if (op === '/') izq = izq / der
      else izq = izq % der
    }
    return izq
  }

  function potencia() {
    const base = unario()
    if (actual()?.tipo === 'op' && actual().valor === '^') {
      consumir()
      // Recursión a `potencia` y no a `unario`: `2^3^2` es 2^(3^2)=512, no
      // (2^3)^2=64. La exponenciación asocia por la derecha en matemáticas y
      // en JS (`**`), y no respetarlo daría resultados silenciosamente malos.
      const exp = potencia()
      if (Math.abs(exp) > MAX_EXPONENTE) {
        throw new ErrorSintaxis(`El exponente es demasiado grande (máximo ${MAX_EXPONENTE})`)
      }
      return base ** exp
    }
    return base
  }

  function unario() {
    if (actual()?.tipo === 'op' && (actual().valor === '-' || actual().valor === '+')) {
      const op = consumir().valor
      const valor = unario()
      return op === '-' ? -valor : valor
    }
    return posfijo()
  }

  function posfijo() {
    let valor = primario()

    // "2 millones" → 2 * 1e6. Encadenable ("2 mil millones").
    while (actual()?.tipo === 'multiplicador') {
      valor *= consumir().valor
    }

    if (actual()?.tipo === 'porcentaje') {
      consumir()
      // "19% de 2000" = 380 — el porcentaje se aplica SOBRE lo que sigue.
      // Sin el "de", "19%" a secas vale 0.19, que es lo correcto para
      // "1000 * 19%" pero también para "19% + 1".
      if (actual()?.tipo === 'de') {
        consumir()
        return (valor / 100) * expresion()
      }
      return valor / 100
    }

    return valor
  }

  function primario() {
    const token = actual()
    if (!token) throw new ErrorSintaxis('La expresión termina antes de tiempo')

    if (token.tipo === 'numero') {
      consumir()
      return token.valor
    }
    if (token.tipo === 'multiplicador') {
      // "mil" sin número delante vale 1000, no cero.
      consumir()
      return token.valor
    }
    if (token.tipo === 'abre') {
      consumir()
      const valor = expresion()
      if (actual()?.tipo !== 'cierra') throw new ErrorSintaxis('Falta cerrar un paréntesis')
      consumir()
      return valor
    }
    throw new ErrorSintaxis('La expresión no está bien formada')
  }

  const resultado = expresion()
  if (pos < tokens.length) throw new ErrorSintaxis('Sobra algo al final de la expresión')
  return resultado
}

/**
 * Evalúa una expresión aritmética. NUNCA lanza: los errores vuelven como
 * `{ error }` porque el que la llama es una herramienta del modelo, y a este
 * hay que darle un texto que pueda explicarle al usuario, no una excepción.
 *
 * @param {string} expresion
 * @returns {{expresion: string, resultado: number, formateado: string} | {error: string}}
 */
export function calcular(expresion) {
  const texto = String(expresion ?? '').trim()
  if (!texto) return { error: 'Falta la expresión a calcular' }
  if (texto.length > MAX_CARACTERES) return { error: 'La expresión es demasiado larga' }

  try {
    const resultado = analizar(tokenizar(texto))

    // NaN e Infinity no son resultados: son la forma que tiene JS de decir que
    // la operación no tiene valor. Devolverlos haría que el modelo dijera
    // "el resultado es Infinity", que no le sirve a nadie.
    if (!Number.isFinite(resultado)) {
      return { error: 'El resultado no es un número válido (revisa la operación)' }
    }

    return {
      expresion: texto,
      resultado,
      // Formato colombiano y redondeo a 2 decimales: esto casi siempre es
      // dinero, y "380000" leído en voz alta es peor que "380.000".
      formateado: formatear(resultado),
    }
  } catch (err) {
    if (err instanceof ErrorSintaxis) return { error: err.message }
    return { error: 'No pude interpretar esa operación' }
  }
}

function formatear(numero) {
  // Los decimales solo se muestran si los hay: "20" y no "20,00". El máximo de
  // 2 evita arrastrar la basura de coma flotante (0.1+0.2 = 0.30000000000004).
  const decimales = Number.isInteger(numero) ? 0 : 2
  return numero.toLocaleString('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}
