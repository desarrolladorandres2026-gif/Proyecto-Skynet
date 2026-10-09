import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { construirPdfRequerimiento } from './requerimientoPdf.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Mismo archivo que sirve el backend en /storage/induccion/logos/logo_terminal.png
// (ver Backend/src/index.js: app.use('/storage', express.static(env.STORAGE_ROOT))).
// Se usan los bytes reales, no un PNG sintético, para que el test valide el
// archivo que de verdad se sirve en producción.
const LOGO_PATH = resolve(__dirname, '../../../Backend/storage/induccion/logos/logo_terminal.png')
const logoBuffer = readFileSync(LOGO_PATH)

function anchoAltoPng(buffer) {
  // IHDR: 8 bytes de firma + 4 (longitud) + 4 ("IHDR") + ancho(4) + alto(4).
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

// jsdom no decodifica píxeles reales (no hay 'canvas' nativo instalado en el
// proyecto), así que Image.onload nunca dispararía por sí solo. Como en este
// test el dataURL siempre viene de un buffer PNG real y conocido, se
// sustituye la decodificación por una lectura directa del header IHDR — el
// mismo ancho/alto que un navegador real reportaría en naturalWidth/Height
// para ese archivo, sin inventar valores.
class ImagenFalsa {
  set src(value) {
    const base64 = value.split(',')[1]
    const bytes = Buffer.from(base64, 'base64')
    const { width, height } = anchoAltoPng(bytes)
    queueMicrotask(() => {
      this.naturalWidth = width
      this.naturalHeight = height
      this.onload?.()
    })
  }
}

function reqMinimo(overrides = {}) {
  return {
    tipo: 'compra',
    solicitante: { nombre: 'Prueba' },
    itemsCompra: [],
    financiero: {},
    bodega: {},
    estado: 'pendiente_bodega',
    ...overrides,
  }
}

describe('construirPdfRequerimiento — logo en el encabezado', () => {
  let ImageOriginal

  beforeEach(() => {
    ImageOriginal = global.Image
    global.Image = ImagenFalsa
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('logo_terminal.png')) {
        return { ok: true, status: 200, blob: async () => new Blob([logoBuffer], { type: 'image/png' }) }
      }
      return { ok: false, status: 404, blob: async () => new Blob([]) }
    })
  })

  afterEach(() => {
    global.Image = ImageOriginal
    vi.restoreAllMocks()
  })

  it('carga el logo real (fetch→blob→dataURL) y lo embebe en el PDF sin errores', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const pdf = await construirPdfRequerimiento(reqMinimo())

    // Antes de la corrección, un fallo de canvas "tainted" caía en el catch
    // silencioso y el logo quedaba ausente sin que nada lo reportara. Ahora
    // cualquier fallo real debe pasar por console.error.
    expect(errorSpy).not.toHaveBeenCalled()

    const bytes = pdf.output('arraybuffer')
    const pdfTexto = Buffer.from(bytes).toString('latin1')
    // Confirma que jsPDF de verdad embebió una imagen (XObject), no solo que
    // la caja del encabezado quedó vacía sin lanzar excepción.
    expect(pdfTexto).toContain('/Subtype /Image')
    expect(pdf.internal.pages.length).toBeGreaterThan(0)
  })

  it('si el logo no se puede cargar (404), no bloquea el PDF y sí lo reporta', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404, blob: async () => new Blob([]) }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const pdf = await construirPdfRequerimiento(reqMinimo())

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('logo'),
      expect.anything()
    )
    // La generación del PDF sigue completándose igual (caja vacía, no crash).
    expect(pdf.output('arraybuffer').byteLength).toBeGreaterThan(0)
  })
})

describe('construirPdfRequerimiento — descripciones largas (compra)', () => {
  // Margen inferior de 20 mm, en puntos PDF (origen abajo-izquierda).
  const MARGEN_INFERIOR_PT = (20 * 72) / 25.4
  let ImageOriginal

  beforeEach(() => {
    ImageOriginal = global.Image
    global.Image = ImagenFalsa
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob([logoBuffer], { type: 'image/png' }) }))
  })

  afterEach(() => {
    global.Image = ImageOriginal
    vi.restoreAllMocks()
  })

  const textoPdf = (pdf) => Buffer.from(pdf.output('arraybuffer')).toString('latin1')
  const descripcionLarga = (fin) =>
    `${'Suministro e instalacion de cableado estructurado categoria seis para la oficina de taquillas '.repeat(4)}${fin}`

  it('imprime la descripción completa, no solo su primera línea', async () => {
    const pdf = await construirPdfRequerimiento(reqMinimo({
      itemsCompra: [{ fechaSolicitud: new Date(), descripcionProducto: descripcionLarga('FINALDELTEXTO'), cantidad: 3, destino: 'Taquillas' }],
    }))

    expect(textoPdf(pdf)).toContain('FINALDELTEXTO')
    expect(pdf.internal.getNumberOfPages()).toBe(1)
  })

  it('con muchos ítems largos pasa a otra hoja sin salirse del borde inferior', async () => {
    const itemsCompra = Array.from({ length: 12 }, (_, i) => ({
      fechaSolicitud: new Date(),
      descripcionProducto: descripcionLarga(`ITEMFIN${i}`),
      cantidad: i + 1,
      destino: 'Bodega',
    }))
    const pdf = await construirPdfRequerimiento(reqMinimo({
      itemsCompra,
      financiero: { analisisTecnico: `${'Analisis del ingeniero de sistemas. '.repeat(40)}ANALISISFIN` },
    }))

    const texto = textoPdf(pdf)
    const paginas = pdf.internal.getNumberOfPages()
    expect(paginas).toBeGreaterThan(1)
    for (let i = 0; i < 12; i++) expect(texto).toContain(`ITEMFIN${i}`)
    expect(texto).toContain('ANALISISFIN')
    expect(texto).toContain(`PAG: ${paginas} DE ${paginas}`)
    // jsPDF escribe cada rect como "x y w h re" con y desde abajo y h negativo:
    // y + h es el borde inferior de la caja, que no debe invadir el margen.
    const cajas = [...texto.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/g)]
    expect(cajas.length).toBeGreaterThan(0)
    for (const [, , y, , h] of cajas) {
      expect(Number(y) + Number(h)).toBeGreaterThanOrEqual(MARGEN_INFERIOR_PT - 0.01)
    }
  })
})
