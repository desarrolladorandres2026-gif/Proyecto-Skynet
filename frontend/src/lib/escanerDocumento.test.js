import { describe, it, expect } from 'vitest'
import { procesarPixeles, calcularRecorte, detectarDocumento, corregirPerspectiva } from './escanerDocumento.js'

function lienzo(ancho, alto, pintar) {
  const data = new Uint8ClampedArray(ancho * alto * 4)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const [r, g, b] = pintar(x, y)
      const p = (y * ancho + x) * 4
      data[p] = r
      data[p + 1] = g
      data[p + 2] = b
      data[p + 3] = 255
    }
  }
  return { data, width: ancho, height: alto }
}

const gris = (img, x, y) => img.data[(y * img.width + x) * 4]

// Papel con una sombra que va de oscuro (izquierda) a claro (derecha) y
// renglones de "texto" casi negro.
const esTexto = (x, y) => x > 40 && x < 360 && y % 30 >= 10 && y % 30 < 14
function fotoConSombra() {
  return lienzo(400, 300, (x, y) => {
    const papel = 120 + (x / 400) * 100
    const v = esTexto(x, y) ? 40 : papel
    return [v, v, v]
  })
}

describe('procesarPixeles', () => {
  it('modo documento: el papel queda blanco aunque haya sombra, y el texto queda oscuro', () => {
    const img = procesarPixeles(fotoConSombra(), 'documento')
    // y=2 no es renglón: papel puro, en la zona sombreada (x chico) y en la clara.
    expect(gris(img, 10, 2)).toBeGreaterThanOrEqual(250)
    expect(gris(img, 200, 2)).toBeGreaterThanOrEqual(250)
    expect(gris(img, 390, 2)).toBeGreaterThanOrEqual(250)
    // Renglón de texto, también a la sombra.
    expect(gris(img, 100, 11)).toBeLessThan(90)
    expect(gris(img, 300, 11)).toBeLessThan(90)
  })

  it('modo documento deja el resultado en escala de grises', () => {
    const img = procesarPixeles(lienzo(80, 80, (x) => [200, 150 + x, 100]), 'documento')
    const p = (40 * 80 + 40) * 4
    expect(img.data[p]).toBe(img.data[p + 1])
    expect(img.data[p + 1]).toBe(img.data[p + 2])
  })

  it('modo color conserva el matiz de lo que no es papel', () => {
    // Papel claro con un bloque azul (un sello).
    const img = procesarPixeles(
      lienzo(200, 200, (x, y) => (x > 80 && x < 120 && y > 80 && y < 120 ? [30, 60, 200] : [215, 215, 215])),
      'color',
    )
    const sello = (100 * 200 + 100) * 4
    expect(img.data[sello + 2]).toBeGreaterThan(img.data[sello] + 60)
    expect(gris(img, 5, 5)).toBeGreaterThanOrEqual(250)
  })

  it("modo original no modifica nada", () => {
    const antes = fotoConSombra()
    const copia = Uint8ClampedArray.from(antes.data)
    procesarPixeles(antes, 'original')
    expect(antes.data).toEqual(copia)
  })
})

describe('calcularRecorte', () => {
  it('recorta el fondo oscuro alrededor del papel', () => {
    const img = lienzo(400, 300, (x, y) => (x >= 80 && x < 320 && y >= 50 && y < 250 ? [205, 205, 205] : [30, 30, 30]))
    const r = calcularRecorte(img)
    expect(r).not.toBeNull()
    // Margen de tolerancia: una celda de la rejilla (3 px) más la holgura.
    expect(r.x).toBeGreaterThanOrEqual(70)
    expect(r.x).toBeLessThanOrEqual(80)
    expect(r.y).toBeGreaterThanOrEqual(40)
    expect(r.y).toBeLessThanOrEqual(50)
    expect(r.x + r.ancho).toBeGreaterThanOrEqual(320)
    expect(r.x + r.ancho).toBeLessThanOrEqual(332)
    expect(r.y + r.alto).toBeGreaterThanOrEqual(250)
    expect(r.y + r.alto).toBeLessThanOrEqual(262)
  })

  it('no recorta si la foto es papel de borde a borde', () => {
    expect(calcularRecorte(fotoConSombra())).toBeNull()
  })

  it('no recorta una imagen sin contraste entre papel y fondo', () => {
    expect(calcularRecorte(lienzo(300, 200, () => [128, 128, 128]))).toBeNull()
  })

  it('no recorta si lo claro es una parte mínima de la foto', () => {
    const img = lienzo(400, 300, (x, y) => (x < 60 && y < 40 ? [220, 220, 220] : [20, 20, 20]))
    expect(calcularRecorte(img)).toBeNull()
  })

  it('el texto del papel no se confunde con el fondo y no recorta de más', () => {
    // Papel con renglones, sobre fondo oscuro.
    const img = lienzo(400, 300, (x, y) => {
      if (x < 60 || x >= 340 || y < 30 || y >= 270) return [25, 25, 25]
      return esTexto(x, y) ? [50, 50, 50] : [210, 210, 210]
    })
    const r = calcularRecorte(img)
    expect(r).not.toBeNull()
    expect(r.x).toBeLessThanOrEqual(60)
    expect(r.x + r.ancho).toBeGreaterThanOrEqual(340)
    expect(r.y).toBeLessThanOrEqual(30)
    expect(r.y + r.alto).toBeGreaterThanOrEqual(270)
  })
})

// ── Esquinas y enderezado ─────────────────────────────────────────────────

const cruz = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
function dentroDe(q, p) {
  const s = [0, 1, 2, 3].map((i) => Math.sign(cruz(q[i], q[(i + 1) % 4], p)))
  return s.every((v) => v >= 0) || s.every((v) => v <= 0)
}
// Mesa oscura con una hoja (cuadrilátero q) y renglones de texto encima.
function hojaSobreMesa(ancho, alto, q) {
  return lienzo(ancho, alto, (x, y) => {
    if (!dentroDe(q, { x, y })) return [30, 30, 30]
    return (x + y) % 17 < 3 && y % 24 < 6 ? [60, 60, 60] : [210, 210, 210]
  })
}
const cercano = (p, e, tol) => Math.hypot(p.x - e.x, p.y - e.y) <= tol

describe('detectarDocumento', () => {
  it('encuentra las 4 esquinas de una hoja en perspectiva', () => {
    const q = [{ x: 120, y: 60 }, { x: 500, y: 90 }, { x: 470, y: 400 }, { x: 90, y: 380 }]
    const esquinas = detectarDocumento(hojaSobreMesa(600, 450, q))
    expect(esquinas).not.toBeNull()
    esquinas.forEach((p, i) => expect(cercano(p, q[i], 22)).toBe(true))
  })

  it('encuentra una hoja girada unos 25 grados', () => {
    const a = (25 * Math.PI) / 180
    const c = { x: 300, y: 225 }
    const girar = (p) => ({
      x: c.x + (p.x - c.x) * Math.cos(a) - (p.y - c.y) * Math.sin(a),
      y: c.y + (p.x - c.x) * Math.sin(a) + (p.y - c.y) * Math.cos(a),
    })
    const q = [{ x: 150, y: 70 }, { x: 450, y: 70 }, { x: 450, y: 380 }, { x: 150, y: 380 }].map(girar)
    const esquinas = detectarDocumento(hojaSobreMesa(600, 450, q))
    expect(esquinas).not.toBeNull()
    esquinas.forEach((p, i) => expect(cercano(p, q[i], 22)).toBe(true))
  })

  it('no inventa esquinas cuando el papel llena la foto, aunque tenga sombra', () => {
    expect(detectarDocumento(fotoConSombra())).toBeNull()
  })

  it('no inventa esquinas sin contraste entre hoja y fondo', () => {
    expect(detectarDocumento(lienzo(400, 300, () => [200, 200, 200]))).toBeNull()
  })

  it('descarta una mancha clara pequeña que no es una hoja', () => {
    const q = [{ x: 20, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 90 }, { x: 20, y: 90 }]
    expect(detectarDocumento(hojaSobreMesa(600, 450, q))).toBeNull()
  })
})

describe('corregirPerspectiva', () => {
  it('deja la hoja recta y sin fondo oscuro en los bordes', () => {
    const q = [{ x: 120, y: 60 }, { x: 500, y: 90 }, { x: 470, y: 400 }, { x: 90, y: 380 }]
    const foto = hojaSobreMesa(600, 450, q)
    const recta = corregirPerspectiva(foto, detectarDocumento(foto))
    expect(recta).not.toBeNull()
    // Tamaño parecido al de la hoja real (~380 x ~315).
    expect(recta.width).toBeGreaterThan(340)
    expect(recta.width).toBeLessThan(420)
    expect(recta.height).toBeGreaterThan(290)
    expect(recta.height).toBeLessThan(360)
    // Franja exterior de 3 px: todo papel, nada de mesa (30).
    let oscuros = 0
    let total = 0
    for (let y = 0; y < recta.height; y++) {
      for (let x = 0; x < recta.width; x++) {
        if (x < 3 || y < 3 || x >= recta.width - 3 || y >= recta.height - 3) {
          total++
          if (gris(recta, x, y) < 45) oscuros++ // mesa = 30; el texto sintético = 60
        }
      }
    }
    expect(oscuros / total).toBeLessThan(0.005)
  })

  it('con las esquinas de toda la foto devuelve la misma imagen', () => {
    const foto = lienzo(200, 150, (x, y) => [x, y, 100])
    const recta = corregirPerspectiva(foto, [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }, { x: 0, y: 150 }])
    expect(recta.width).toBe(200)
    expect(recta.height).toBe(150)
    expect(Math.abs(gris(recta, 50, 40) - 50)).toBeLessThanOrEqual(1)
    expect(Math.abs(recta.data[(40 * 200 + 50) * 4 + 1] - 40)).toBeLessThanOrEqual(1)
  })

  it('un sub-rectángulo conserva la orientación (arriba es arriba, izquierda es izquierda)', () => {
    const foto = lienzo(400, 300, (x, y) => [x / 2, y / 2, 0])
    const recta = corregirPerspectiva(foto, [{ x: 100, y: 60 }, { x: 300, y: 60 }, { x: 300, y: 200 }, { x: 100, y: 200 }])
    expect(recta.width).toBe(200)
    expect(recta.height).toBe(140)
    expect(Math.abs(recta.data[0] - 50)).toBeLessThanOrEqual(1) // R de la esquina sup-izq = 100/2
    expect(Math.abs(recta.data[1] - 30)).toBeLessThanOrEqual(1) // G = 60/2
    const ultimo = ((140 - 1) * 200 + (200 - 1)) * 4
    expect(Math.abs(recta.data[ultimo] - 149.75)).toBeLessThanOrEqual(1.5)
  })

  it('reduce al límite pedido sin deformar', () => {
    const foto = lienzo(400, 300, () => [200, 200, 200])
    const recta = corregirPerspectiva(foto, [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], 200)
    expect(recta.width).toBe(200)
    expect(recta.height).toBe(150)
  })

  it('devuelve null con una geometría degenerada', () => {
    const foto = lienzo(100, 100, () => [200, 200, 200])
    expect(corregirPerspectiva(foto, [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }])).toBeNull()
  })
})

describe('detectarDocumento — papel sobre un escritorio claro', () => {
  // Caso real que fallaba: la mesa también es clara (110 vs 150 del papel), hay
  // un teclado oscuro en una esquina, una sombra que aclara el papel hacia
  // abajo y un filete negro grueso en el pie de página, a pocos píxeles del
  // borde inferior. El filete es una "cresta" (papel claro a ambos lados) y no
  // debe confundirse con el borde del papel.
  const q = [{ x: 60, y: 55 }, { x: 430, y: 45 }, { x: 445, y: 590 }, { x: 40, y: 600 }]
  const foto = () => lienzo(480, 640, (x, y) => {
    if (x < 70 && y < 90) return [25, 25, 25] // teclado
    if (!dentroDe(q, { x, y })) return [110, 110, 110] // escritorio claro
    if (y >= 540 && y < 552) return [35, 35, 35] // filete del pie de página
    const papel = 150 + (y / 640) * 20
    return (x + y) % 17 < 3 && y % 24 < 6 && y < 520 ? [70, 70, 70] : [papel, papel, papel]
  })

  it('encuentra las esquinas reales de la hoja y no el filete del pie', () => {
    const esquinas = detectarDocumento(foto())
    expect(esquinas).not.toBeNull()
    esquinas.forEach((p, i) => expect(cercano(p, q[i], 20)).toBe(true))
  })

  it('al enderezar queda la hoja completa, incluido el filete, sin escritorio en los bordes', () => {
    const f = foto()
    const recta = corregirPerspectiva(f, detectarDocumento(f))
    expect(recta).not.toBeNull()
    expect(recta.width).toBeGreaterThan(360)
    expect(recta.height).toBeGreaterThan(520)
    // El filete (35) tiene que seguir dentro de la hoja, no recortado.
    let hayFilete = false
    for (let y = 0; y < recta.height && !hayFilete; y++) if (gris(recta, Math.round(recta.width / 2), y) < 50) hayFilete = true
    expect(hayFilete).toBe(true)
    // Franja exterior de 3 px sin escritorio (110) ni teclado (25).
    let ajenos = 0
    let total = 0
    for (let y = 0; y < recta.height; y++) {
      for (let x = 0; x < recta.width; x++) {
        if (x < 3 || y < 3 || x >= recta.width - 3 || y >= recta.height - 3) {
          total++
          const v = gris(recta, x, y)
          if (v < 130 && v > 20 && Math.abs(v - 110) < 8) ajenos++
        }
      }
    }
    expect(ajenos / total).toBeLessThan(0.01)
  })

  it('se abstiene cuando el papel ya llena la foto (sin bordes visibles)', () => {
    expect(detectarDocumento(lienzo(480, 640, (x, y) => [150 + (y / 640) * 20, 150, 150]))).toBeNull()
  })
})
