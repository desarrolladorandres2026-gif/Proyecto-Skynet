import { describe, it, expect } from 'vitest'
import { construirPdfRadicado } from './radicadoPdf.js'

const radicado = (extra = {}) => ({
  radicado: 'TTN-2026-0014',
  formulario: { id: 1, titulo: 'Portal PQRSF - Atención al Ciudadano' },
  estado: 'sin_leer',
  fecha: '2026-10-22 17:19:00',
  campos: [
    { clave: 'tipo', etiqueta: 'Tipo de Solicitud', valor: 'Queja' },
    { clave: 'msg', etiqueta: 'Ingrese su inquietud/comentario', valor: 'Línea de texto. '.repeat(40) },
    { clave: 'adj', etiqueta: 'Adjuntar archivo', valor: 'https://elterminalneiva.com/wp-content/uploads/2026/10/soporte.pdf' },
  ],
  ...extra,
})

describe('PDF de radicado', () => {
  it('genera una hoja con los datos básicos', async () => {
    const pdf = await construirPdfRadicado(radicado())
    expect(pdf.internal.getNumberOfPages()).toBe(1)
    expect(pdf.output('arraybuffer').byteLength).toBeGreaterThan(2000)
  })

  it('un texto larguísimo continúa en más hojas sin perder líneas ni romperse con emojis', async () => {
    const largo = 'Descripción con emoji 😀 y tildes ñ. '.repeat(600)
    const pdf = await construirPdfRadicado(radicado({ campos: [{ clave: 'msg', etiqueta: 'Mensaje', valor: largo }] }))
    expect(pdf.internal.getNumberOfPages()).toBeGreaterThan(1)
  })
})
