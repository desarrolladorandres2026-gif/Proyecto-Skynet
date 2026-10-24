// Búsqueda tolerante sobre el catálogo de artículos. Pura (sin Mongo) para que
// se pruebe sola: el catálogo ronda los ~600 artículos, así que se puntúa en
// memoria en vez de depender de un índice de texto que no entiende "escobas"
// vs "ESCOBA" ni errores de tipeo.

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'y', 'o', 'x', 'un', 'una', 'por', 'en', 'unidad', 'unidades', 'und'])

export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Singular tosco: "escobas" → "escoba", "limpidos" → "limpido". Solo si queda
// una raíz de 3+ letras, para no estropear "gas", "mas" o números.
function singular(token) {
  if (token.length > 4 && token.endsWith('es') && /[^aeiou]es$/.test(token)) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1)
  return token
}

export function tokens(texto) {
  return normalizar(texto)
    .split(' ')
    .filter((t) => t && !PALABRAS_VACIAS.has(t))
    .map(singular)
}

function distancia(a, b, tope) {
  if (Math.abs(a.length - b.length) > tope) return tope + 1
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const actual = [i]
    for (let j = 1; j <= b.length; j += 1) {
      actual[j] = Math.min(anterior[j] + 1, actual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    anterior = actual
  }
  return anterior[b.length]
}

// 1 = igual, 0.9 = prefijo (mínimo 3 letras), 0.7 = errata, 0 = no coincide.
function similitudToken(consulta, candidato) {
  if (consulta === candidato) return 1
  if (consulta.length >= 3 && candidato.length >= 3 && (candidato.startsWith(consulta) || consulta.startsWith(candidato))) return 0.9
  if (/^\d+$/.test(consulta) || /^\d+$/.test(candidato)) return 0
  const tope = consulta.length >= 7 ? 2 : consulta.length >= 4 ? 1 : 0
  return tope && distancia(consulta, candidato, tope) <= tope ? 0.7 : 0
}

function puntuarTexto(tokensConsulta, texto) {
  const tokensTexto = tokens(texto)
  if (tokensConsulta.length === 0 || tokensTexto.length === 0) return 0
  let suma = 0
  const usados = new Set()
  for (const q of tokensConsulta) {
    let mejor = 0
    let mejorIdx = -1
    tokensTexto.forEach((t, idx) => {
      const s = similitudToken(q, t)
      if (s > mejor) { mejor = s; mejorIdx = idx }
    })
    suma += mejor
    if (mejorIdx >= 0) usados.add(mejorIdx)
  }
  const coberturaConsulta = suma / tokensConsulta.length
  const coberturaTexto = usados.size / tokensTexto.length
  // Pesa más lo que el usuario escribió, pero lo que sobra del lado del
  // artículo desempata ("escoba" antes que "ESCOBA CERDA DURA") y lo que sobra
  // del lado del usuario ("escobas grandes") no hunde la coincidencia.
  return coberturaConsulta * 0.75 + coberturaTexto * 0.25
}

export function puntuar(consulta, articulo) {
  const tokensConsulta = tokens(consulta)
  let mejor = puntuarTexto(tokensConsulta, articulo.nombre)
  for (const alias of articulo.alias || []) mejor = Math.max(mejor, puntuarTexto(tokensConsulta, alias))
  return mejor
}

export function buscar(consulta, articulos, { limite = 8, minimo = 0.55 } = {}) {
  if (!normalizar(consulta)) return []
  return articulos
    .map((articulo) => ({ articulo, score: puntuar(consulta, articulo) }))
    .filter((r) => r.score >= minimo)
    .sort((a, b) => b.score - a.score || a.articulo.nombre.localeCompare(b.articulo.nombre))
    .slice(0, limite)
}

// Coincidencia EXACTA (nombre o alias ya normalizados): la única que se vincula
// sola al crear. Todo lo difuso se sugiere, nunca se asume.
export function coincidenciaExacta(texto, articulos) {
  const clave = normalizar(texto)
  if (!clave) return null
  // El nombre manda sobre cualquier alias: si dos artículos compartieran un
  // alias, el que se llama así de verdad no puede perder contra el otro.
  return (
    articulos.find((a) => a.nombreNormalizado === clave) ||
    articulos.find((a) => (a.aliasNormalizados || []).includes(clave)) ||
    null
  )
}
