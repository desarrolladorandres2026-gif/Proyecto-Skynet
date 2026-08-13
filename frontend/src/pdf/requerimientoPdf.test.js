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
