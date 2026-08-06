// Capa de texto compartida por el router de intención (copiloto.intencion.js)
// y por la caché de respuestas (copiloto.cache.js). Existe como módulo aparte
// por una razón concreta, no por gusto de dividir: ambas capas tienen que
// coincidir EXACTAMENTE en qué considera "la misma frase". Si la caché
// normaliza distinto que el router, una pregunta puede enrutarse por un atajo
// y su variante casi idéntica caer en el LLM, con dos respuestas distintas
// para lo mismo — el usuario lo lee como que el asistente es inconsistente.
//
// El insumo real de todo esto es voz transcrita en es-CO: llega con tildes
// inconsistentes, muletillas ("porfa", "parce", "pues"), signos de apertura
// españoles y errores de transcripción. Nada de eso cambia la intención.

// Diacríticos que NFD separa como marcas de combinación. Escrito con escapes y
// no con los caracteres literales (invisibles en un editor), igual que
// useReconocimientoVoz.js en el frontend.
const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')
const PUNTUACION = new RegExp('[\\u00bf?\\u00a1!.,;:\'"()\\[\\]{}]', 'g')

/**
 * Forma canónica de una frase: minúsculas, sin tildes, sin puntuación y con
 * los espacios colapsados. Es la clave con la que se compara TODO.
 *
 * La ñ se pierde (queda "n") y eso es correcto AQUÍ: los dos lados de toda
 * comparación pasan por esta misma función, así que "daño" y el sinónimo
 * "daño" del catálogo colapsan los dos a "dano" y siguen coincidiendo. Nunca
 * se usa esta salida para mostrarle texto a nadie, solo para comparar.
 */
export function normalizar(texto) {
  if (typeof texto !== 'string') return ''
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .replace(PUNTUACION, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Palabras que la persona dice pero que no aportan intención. Incluye
// muletillas colombianas de uso diario en el Terminal: quitarlas hace que
// "oiga parce muéstreme pues mis requerimientos" y "mis requerimientos"
// tengan el mismo esqueleto de tokens y puntúen igual.
const VACIAS = new Set([
  // artículos, preposiciones y conectores
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al',
  'a', 'en', 'y', 'o', 'que', 'se', 'lo', 'con', 'por', 'para', 'su', 'sus',
  'me', 'mi', 'mis', 'te', 'tu', 'tus', 'es', 'esta', 'este', 'ese', 'esa', 'hay',
  'mio', 'mios', 'mia', 'mias', 'nuestro', 'nuestra', 'nuestros', 'nuestras',
  // cortesía y muletillas (es-CO)
  'porfa', 'porfavor', 'favor', 'gracias', 'please', 'pues', 'ahi', 'ahora',
  'ya', 'bueno', 'listo', 'parce', 'parcero', 'mijo', 'mija', 'hermano',
  'oiga', 'oye', 'vea', 've', 'sumerce', 'don', 'dona', 'senor', 'senora',
  'usted', 'ud', 'tio', 'papi', 'jefe',
  // el propio nombre del asistente, cuando queda dentro de la frase
  'skynet', 'asistente', 'copiloto',
])

/**
 * Tokens significativos de una frase ya normalizada. Se descartan las palabras
 * vacías y las de una sola letra (residuos de transcripción).
 */
export function tokenizar(texto) {
  return normalizar(texto)
    .split(' ')
    .filter((t) => t.length > 1 && !VACIAS.has(t))
}

/**
 * Distancia de Levenshtein con corte temprano: si la distancia mínima posible
 * de una fila ya supera `maximo`, no tiene sentido terminar la matriz.
 *
 * El corte no es micro-optimización gratuita: esto corre contra el catálogo
 * completo de sinónimos por CADA token de CADA frase, en la ruta que debe
 * decidir en <5 ms. Sin el corte, comparar "requerimientos" contra palabras
 * largas que no tienen nada que ver paga la matriz entera para descartarlas.
 */
export function distancia(a, b, maximo = Infinity) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > maximo) return maximo + 1
  if (!a.length) return b.length
  if (!b.length) return a.length

  const fila = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0]
    fila[0] = i
    let minimoFila = i
    for (let j = 1; j <= b.length; j++) {
      const sustituir = anterior + (a[i - 1] === b[j - 1] ? 0 : 1)
      anterior = fila[j]
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, sustituir)
      if (fila[j] < minimoFila) minimoFila = fila[j]
    }
    if (minimoFila > maximo) return maximo + 1
  }
  return fila[b.length]
}

/**
 * Cuántas ediciones se toleran en una palabra de esta longitud.
 *
 * El corte en 5 letras NO es arbitrario: con tolerancia 1 sobre palabras de 5,
 * "datos" coincidiría con "danos" (una sola sustitución) y preguntar por datos
 * enrutaría al módulo de daños. Por debajo de 6 letras el vocabulario del
 * dominio tiene demasiados vecinos a distancia 1, así que ahí se exige
 * coincidencia exacta. A partir de 9 el riesgo desaparece y es justo donde se
 * necesita: "requerimeintos" (transposición) está a 2 de "requerimientos".
 */
function toleranciaPara(palabra) {
  if (palabra.length <= 5) return 0
  if (palabra.length <= 8) return 1
  return 2
}

/**
 * ¿Este token es (aproximadamente) alguno de los sinónimos dados?
 *
 * Además de la distancia, acepta el prefijo largo: el transcriptor corta
 * palabras a mitad ("requerim…") y las conjugaciones sobran por la derecha
 * ("reportando" vs "reportar"). Se exige que el prefijo compartido sea de al
 * menos 6 caracteres para que "manten" no case con medio diccionario y para
 * que no reintroduzca por la puerta de atrás las colisiones cortas que
 * toleranciaPara() acaba de cerrar.
 */
export function coincide(token, sinonimos) {
  for (const s of sinonimos) {
    if (coincideEstricto(token, s)) return true
    if (s.length >= 6 && token.length >= 6) {
      if (token.startsWith(s.slice(0, 6)) || s.startsWith(token.slice(0, 6))) return true
    }
  }
  return false
}

/**
 * Igual que coincide() pero SIN la regla de prefijo: solo igualdad o distancia
 * dentro de la tolerancia.
 *
 * Las dos versiones existen porque el prefijo sirve para RECONOCER un objeto y
 * estorba para DESCARTAR por verbo. En español el sustantivo y el verbo de una
 * misma raíz comparten los primeros seis caracteres casi siempre, así que con
 * la regla de prefijo "mis reportes de daño" caía en el descarte de "reportar"
 * y "mis requerimientos rechazados" en el de "rechazar" — las dos consultas
 * legítimas terminaban en el modelo. Los catálogos de objetos usan coincide()
 * (quieren cubrir "requerimien…" cortado); los de descarte usan este, que solo
 * dispara con el verbo de verdad.
 */
export function coincideEstricto(token, sinonimo) {
  if (token === sinonimo) return true
  const tol = toleranciaPara(sinonimo)
  return tol > 0 && distancia(token, sinonimo, tol) <= tol
}

/**
 * ¿Alguno de los tokens de la frase coincide con alguno de los sinónimos?
 * Devuelve el token que coincidió (útil para depurar por qué disparó una
 * intención) o null si ninguno.
 */
export function buscarToken(tokens, sinonimos) {
  for (const t of tokens) {
    if (coincide(t, sinonimos)) return t
  }
  return null
}

/** buscarToken() con la comparación estricta — para las listas de descarte. */
export function buscarTokenEstricto(tokens, sinonimos) {
  for (const t of tokens) {
    for (const s of sinonimos) {
      if (coincideEstricto(t, s)) return t
    }
  }
  return null
}
