import { jsPDF } from 'jspdf'
import { LOGO_TERMINAL } from '../modules/induccion/induccionData.js'
import { cargarImagen } from './requerimientoPdf.js'

// Ficha en PDF de un radicado del sitio web (PQRSF, contacto, denuncias…).
// Mismo lienzo carta y márgenes del PDF de requerimientos.

const MARGIN = 20
const ANCHO_PAGINA = 215.9
const ALTO_PAGINA = 279.4
const ANCHO_UTIL = ANCHO_PAGINA - MARGIN * 2
const LIMITE_Y = ALTO_PAGINA - MARGIN - 4
const ALTO_ENCABEZADO = 22

const ETIQUETA_ESTADO = { sin_leer: 'Sin leer', leido: 'Leído / en revisión', tramitado: 'Tramitado / resuelto' }

// Helvetica de jsPDF solo trae Latin-1 (tildes y ñ sí): un emoji o símbolo
// que escriba el ciudadano saldría como basura, así que se cambia por "?".
const aLatin1 = (texto) => String(texto ?? '').replace(/[^\u0000-ÿ]/g, '?')

function fechaLarga(valor) {
  const d = new Date(valor ? String(valor).replace(' ', 'T') : '')
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function encabezado(pdf, logo, radicado) {
  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.4)
  pdf.rect(MARGIN, MARGIN, ANCHO_UTIL, ALTO_ENCABEZADO)
  const anchoLogo = 30
  pdf.line(MARGIN + anchoLogo, MARGIN, MARGIN + anchoLogo, MARGIN + ALTO_ENCABEZADO)
  if (logo) {
    const escala = Math.min((anchoLogo - 8) / logo.width, (ALTO_ENCABEZADO - 4) / logo.height)
    const w = logo.width * escala
    const h = logo.height * escala
    pdf.addImage(logo.dataUrl, 'PNG', MARGIN + (anchoLogo - w) / 2, MARGIN + (ALTO_ENCABEZADO - h) / 2, w, h)
  }
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text('TERMINAL DE TRANSPORTES DE NEIVA', MARGIN + anchoLogo + 5, MARGIN + 8)
  pdf.setFontSize(13)
  pdf.text(`Radicado ${aLatin1(radicado.radicado)}`, MARGIN + anchoLogo + 5, MARGIN + 16)
  return MARGIN + ALTO_ENCABEZADO + 9
}

export async function construirPdfRadicado(radicado) {
  const pdf = new jsPDF({ unit: 'mm', format: 'letter' })
  let logo = null
  try {
    logo = await cargarImagen(LOGO_TERMINAL)
  } catch (err) {
    console.error('No se pudo cargar el logo en el PDF del radicado:', err)
  }

  let y = encabezado(pdf, logo, radicado)

  const nuevaPagina = () => {
    pdf.addPage()
    y = encabezado(pdf, logo, radicado)
  }
  const asegurar = (alto) => {
    if (y + alto > LIMITE_Y) nuevaPagina()
  }

  const meta = [
    ['Formulario', radicado.formulario?.titulo],
    ['Fecha de radicación', fechaLarga(radicado.fecha)],
    ['Estado del trámite', ETIQUETA_ESTADO[radicado.estado] || radicado.estado],
  ]
  for (const [etiqueta, valor] of meta) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text(`${etiqueta}:`, MARGIN, y)
    pdf.setFont('helvetica', 'normal')
    const lineas = pdf.splitTextToSize(aLatin1(valor || '—'), ANCHO_UTIL - 46)
    pdf.text(lineas, MARGIN + 46, y)
    y += Math.max(1, lineas.length) * 4.6 + 1.6
  }

  y += 2
  pdf.setDrawColor(148, 163, 184)
  pdf.setLineWidth(0.2)
  pdf.line(MARGIN, y, MARGIN + ANCHO_UTIL, y)
  y += 7

  for (const campo of radicado.campos || []) {
    const valor = campo.adjunto ? `Archivo adjunto: ${campo.valor}` : campo.valor || '—'
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    const lineas = pdf.splitTextToSize(aLatin1(valor), ANCHO_UTIL)
    const alto = lineas.length * 4.6

    asegurar(5.5 + Math.min(alto, 14))
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(71, 85, 105)
    pdf.text(aLatin1(campo.etiqueta).toUpperCase(), MARGIN, y)
    pdf.setTextColor(0, 0, 0)
    y += 4.6

    // Un texto largo (la descripción del ciudadano) sigue en la hoja siguiente.
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    let pendientes = lineas
    while (pendientes.length) {
      const caben = Math.max(1, Math.floor((LIMITE_Y - y) / 4.6))
      const trozo = pendientes.slice(0, caben)
      pdf.text(trozo, MARGIN, y)
      y += trozo.length * 4.6
      pendientes = pendientes.slice(trozo.length)
      if (pendientes.length) nuevaPagina()
    }
    y += 4
  }

  const totalPaginas = pdf.internal.getNumberOfPages()
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(100, 116, 139)
    pdf.text(`Generado desde Skynet · ${new Date().toLocaleDateString('es-CO')}`, MARGIN, ALTO_PAGINA - MARGIN + 5)
    pdf.text(`PAG: ${p} DE ${totalPaginas}`, MARGIN + ANCHO_UTIL, ALTO_PAGINA - MARGIN + 5, { align: 'right' })
  }
  return pdf
}

export async function generarPdfRadicado(radicado) {
  const pdf = await construirPdfRadicado(radicado)
  pdf.save(`${String(radicado.radicado).replace(/[^A-Za-z0-9-]+/g, '_')}.pdf`)
}
