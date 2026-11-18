import { jsPDF } from 'jspdf'

// Convierte fotos de un papel (tomadas con el celular o elegidas de la
// galería) en páginas "tipo escáner" y las junta en un único PDF.
//
// Qué hace por cada foto, todo en el dispositivo (nada sale a terceros: un
// certificado médico es dato de salud):
//   1. Respeta la orientación EXIF y la reduce a un tamaño razonable.
//   2. Busca las cuatro esquinas del papel y lo endereza: corrige la
//      inclinación y la perspectiva de una foto tomada en ángulo, y deja la
//      hoja recta, completa y sin fondo. Si no está seguro de dónde están las
//      esquinas, cae a un recorte rectangular prudente, o no toca nada.
//   3. Aplana la iluminación: quita sombras y degradados que deja el flash o
//      la mano al tomar la foto, y deja el papel blanco y el texto oscuro.
//   4. Lo guarda como JPEG y arma el PDF A4 (una hoja por foto, centrada y con
//      margen).
//
// Lo que NO hace: detectar si la foto salió movida. Por eso el componente
// deja girar, quitar y reordenar páginas y ver cada una en grande.
//
// La parte de píxeles (procesarPixeles, detectarDocumento, corregirPerspectiva,
// calcularRecorte) trabaja sobre un objeto tipo ImageData y no toca el DOM,
// para poder probarla sin navegador.

export const MODOS_ESCANER = [
  { value: 'documento', label: 'Documento' },
  { value: 'color', label: 'Color' },
  { value: 'original', label: 'Original' },
]

// ~190 ppp en una hoja A4: se lee bien el texto chico de una incapacidad sin
// que 5-6 páginas pesen más de un par de MB.
export const LADO_MAXIMO_PX = 2200
const CALIDAD_JPEG = 0.85
// Debajo de esto el texto de un papel completo ya no se distingue bien.
export const LADO_MINIMO_LEGIBLE_PX = 1000
// Tope del backend (ausencias.upload.js: 15 MB) con un poco de margen.
export const MAX_BYTES_SOPORTE = 14 * 1024 * 1024
export const MAX_PAGINAS = 12

// Tamaño de la rejilla con la que se estima la iluminación de fondo (px).
const CELDA = 8
// Radio, en celdas, de la ventana que busca "papel" alrededor de cada punto.
// Tiene que ser mayor que un trazo grueso de letra para que el texto no
// contamine el estimado del fondo.
const RADIO_FONDO = 4

function aGrises(rgba, n) {
  const gris = new Float32Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    gris[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
  }
  return gris
}

// Promedio de cada bloque de `celda` x `celda` píxeles.
function mediasPorCelda(gris, ancho, alto, celda) {
  const cw = Math.ceil(ancho / celda)
  const ch = Math.ceil(alto / celda)
  const suma = new Float32Array(cw * ch)
  const cuenta = new Uint32Array(cw * ch)
  for (let y = 0; y < alto; y++) {
    const fila = Math.floor(y / celda) * cw
    for (let x = 0; x < ancho; x++) {
      const i = fila + Math.floor(x / celda)
      suma[i] += gris[y * ancho + x]
      cuenta[i]++
    }
  }
  for (let i = 0; i < suma.length; i++) suma[i] /= cuenta[i] || 1
  return { medias: suma, cw, ch }
}

// Máximo móvil separable (dilatación): cada celda toma el valor más claro de
// su vecindad. Es lo que "borra" las letras del estimado del papel.
function dilatar(valores, cw, ch, radio) {
  const tmp = new Float32Array(valores.length)
  const out = new Float32Array(valores.length)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let m = 0
      for (let k = Math.max(0, x - radio); k <= Math.min(cw - 1, x + radio); k++) m = Math.max(m, valores[y * cw + k])
      tmp[y * cw + x] = m
    }
  }
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let m = 0
      for (let k = Math.max(0, y - radio); k <= Math.min(ch - 1, y + radio); k++) m = Math.max(m, tmp[k * cw + x])
      out[y * cw + x] = m
    }
  }
  return out
}

// Promedio móvil separable, para suavizar el escalonado que deja la dilatación.
function suavizar(valores, cw, ch, radio) {
  const tmp = new Float32Array(valores.length)
  const out = new Float32Array(valores.length)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let s = 0
      let n = 0
      for (let k = Math.max(0, x - radio); k <= Math.min(cw - 1, x + radio); k++) { s += valores[y * cw + k]; n++ }
      tmp[y * cw + x] = s / n
    }
  }
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let s = 0
      let n = 0
      for (let k = Math.max(0, y - radio); k <= Math.min(ch - 1, y + radio); k++) { s += tmp[k * cw + x]; n++ }
      out[y * cw + x] = s / n
    }
  }
  return out
}

// Brillo "del papel" en cada punto de la foto, sin el texto. Devuelve una
// rejilla chica; fondoEn() la interpola.
function estimarFondo(gris, ancho, alto) {
  const { medias, cw, ch } = mediasPorCelda(gris, ancho, alto, CELDA)
  const fondo = suavizar(dilatar(medias, cw, ch, RADIO_FONDO), cw, ch, 1)
  return { fondo, cw, ch }
}

function fondoEn({ fondo, cw, ch }, x, y) {
  const fx = Math.min(Math.max((x + 0.5) / CELDA - 0.5, 0), cw - 1)
  const fy = Math.min(Math.max((y + 0.5) / CELDA - 0.5, 0), ch - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, cw - 1)
  const y1 = Math.min(y0 + 1, ch - 1)
  const tx = fx - x0
  const ty = fy - y0
  const a = fondo[y0 * cw + x0] * (1 - tx) + fondo[y0 * cw + x1] * tx
  const b = fondo[y1 * cw + x0] * (1 - tx) + fondo[y1 * cw + x1] * tx
  return a * (1 - ty) + b * ty
}

function percentil(histograma, total, fraccion) {
  const objetivo = total * fraccion
  let acumulado = 0
  for (let v = 0; v < 256; v++) {
    acumulado += histograma[v]
    if (acumulado >= objetivo) return v
  }
  return 255
}

// Punto desde el cual un gris cuenta como "papel": todo lo que quede por
// encima se pinta blanco puro (se va el ruido y la sombra tenue).
const PUNTO_BLANCO = 225

// Aplica el efecto escáner sobre `imagen` ({ data: RGBA, width, height }),
// modificándola en el lugar.
//   documento → escala de grises, papel blanco, texto oscuro y nítido.
//   color     → igual de limpio pero conservando el color (sellos, logos).
//   original  → no toca nada.
export function procesarPixeles(imagen, modo = 'documento') {
  if (modo === 'original') return imagen
  const { data, width, height } = imagen
  const n = width * height
  const gris = aGrises(data, n)
  const rejilla = estimarFondo(gris, width, height)

  // Ganancia que lleva el brillo local del papel a 255. El piso evita
  // multiplicar por mucho una zona que en realidad es oscura (no papel).
  const ganancia = new Float32Array(n)
  const histograma = new Uint32Array(256)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const g = 255 / Math.max(fondoEn(rejilla, x, y), 60)
      ganancia[i] = g
      histograma[Math.min(255, Math.round(gris[i] * g))]++
    }
  }

  // Punto negro: el 1 % más oscuro. Tope para que una hoja casi vacía no
  // estire el ruido hasta negro.
  const negro = Math.min(percentil(histograma, n, 0.01), modo === 'color' ? 60 : 90)
  const rango = PUNTO_BLANCO - negro

  const curva = (valor) => {
    const m = Math.min(1, Math.max(0, (valor - negro) / rango))
    // Mezcla de lineal y "smoothstep": oscurece el texto y blanquea el
    // papel sin dejar bordes duros que se vean como pixelado.
    return 255 * (0.5 * m + 0.5 * m * m * (3 - 2 * m))
  }

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (modo === 'documento') {
      const v = curva(gris[i] * ganancia[i])
      data[p] = v
      data[p + 1] = v
      data[p + 2] = v
    } else {
      data[p] = curva(data[p] * ganancia[i])
      data[p + 1] = curva(data[p + 1] * ganancia[i])
      data[p + 2] = curva(data[p + 2] * ganancia[i])
    }
  }
  return imagen
}

// Umbral de Otsu sobre un arreglo de grises (0-255). Devuelve también cuánto
// se separan las dos clases, para descartar fotos sin fondo distinguible.
function umbralOtsu(valores) {
  const hist = new Uint32Array(256)
  for (const v of valores) hist[Math.min(255, Math.max(0, Math.round(v)))]++
  const total = valores.length
  let sumaTotal = 0
  for (let v = 0; v < 256; v++) sumaTotal += v * hist[v]
  let sumaB = 0
  let pesoB = 0
  let mejor = 0
  let umbral = 128
  let mediaB = 0
  let mediaF = 0
  for (let v = 0; v < 256; v++) {
    pesoB += hist[v]
    if (pesoB === 0) continue
    const pesoF = total - pesoB
    if (pesoF === 0) break
    sumaB += v * hist[v]
    const mb = sumaB / pesoB
    const mf = (sumaTotal - sumaB) / pesoF
    const entreClases = pesoB * pesoF * (mb - mf) * (mb - mf)
    if (entreClases > mejor) {
      mejor = entreClases
      umbral = v
      mediaB = mb
      mediaF = mf
    }
  }
  return { umbral, separacion: mediaF - mediaB }
}

// Busca el papel (la zona clara) y devuelve su rectángulo { x, y, ancho, alto }
// en píxeles, o null si no hay nada que recortar o no se puede estar seguro.
// Prefiere no recortar a recortar de más: un trozo de documento cortado es
// peor que un borde de mesa de sobra.
export function calcularRecorte(imagen) {
  const { data, width, height } = imagen
  const celda = Math.max(1, Math.ceil(Math.max(width, height) / 160))
  const gris = aGrises(data, width * height)
  const { medias, cw, ch } = mediasPorCelda(gris, width, height, celda)

  const { umbral, separacion } = umbralOtsu(medias)
  // Sin contraste claro entre papel y fondo no hay borde confiable.
  if (separacion < 35) return null

  const filas = new Float32Array(ch)
  const columnas = new Float32Array(cw)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (medias[y * cw + x] > umbral) {
        filas[y]++
        columnas[x]++
      }
    }
  }
  const MINIMO = 0.4
  const primero = (arr, total) => arr.findIndex((v) => v / total >= MINIMO)
  const ultimo = (arr, total) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] / total >= MINIMO) return i
    return -1
  }
  let arriba = primero(filas, cw)
  let abajo = ultimo(filas, cw)
  let izquierda = primero(columnas, ch)
  let derecha = ultimo(columnas, ch)
  if (arriba < 0 || abajo < 0 || izquierda < 0 || derecha < 0) return null

  // Una sombra o un degradado de luz también parte la foto en "claro" y
  // "oscuro", pero cambia poco a poco; el borde real de un papel es un
  // escalón. Por eso solo se corta un lado si ahí hay un salto brusco de
  // brillo entre lo de afuera y lo de adentro. Si no, ese lado se deja
  // completo (mejor un borde de más que comerse parte del documento).
  const ESCALON = 35
  const brilloFila = (f) => {
    let s = 0
    for (let x = izquierda; x <= derecha; x++) s += medias[Math.min(ch - 1, Math.max(0, f)) * cw + x]
    return s / (derecha - izquierda + 1)
  }
  const brilloColumna = (c) => {
    let s = 0
    for (let y = arriba; y <= abajo; y++) s += medias[y * cw + Math.min(cw - 1, Math.max(0, c))]
    return s / (abajo - arriba + 1)
  }
  if (arriba > 0 && brilloFila(arriba + 1) - brilloFila(arriba - 2) < ESCALON) arriba = 0
  if (abajo < ch - 1 && brilloFila(abajo - 1) - brilloFila(abajo + 2) < ESCALON) abajo = ch - 1
  if (izquierda > 0 && brilloColumna(izquierda + 1) - brilloColumna(izquierda - 2) < ESCALON) izquierda = 0
  if (derecha < cw - 1 && brilloColumna(derecha - 1) - brilloColumna(derecha + 2) < ESCALON) derecha = cw - 1

  // Un celda de holgura para no morder el borde del papel.
  arriba = Math.max(0, arriba - 1)
  izquierda = Math.max(0, izquierda - 1)
  abajo = Math.min(ch - 1, abajo + 1)
  derecha = Math.min(cw - 1, derecha + 1)

  const x = izquierda * celda
  const y = arriba * celda
  const ancho = Math.min(width, (derecha + 1) * celda) - x
  const alto = Math.min(height, (abajo + 1) * celda) - y

  const fraccion = (ancho * alto) / (width * height)
  // Si el "papel" es una parte mínima de la foto, la detección no es fiable.
  if (fraccion < 0.3) return null
  // Si ya ocupa casi todo, recortar no aporta.
  if (fraccion > 0.93) return null
  return { x, y, ancho, alto }
}

// ───────────────────────── Detección de las 4 esquinas ─────────────────────

// Componente conexo (4 vecinos) más grande de una máscara, con sus cuatro
// esquinas: los puntos más extremos en las diagonales. Sirve para un papel
// inclinado hasta ~45°, que es lo normal en una foto hecha a mano.
function esquinasDelMayorComponente(mascara, cw, ch) {
  const visitado = new Uint8Array(cw * ch)
  const cola = new Int32Array(cw * ch)
  let mejor = null

  for (let inicio = 0; inicio < mascara.length; inicio++) {
    if (!mascara[inicio] || visitado[inicio]) continue
    let cabeza = 0
    let fin = 0
    cola[fin++] = inicio
    visitado[inicio] = 1
    // Mínimo/máximo de cada forma lineal, con la esquina de celda que toca.
    let sumaMin = Infinity; let sumaMax = -Infinity; let difMin = Infinity; let difMax = -Infinity
    let tl = null; let br = null; let tr = null; let bl = null
    while (cabeza < fin) {
      const i = cola[cabeza++]
      const x = i % cw
      const y = (i - x) / cw
      // TL = menor x+y ; BR = mayor x+y ; TR = mayor x−y ; BL = menor x−y,
      // usando la esquina de la celda que más se acerca a cada extremo.
      if (x + y < sumaMin) { sumaMin = x + y; tl = { x, y } }
      if (x + y + 2 > sumaMax) { sumaMax = x + y + 2; br = { x: x + 1, y: y + 1 } }
      if (x + 1 - y > difMax) { difMax = x + 1 - y; tr = { x: x + 1, y } }
      if (x - (y + 1) < difMin) { difMin = x - (y + 1); bl = { x, y: y + 1 } }
      if (x > 0 && mascara[i - 1] && !visitado[i - 1]) { visitado[i - 1] = 1; cola[fin++] = i - 1 }
      if (x < cw - 1 && mascara[i + 1] && !visitado[i + 1]) { visitado[i + 1] = 1; cola[fin++] = i + 1 }
      if (y > 0 && mascara[i - cw] && !visitado[i - cw]) { visitado[i - cw] = 1; cola[fin++] = i - cw }
      if (y < ch - 1 && mascara[i + cw] && !visitado[i + cw]) { visitado[i + cw] = 1; cola[fin++] = i + cw }
    }
    if (!mejor || fin > mejor.celdas) mejor = { celdas: fin, esquinas: [tl, tr, br, bl] }
  }
  return mejor
}

const productoCruz = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
const distancia = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

function areaCuadrilatero([a, b, c, d]) {
  return Math.abs((a.x * b.y - b.x * a.y) + (b.x * c.y - c.x * b.y) + (c.x * d.y - d.x * c.y) + (d.x * a.y - a.x * d.y)) / 2
}

// ¿Tiene forma de hoja vista en perspectiva? Convexo, ángulos razonables y
// lados opuestos de largo parecido.
function formaPlausible(q, cw, ch) {
  const signos = [0, 1, 2, 3].map((i) => Math.sign(productoCruz(q[i], q[(i + 1) % 4], q[(i + 2) % 4])))
  if (signos.some((s) => s === 0 || s !== signos[0])) return false
  const lado = [0, 1, 2, 3].map((i) => distancia(q[i], q[(i + 1) % 4]))
  if (Math.min(...lado) < Math.max(cw, ch) * 0.15) return false
  if (Math.max(lado[0], lado[2]) / Math.min(lado[0], lado[2]) > 1.8) return false
  if (Math.max(lado[1], lado[3]) / Math.min(lado[1], lado[3]) > 1.8) return false
  for (let i = 0; i < 4; i++) {
    const p = q[(i + 3) % 4]; const c = q[i]; const n = q[(i + 1) % 4]
    const cos = ((p.x - c.x) * (n.x - c.x) + (p.y - c.y) * (n.y - c.y)) / (distancia(p, c) * distancia(c, n))
    if (cos > 0.64 || cos < -0.64) return false // ángulo fuera de ~50°-130°
  }
  return true
}

// Un borde de papel es un escalón de brillo: adentro claro, afuera más
// oscuro. Una sombra o un degradado no lo son. Se mide a lo largo de cada
// lado; los tramos que salen del encuadre cuentan como correctos (el papel
// llega hasta el borde de la foto ahí).
function bordesConfirmados(q, medias, cw, ch) {
  const ESCALON = 30
  const brillo = (x, y) => {
    const ix = Math.floor(x); const iy = Math.floor(y)
    return ix < 0 || iy < 0 || ix >= cw || iy >= ch ? null : medias[iy * cw + ix]
  }
  const centro = { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 }
  for (let i = 0; i < 4; i++) {
    const a = q[i]; const b = q[(i + 1) % 4]
    const largo = distancia(a, b)
    let nx = -(b.y - a.y) / largo; let ny = (b.x - a.x) / largo
    // Que la normal apunte hacia adentro.
    if ((centro.x - a.x) * nx + (centro.y - a.y) * ny < 0) { nx = -nx; ny = -ny }
    const MUESTRAS = 24
    let buenas = 0
    for (let k = 1; k <= MUESTRAS; k++) {
      const t = 0.08 + (0.84 * k) / MUESTRAS
      const px = a.x + (b.x - a.x) * t
      const py = a.y + (b.y - a.y) * t
      const dentro = brillo(px + nx * 2.5, py + ny * 2.5)
      const fuera = brillo(px - nx * 2.5, py - ny * 2.5)
      if (dentro === null || fuera === null || dentro - fuera >= ESCALON) buenas++
    }
    if (buenas / MUESTRAS < 0.6) return false
  }
  return true
}

// ── Detección por bordes rectos ────────────────────────────────────────────
//
// El método de "la zona clara más grande" falla cuando la mesa también es
// clara (papel sobre un escritorio blanco): papel y mesa quedan fundidos en
// una sola mancha. Aquí se buscan en cambio los CUATRO BORDES del papel como
// rectas, que es lo que de verdad distingue una hoja:
//   1. Se detectan los píxeles de borde y la dirección hacia donde aclara.
//   2. Cada píxel vota por la recta a la que pertenece (Hough con dirección):
//      "arriba" es una recta que aclara hacia abajo, "izquierda" hacia la
//      derecha, etc. Así un borde de papel no se confunde con uno opuesto.
//   3. Se combinan rectas (una por lado) en cuadriláteros y se puntúa cada uno.
// Un borde de papel es un ESCALÓN: claro adentro, más oscuro afuera. Una línea
// de texto o el filete del pie de página es una CRESTA: oscura y delgada, con
// papel claro a ambos lados. Medir el brillo a unos píxeles de la recta,
// adentro y afuera, es lo que las separa.

const LADO_DETECCION = 480
const FAMILIAS = [
  { lado: 'arriba', grados: 90 }, // aclara hacia abajo (hacia adentro del papel)
  { lado: 'derecha', grados: 180 },
  { lado: 'abajo', grados: -90 },
  { lado: 'izquierda', grados: 0 },
]
const VENTANA_ANGULO = 35
const PICOS_POR_LADO = 8

const aRad = (g) => (g * Math.PI) / 180
const difAngulo = (a, b) => Math.abs(((a - b + 540) % 360) - 180)

// Gradiente de Sobel sobre una rejilla de grises ya suavizada.
function bordesDeRejilla(g, cw, ch) {
  const puntos = []
  const mags = new Float32Array(cw * ch)
  const gxs = new Float32Array(cw * ch)
  const gys = new Float32Array(cw * ch)
  const hist = new Uint32Array(128)
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x
      const gx = (g[i - cw + 1] + 2 * g[i + 1] + g[i + cw + 1] - g[i - cw - 1] - 2 * g[i - 1] - g[i + cw - 1]) / 8
      const gy = (g[i + cw - 1] + 2 * g[i + cw] + g[i + cw + 1] - g[i - cw - 1] - 2 * g[i - cw] - g[i - cw + 1]) / 8
      const m = Math.hypot(gx, gy)
      mags[i] = m; gxs[i] = gx; gys[i] = gy
      hist[Math.min(127, Math.floor(m))]++
    }
  }
  // Umbral: el 12 % de píxeles con más gradiente, sin bajar de un mínimo que
  // evite tomar ruido de sensor como borde en una foto sin contraste.
  const total = (cw - 2) * (ch - 2)
  let acum = 0
  let corte = 127
  for (let v = 0; v < 128; v++) { acum += hist[v]; if (acum >= total * 0.88) { corte = v; break } }
  const umbral = Math.max(corte, 3)
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x
      if (mags[i] >= umbral) puntos.push({ x, y, ang: (Math.atan2(gys[i], gxs[i]) * 180) / Math.PI })
    }
  }
  return puntos
}

// Rectas candidatas de una familia (un lado del papel). Cada una es
// { nx, ny, rho, dx, dy, proy } con la normal apuntando hacia adentro del
// papel, y `proy` las proyecciones ordenadas de los píxeles que la respaldan.
function rectasDeFamilia(puntos, familia, cw, ch) {
  const diag = Math.ceil(Math.hypot(cw, ch))
  const nRho = 2 * diag + 1
  const acc = new Float32Array(360 * nRho)
  const bin = (g) => ((Math.round(g) % 360) + 360) % 360
  for (const p of puntos) {
    if (difAngulo(p.ang, familia.grados) > VENTANA_ANGULO) continue
    // Cada píxel vota por su ángulo medido y por los vecinos (±2°), cada uno
    // con su propio ρ: así una recta ligeramente inclinada junta sus votos.
    for (let da = -2; da <= 2; da++) {
      const radA = aRad(p.ang + da)
      const rA = Math.round(p.x * Math.cos(radA) + p.y * Math.sin(radA)) + diag
      if (rA >= 1 && rA < nRho - 1) {
        const a = bin(p.ang + da)
        acc[a * nRho + rA] += 1
        acc[a * nRho + rA - 1] += 0.5
        acc[a * nRho + rA + 1] += 0.5
      }
    }
  }
  // Picos, con supresión de vecinos.
  const candidatos = []
  for (let g = -VENTANA_ANGULO; g <= VENTANA_ANGULO; g++) {
    const a = bin(familia.grados + g)
    for (let r = 1; r < nRho - 1; r++) {
      const v = acc[a * nRho + r]
      if (v >= 12) candidatos.push({ ang: familia.grados + g, rho: r - diag, v })
    }
  }
  candidatos.sort((a, b) => b.v - a.v)
  const elegidos = []
  for (const c of candidatos) {
    if (elegidos.length >= PICOS_POR_LADO) break
    if (elegidos.some((e) => Math.abs(e.rho - c.rho) < 10 && difAngulo(e.ang, c.ang) < 10)) continue
    elegidos.push(c)
  }

  // Cada pico se afina ajustando una recta por mínimos cuadrados a los
  // píxeles que realmente lo respaldan (el voto de Hough es solo aproximado).
  const rectas = []
  for (const c of elegidos) {
    const rad = aRad(c.ang)
    let nx = Math.cos(rad)
    let ny = Math.sin(rad)
    let rho = c.rho
    let banda = 5
    let ultimos = null
    // El pico de Hough puede venir ~1° torcido, lo que en un borde largo deja
    // los extremos fuera de una banda estrecha. Se ajusta varias veces:
    // banda ancha al principio, cada vez más angosta y centrada en la recta
    // recién ajustada.
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      const angActual = (Math.atan2(ny, nx) * 180) / Math.PI
      const cerca = puntos.filter((p) => difAngulo(p.ang, angActual) <= 22 && Math.abs(p.x * nx + p.y * ny - rho) <= banda)
      if (cerca.length < 12) { ultimos = null; break }
      let mx = 0; let my = 0
      for (const p of cerca) { mx += p.x; my += p.y }
      mx /= cerca.length; my /= cerca.length
      let sxx = 0; let sxy = 0; let syy = 0
      for (const p of cerca) { const ex = p.x - mx; const ey = p.y - my; sxx += ex * ex; sxy += ex * ey; syy += ey * ey }
      // Dirección principal de la recta → su normal es la perpendicular.
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy)
      let ax = -Math.sin(th); let ay = Math.cos(th)
      if (ax * nx + ay * ny < 0) { ax = -ax; ay = -ay }
      nx = ax; ny = ay
      rho = nx * mx + ny * my
      banda = Math.max(2.5, banda - 0.75)
      ultimos = cerca
    }
    if (!ultimos) continue
    const dx = -ny; const dy = nx
    const angFinal = (Math.atan2(ny, nx) * 180) / Math.PI
    const proy = Float32Array.from(
      puntos.filter((p) => difAngulo(p.ang, angFinal) <= 25 && Math.abs(p.x * nx + p.y * ny - rho) <= 3)
        .map((p) => p.x * dx + p.y * dy),
    ).sort()
    rectas.push({ nx, ny, rho, dx, dy, proy, votos: c.v })
  }
  return rectas
}

function intersectar(r1, r2) {
  const det = r1.nx * r2.ny - r1.ny * r2.nx
  if (Math.abs(det) < 0.3) return null // casi paralelas
  return {
    x: (r1.rho * r2.ny - r1.ny * r2.rho) / det,
    y: (r1.nx * r2.rho - r1.rho * r2.nx) / det,
  }
}

function contarEnTramo(proy, desde, hasta) {
  const lo = Math.min(desde, hasta)
  const hi = Math.max(desde, hasta)
  const primero = (v) => { let a = 0; let b = proy.length; while (a < b) { const m = (a + b) >> 1; if (proy[m] < v) a = m + 1; else b = m } return a }
  return primero(hi) - primero(lo)
}

// ¿Es este lado un escalón de brillo (papel adentro, algo más oscuro afuera) y
// no una cresta como un filete o un renglón? Devuelve la fracción de muestras
// que cumplen y el escalón mediano.
function evaluarEscalon(a, b, recta, g, cw, ch) {
  const BANDAS = [5, 8, 11, 14]
  const MUESTRAS = 32
  const val = (x, y) => {
    const ix = Math.round(x); const iy = Math.round(y)
    return ix < 0 || iy < 0 || ix >= cw || iy >= ch ? null : g[iy * cw + ix]
  }
  const pasos = []
  let buenas = 0
  for (let k = 0; k < MUESTRAS; k++) {
    const t = 0.06 + (0.88 * k) / (MUESTRAS - 1)
    const px = a.x + (b.x - a.x) * t
    const py = a.y + (b.y - a.y) * t
    let dentro = 0; let nDentro = 0; let fuera = 0; let nFuera = 0
    for (const d of BANDAS) {
      const vi = val(px + recta.nx * d, py + recta.ny * d)
      const vo = val(px - recta.nx * d, py - recta.ny * d)
      if (vi !== null) { dentro += vi; nDentro++ }
      if (vo !== null) { fuera += vo; nFuera++ }
    }
    if (nDentro === 0) continue
    // Afuera del encuadre: no hay nada oscuro que compare, no cuenta a favor.
    if (nFuera === 0) continue
    const paso = dentro / nDentro - fuera / nFuera
    pasos.push(paso)
    if (paso >= 6) buenas++
  }
  if (pasos.length < MUESTRAS * 0.5) return { fraccion: 0, mediana: 0 }
  pasos.sort((x, y) => x - y)
  return { fraccion: buenas / MUESTRAS, mediana: pasos[pasos.length >> 1] }
}

function detectarPorBordes(imagen) {
  const { data, width, height } = imagen
  const celda = Math.max(1, Math.ceil(Math.max(width, height) / LADO_DETECCION))
  const gris = aGrises(data, width * height)
  const { medias, cw, ch } = mediasPorCelda(gris, width, height, celda)
  const liso = suavizar(suavizar(medias, cw, ch, 1), cw, ch, 1)

  const puntos = bordesDeRejilla(liso, cw, ch)
  if (puntos.length < 200) return null
  const [arriba, derecha, abajo, izquierda] = FAMILIAS.map((f) => rectasDeFamilia(puntos, f, cw, ch))
  if (!arriba.length || !derecha.length || !abajo.length || !izquierda.length) return null

  const holgura = 0.03
  const dentroDeMarco = (p) => p.x > -cw * holgura && p.x < cw * (1 + holgura) && p.y > -ch * holgura && p.y < ch * (1 + holgura)

  let mejor = null
  for (const rt of arriba) for (const rr of derecha) for (const rb of abajo) for (const rl of izquierda) {
    const tl = intersectar(rt, rl); const tr = intersectar(rt, rr)
    const br = intersectar(rb, rr); const bl = intersectar(rb, rl)
    if (!tl || !tr || !br || !bl) continue
    const q = [tl, tr, br, bl]
    if (!q.every(dentroDeMarco)) continue
    const fraccion = areaCuadrilatero(q) / (cw * ch)
    if (fraccion < 0.2) continue
    if (!formaPlausible(q, cw, ch)) continue

    const lados = [[tl, tr, rt], [tr, br, rr], [br, bl, rb], [bl, tl, rl]]
    let puntaje = 0
    let valido = true
    for (const [a, b, recta] of lados) {
      const { fraccion: pasa, mediana } = evaluarEscalon(a, b, recta, liso, cw, ch)
      const largo = distancia(a, b)
      const soporte = Math.min(1, contarEnTramo(recta.proy, a.x * recta.dx + a.y * recta.dy, b.x * recta.dx + b.y * recta.dy) / (largo * 1.2))
      if (pasa < 0.55 || mediana < 6 || soporte < 0.25) { valido = false; break }
      puntaje += 0.5 * Math.min(1, mediana / 30) + 0.25 * pasa + 0.25 * soporte
    }
    if (!valido) continue
    puntaje = (puntaje / 4) * (0.7 + 0.3 * Math.min(1, fraccion))
    if (!mejor || puntaje > mejor.puntaje) mejor = { q, puntaje, fraccion }
  }
  if (!mejor) return null
  return { q: mejor.q, celda, cw, ch, puntaje: mejor.puntaje }
}

// Esquinas del papel en píxeles ([arriba-izq, arriba-der, abajo-der,
// abajo-izq]) o null si no hay una hoja claramente distinguible del fondo, o si
// ya ocupa toda la foto y no hay nada que enderezar.
export function detectarDocumento(imagen) {
  const porBordes = detectarPorBordes(imagen)
  if (porBordes) return esquinasFinales(porBordes.q, porBordes.cw, porBordes.ch, porBordes.celda)
  return detectarPorZonaClara(imagen)
}

// Ajustes comunes al resultado de cualquier detector.
function esquinasFinales(q, cw, ch, celda) {
  // Papel de borde a borde y derecho: no hay nada que corregir.
  const esquinasFoto = [{ x: 0, y: 0 }, { x: cw, y: 0 }, { x: cw, y: ch }, { x: 0, y: ch }]
  const tolerancia = Math.max(cw, ch) * 0.02
  if (q.every((p, i) => distancia(p, esquinasFoto[i]) < tolerancia)) return null
  // Un poco hacia adentro (1,2 % hacia el centro) para no dejar una franja del
  // fondo en el borde del resultado.
  const centro = { x: q.reduce((s, p) => s + p.x, 0) / 4, y: q.reduce((s, p) => s + p.y, 0) / 4 }
  return q.map((p) => ({
    x: (p.x + (centro.x - p.x) * 0.012) * celda,
    y: (p.y + (centro.y - p.y) * 0.012) * celda,
  }))
}

// Detector anterior: zona clara más grande. Sigue siendo útil para un papel
// claro sobre una mesa oscura y uniforme.
function detectarPorZonaClara(imagen) {
  const { data, width, height } = imagen
  const celda = Math.max(1, Math.ceil(Math.max(width, height) / 480))
  const gris = aGrises(data, width * height)
  const { medias, cw, ch } = mediasPorCelda(gris, width, height, celda)

  const { umbral, separacion } = umbralOtsu(medias)
  if (separacion < 35) return null

  let mejor = null
  for (const factor of [1, 0.8, 1.2]) {
    const mascara = new Uint8Array(cw * ch)
    for (let i = 0; i < mascara.length; i++) mascara[i] = medias[i] > umbral * factor ? 1 : 0
    const componente = esquinasDelMayorComponente(mascara, cw, ch)
    if (!componente || componente.esquinas.some((e) => !e)) continue
    const q = componente.esquinas
    const fraccion = areaCuadrilatero(q) / (cw * ch)
    if (fraccion < 0.25) continue
    if (!formaPlausible(q, cw, ch)) continue
    if (!bordesConfirmados(q, medias, cw, ch)) continue
    if (!mejor || fraccion > mejor.fraccion) mejor = { q, fraccion }
  }
  if (!mejor) return null
  return esquinasFinales(mejor.q, cw, ch, celda)
}

// ───────────────────────── Enderezado (perspectiva) ────────────────────────

// Resuelve el sistema lineal A·x = b (Gauss con pivoteo parcial).
function resolverSistema(A, b) {
  const n = b.length
  for (let i = 0; i < n; i++) {
    let pivote = i
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[pivote][i])) pivote = r
    ;[A[i], A[pivote]] = [A[pivote], A[i]]
    ;[b[i], b[pivote]] = [b[pivote], b[i]]
    if (Math.abs(A[i][i]) < 1e-12) return null
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i]
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]
      b[r] -= f * b[i]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]
    x[i] = s / A[i][i]
  }
  return x
}

// Homografía que lleva un punto del rectángulo destino (u, v) a su punto en
// la foto (x, y): x = (h0u+h1v+h2)/(h6u+h7v+1), y = (h3u+h4v+h5)/(h6u+h7v+1).
function homografia(destino, origen) {
  const A = []
  const b = []
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = destino[i]
    const { x, y } = origen[i]
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x)
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y)
  }
  return resolverSistema(A, b)
}

// Recorta el papel que ocupa `esquinas` y lo deja recto, como rectángulo
// completo (interpolación bilineal). Devuelve un objeto tipo ImageData nuevo
// o null si la geometría es degenerada.
export function corregirPerspectiva(imagen, esquinas, ladoMaximo = LADO_MAXIMO_PX) {
  const [tl, tr, br, bl] = esquinas
  let ancho = Math.max(distancia(tl, tr), distancia(bl, br))
  let alto = Math.max(distancia(tl, bl), distancia(tr, br))
  if (!(ancho > 8 && alto > 8)) return null
  const reduccion = Math.min(1, ladoMaximo / Math.max(ancho, alto))
  ancho = Math.round(ancho * reduccion)
  alto = Math.round(alto * reduccion)

  const h = homografia([{ x: 0, y: 0 }, { x: ancho, y: 0 }, { x: ancho, y: alto }, { x: 0, y: alto }], esquinas)
  if (!h) return null

  const { data: origen, width: ow, height: oh } = imagen
  const salida = new Uint8ClampedArray(ancho * alto * 4)
  for (let v = 0; v < alto; v++) {
    for (let u = 0; u < ancho; u++) {
      const w = h[6] * (u + 0.5) + h[7] * (v + 0.5) + 1
      const sx = (h[0] * (u + 0.5) + h[1] * (v + 0.5) + h[2]) / w - 0.5
      const sy = (h[3] * (u + 0.5) + h[4] * (v + 0.5) + h[5]) / w - 0.5
      const x0 = Math.min(ow - 1, Math.max(0, Math.floor(sx)))
      const y0 = Math.min(oh - 1, Math.max(0, Math.floor(sy)))
      const x1 = Math.min(ow - 1, x0 + 1)
      const y1 = Math.min(oh - 1, y0 + 1)
      const fx = Math.min(1, Math.max(0, sx - x0))
      const fy = Math.min(1, Math.max(0, sy - y0))
      const p00 = (y0 * ow + x0) * 4
      const p10 = (y0 * ow + x1) * 4
      const p01 = (y1 * ow + x0) * 4
      const p11 = (y1 * ow + x1) * 4
      const q = (v * ancho + u) * 4
      for (let c = 0; c < 3; c++) {
        salida[q + c] =
          origen[p00 + c] * (1 - fx) * (1 - fy) + origen[p10 + c] * fx * (1 - fy) +
          origen[p01 + c] * (1 - fx) * fy + origen[p11 + c] * fx * fy
      }
      salida[q + 3] = 255
    }
  }
  return { data: salida, width: ancho, height: alto }
}

async function decodificar(archivo) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(archivo, { imageOrientation: 'from-image' })
    } catch {
      try {
        return await createImageBitmap(archivo)
      } catch { /* cae al <img> */ }
    }
  }
  const url = URL.createObjectURL(archivo)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

const aBlob = (canvas, tipo, calidad) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), tipo, calidad)
})

// Foto → página escaneada.
//   rotacion: 0 | 90 | 180 | 270 (grados, sentido horario)
//   recortar: ubica el papel, lo endereza y quita el fondo
// Devuelve { blob (JPEG), width, height, ladoOriginal } donde ladoOriginal es
// el lado más largo de la foto original, para avisar si es de baja resolución.
export async function escanearFoto(archivo, { modo = 'documento', rotacion = 0, recortar = true } = {}) {
  const fuente = await decodificar(archivo)
  const ladoOriginal = Math.max(fuente.width, fuente.height)
  const grados = ((rotacion % 360) + 360) % 360
  const girado = grados === 90 || grados === 270

  const escala = Math.min(1, LADO_MAXIMO_PX / ladoOriginal)
  const dw = Math.round(fuente.width * escala)
  const dh = Math.round(fuente.height * escala)
  const cw = girado ? dh : dw
  const ch = girado ? dw : dh

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, cw, ch)
  ctx.translate(cw / 2, ch / 2)
  ctx.rotate((grados * Math.PI) / 180)
  ctx.drawImage(fuente, -dw / 2, -dh / 2, dw, dh)
  fuente.close?.()
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  let imagen = ctx.getImageData(0, 0, cw, ch)
  if (recortar) {
    // 1º se intenta ubicar las 4 esquinas y enderezar; si no hay una hoja
    // clara, el recorte rectangular prudente; si tampoco, la foto completa.
    const esquinas = detectarDocumento(imagen)
    const recta = esquinas ? corregirPerspectiva(imagen, esquinas) : null
    if (recta) {
      imagen = recta
    } else {
      const region = calcularRecorte(imagen)
      if (region) imagen = ctx.getImageData(region.x, region.y, region.ancho, region.alto)
    }
  }
  procesarPixeles(imagen, modo)

  const salida = document.createElement('canvas')
  salida.width = imagen.width
  salida.height = imagen.height
  // corregirPerspectiva devuelve un objeto simple, no un ImageData real.
  const paraCanvas = imagen instanceof ImageData ? imagen : new ImageData(imagen.data, imagen.width, imagen.height)
  salida.getContext('2d').putImageData(paraCanvas, 0, 0)
  const blob = await aBlob(salida, 'image/jpeg', CALIDAD_JPEG)
  return { blob, width: imagen.width, height: imagen.height, ladoOriginal }
}

// Páginas ya escaneadas ({ blob, width, height }) → un PDF A4, una por hoja.
// Cada página toma la orientación de su foto (vertical u horizontal) y se
// ajusta al área útil sin deformarla.
export async function construirPdfSoporte(paginas, nombre = 'soporte.pdf') {
  if (!paginas.length) throw new Error('No hay páginas para armar el PDF')
  const MARGEN = 5
  const A4 = { corto: 210, largo: 297 }
  const horizontal = (p) => p.width > p.height

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: horizontal(paginas[0]) ? 'l' : 'p', compress: true })
  pdf.setProperties({ title: 'Soporte médico', creator: 'Skynet' })

  for (let i = 0; i < paginas.length; i++) {
    const pagina = paginas[i]
    const apaisada = horizontal(pagina)
    if (i > 0) pdf.addPage('a4', apaisada ? 'l' : 'p')
    const pw = apaisada ? A4.largo : A4.corto
    const ph = apaisada ? A4.corto : A4.largo
    const escala = Math.min((pw - MARGEN * 2) / pagina.width, (ph - MARGEN * 2) / pagina.height)
    const w = pagina.width * escala
    const h = pagina.height * escala
    const bytes = new Uint8Array(await pagina.blob.arrayBuffer())
    pdf.addImage(bytes, 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h, undefined, 'NONE')
  }

  const blob = pdf.output('blob')
  return new File([blob], nombre, { type: 'application/pdf', lastModified: Date.now() })
}
