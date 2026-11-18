import { describe, it, expect } from 'vitest'
import { construirPdfSoporte } from './escanerDocumento.js'

// JPEG mínimo: solo la cabecera que jsPDF necesita para leer el tamaño. No se
// decodifica aquí; lo que se prueba es el armado del PDF (páginas, orientación).
function jpegFalso(ancho, alto) {
  const bytes = [
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, alto >> 8, alto & 255, ancho >> 8, ancho & 255, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]
  // jsdom no implementa Blob.arrayBuffer (los navegadores sí): se simula.
  const buffer = new Uint8Array(bytes).buffer
  return { arrayBuffer: async () => buffer }
}

describe('construirPdfSoporte', () => {
  it('arma un PDF con una página por foto, cada una con la orientación de su foto', async () => {
    const archivo = await construirPdfSoporte([
      { blob: jpegFalso(300, 400), width: 300, height: 400 },
      { blob: jpegFalso(400, 300), width: 400, height: 300 },
      { blob: jpegFalso(300, 400), width: 300, height: 400 },
    ], 'prueba.pdf')

    expect(archivo.name).toBe('prueba.pdf')
    expect(archivo.type).toBe('application/pdf')
    const texto = await new Promise((resolve, reject) => {
      const lector = new FileReader()
      lector.onload = () => resolve(lector.result)
      lector.onerror = reject
      lector.readAsBinaryString(archivo)
    })
    expect(texto.startsWith('%PDF-')).toBe(true)
    expect((texto.match(/\/Type \/Page\b/g) || []).length).toBe(3)
    // A4 vertical (595x842) y horizontal (842x595), en puntos.
    expect(texto).toMatch(/\/MediaBox \[0 0 595\.\d+ 841\.\d+\]/)
    expect(texto).toMatch(/\/MediaBox \[0 0 841\.\d+ 595\.\d+\]/)
  })

  it('rechaza armar un PDF sin páginas', async () => {
    await expect(construirPdfSoporte([])).rejects.toThrow()
  })
})
