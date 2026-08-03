import { jsPDF } from 'jspdf'
import { LOGO_TERMINAL } from '../modules/induccion/induccionData.js'

// Réplica digital de los 2 formatos institucionales del Terminal:
// FO-GBS-09 (Solicitud de Requerimiento / compra) y FO-GBS-36 (Requerimiento
// de Servicios). Mismo patrón que CertificadoPage.jsx (jsPDF + carga de
// imagen vía Promise sobre <img>), reutilizando el logo ya existente.

function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function fmtFechaPdf(valor) {
  if (!valor) return '—'
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

const FORMATOS = {
  compra: {
    codigo: 'FO-GBS-09',
    vigencia: 'JUNIO 06 DE 2019',
    version: '5',
    titulo: 'SOLICITUD DE REQUERIMIENTO',
  },
  servicio: {
    codigo: 'FO-GBS-36',
    vigencia: 'AGOSTO 16 DE 2019',
    version: '1',
    titulo: 'REQUERIMIENTO DE SERVICIOS',
  },
}

const MARGIN = 14
const ANCHO_PAGINA = 210
const ALTO_PAGINA = 297
const ANCHO_UTIL = ANCHO_PAGINA - MARGIN * 2

async function dibujarEncabezado(pdf, tipo) {
  const formato = FORMATOS[tipo]
  const altoCaja = 24
  const anchoLogo = 32
  const anchoDatos = 42
  const anchoTitulo = ANCHO_UTIL - anchoLogo - anchoDatos

  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.4)
  pdf.rect(MARGIN, MARGIN, ANCHO_UTIL, altoCaja)
  pdf.line(MARGIN + anchoLogo, MARGIN, MARGIN + anchoLogo, MARGIN + altoCaja)
  pdf.line(MARGIN + anchoLogo + anchoTitulo, MARGIN, MARGIN + anchoLogo + anchoTitulo, MARGIN + altoCaja)
  pdf.line(MARGIN + anchoLogo + anchoTitulo, MARGIN + altoCaja / 2, ANCHO_PAGINA - MARGIN, MARGIN + altoCaja / 2)

  try {
    const img = await cargarImagen(LOGO_TERMINAL)
    const logoW = anchoLogo - 8
    const logoH = (img.height / img.width) * logoW
    pdf.addImage(img, 'PNG', MARGIN + 4, MARGIN + (altoCaja - logoH) / 2, logoW, logoH)
  } catch {
    // Sin logo disponible: la caja queda vacía, no bloquea la generación del PDF.
  }

  const xTitulo = MARGIN + anchoLogo + anchoTitulo / 2
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text('GESTIÓN DE BIENES Y SERVICIOS', xTitulo, MARGIN + 10, { align: 'center', maxWidth: anchoTitulo - 4 })
  pdf.setFontSize(9.5)
  pdf.text(formato.titulo, xTitulo, MARGIN + 17, { align: 'center', maxWidth: anchoTitulo - 4 })

  const xDatos = MARGIN + anchoLogo + anchoTitulo + 3
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.text('CÓDIGO:', xDatos, MARGIN + 5)
  pdf.setFont('helvetica', 'bold')
  pdf.text(formato.codigo, xDatos, MARGIN + 9)
  pdf.setFont('helvetica', 'normal')
  pdf.text('VIGENCIA:', xDatos, MARGIN + 16)
  pdf.text(formato.vigencia, xDatos, MARGIN + 20)
  pdf.setFontSize(6.5)
  pdf.text(`VERSIÓN: ${formato.version}`, xDatos, MARGIN + 23)

  return MARGIN + altoCaja + 8
}

function encabezadoSolicitante(pdf, req, yInicial) {
  let y = yInicial
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text('SOLICITANTE:', MARGIN, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text(req.solicitante?.nombre || '—', MARGIN + 30, y)
  y += 6

  pdf.setFont('helvetica', 'bold')
  pdf.text('CARGO:', MARGIN, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text(req.cargoSolicitante || '—', MARGIN + 30, y)
  y += 6

  if (req.areaOProceso) {
    pdf.setFont('helvetica', 'bold')
    pdf.text('ÁREA / PROCESO:', MARGIN, y)
    pdf.setFont('helvetica', 'normal')
    pdf.text(req.areaOProceso, MARGIN + 30, y)
    y += 6
  }

  return y + 4
}

const COLS_COMPRA = [
  { label: 'FECHA', w: 20 },
  { label: 'DESCRIPCIÓN DEL PRODUCTO', w: 66 },
  { label: 'CANT.', w: 15 },
  { label: 'DESTINO', w: 35 },
  { label: 'CONTROL DE RECIBIDO', w: 46 },
]

function dibujarTablaCompra(pdf, req, yInicial) {
  let y = yInicial
  const alturaFila = 9
  const alturaEncabezado = 9

  function dibujarEncabezadoTabla() {
    let x = MARGIN
    pdf.setFillColor(226, 232, 240)
    pdf.setDrawColor(15, 23, 42)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    for (const col of COLS_COMPRA) {
      pdf.rect(x, y, col.w, alturaEncabezado, 'FD')
      pdf.text(col.label, x + col.w / 2, y + 5, { align: 'center', maxWidth: col.w - 2 })
      x += col.w
    }
    y += alturaEncabezado
  }

  function nuevaPaginaSiHaceFalta() {
    if (y + alturaFila > ALTO_PAGINA - 40) {
      pdf.addPage()
      y = MARGIN
      dibujarEncabezadoTabla()
    }
  }

  dibujarEncabezadoTabla()
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)

  for (const item of req.itemsCompra || []) {
    nuevaPaginaSiHaceFalta()
    let x = MARGIN
    const valores = [
      fmtFechaPdf(item.fechaSolicitud),
      item.descripcionProducto,
      String(item.cantidad),
      item.destino || '—',
      item.controlRecibido?.recibido ? `Recibido ${fmtFechaPdf(item.controlRecibido.fecha)}` : 'Pendiente',
    ]
    for (let i = 0; i < COLS_COMPRA.length; i++) {
      const col = COLS_COMPRA[i]
      pdf.rect(x, y, col.w, alturaFila)
      pdf.text(pdf.splitTextToSize(valores[i], col.w - 3), x + 1.5, y + 5)
      x += col.w
    }
    y += alturaFila
  }

  return y + 6
}

function dibujarAnalisisTecnico(pdf, req, yInicial) {
  let y = yInicial
  if (y > ALTO_PAGINA - 50) {
    pdf.addPage()
    y = MARGIN
  }
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('ANÁLISIS TÉCNICO DEL REQUERIMIENTO', MARGIN, y)
  y += 5
  pdf.setFont('helvetica', 'normal')
  const texto = pdf.splitTextToSize(req.financiero?.analisisTecnico || 'N/A', ANCHO_UTIL)
  pdf.text(texto, MARGIN, y)
  return y + texto.length * 4.5 + 6
}

function dibujarSeccionServicio(pdf, label, valor, yInicial) {
  let y = yInicial
  if (y > ALTO_PAGINA - 50) {
    pdf.addPage()
    y = MARGIN
  }
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  pdf.text(label, MARGIN, y)
  y += 5
  pdf.setFont('helvetica', 'normal')
  const texto = pdf.splitTextToSize(valor || '—', ANCHO_UTIL)
  pdf.text(texto, MARGIN, y)
  return y + texto.length * 4.5 + 5
}

function dibujarCuerpoServicio(pdf, req, yInicial) {
  let y = yInicial
  y = dibujarSeccionServicio(pdf, '4. DESCRIPCIÓN DEL TIPO DE SERVICIO REQUERIDO', req.detalleServicio?.descripcionTipoServicio, y)
  y = dibujarSeccionServicio(pdf, '5.a COMPETENCIA (educación, formación y experiencia)', req.detalleServicio?.competencia, y)
  y = dibujarSeccionServicio(pdf, '5.b LABORES A DESARROLLAR', req.detalleServicio?.laboresADesarrollar, y)
  y = dibujarSeccionServicio(pdf, '5.c REQUISITOS SST-A', req.detalleServicio?.requisitosSST, y)
  return y
}

// Dos bloques de firma lado a lado: Financiero (izquierda) siempre presente,
// Bodega (derecha) solo tiene contenido "firmado" cuando estado === 'aprobada'
// (mismo criterio de negocio que aprobarComoFinanciero — la reautenticación,
// es decir la firma, solo se exige en la decisión afirmativa).
function dibujarBloquesFirma(pdf, req, yInicial) {
  let y = yInicial + 6
  if (y > ALTO_PAGINA - 40) {
    pdf.addPage()
    y = MARGIN
  }
  const anchoBloque = 75
  const xFinanciero = MARGIN
  const xBodega = ANCHO_PAGINA - MARGIN - anchoBloque

  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.3)
  pdf.line(xFinanciero, y, xFinanciero + anchoBloque, y)
  pdf.line(xBodega, y, xBodega + anchoBloque, y)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('Financiero', xFinanciero, y + 5)
  pdf.text('Bodega', xBodega, y + 5)
  pdf.setFont('helvetica', 'normal')

  if (req.financiero?.fechaDecision) {
    const estadoTexto = req.estado === 'rechazado' ? 'RECHAZADO' : 'APROBADO'
    pdf.text(`${estadoTexto}: ${req.financiero.nombreAprobador || '—'}`, xFinanciero, y + 10)
    if (req.financiero.cargoAprobador) pdf.text(req.financiero.cargoAprobador, xFinanciero, y + 14)
    pdf.text(`Fecha: ${fmtFechaPdf(req.financiero.fechaDecision)}`, xFinanciero, y + 18)
  } else {
    pdf.text('Pendiente de aprobación', xFinanciero, y + 10)
  }

  if (req.bodega?.estado === 'aprobada' && req.bodega.fecha) {
    pdf.text(`APROBADO: ${req.bodega.nombreRevisor || '—'}`, xBodega, y + 10)
    if (req.bodega.cargoRevisor) pdf.text(req.bodega.cargoRevisor, xBodega, y + 14)
    pdf.text(`Fecha: ${fmtFechaPdf(req.bodega.fecha)}`, xBodega, y + 18)
  } else if (req.bodega?.estado === 'no_aprobada' && req.bodega.fecha) {
    pdf.text(`NO APROBADO: ${req.bodega.nombreRevisor || '—'}`, xBodega, y + 10)
    pdf.text(`Fecha: ${fmtFechaPdf(req.bodega.fecha)}`, xBodega, y + 14)
  } else {
    pdf.text('Pendiente de gestión', xBodega, y + 10)
  }
}

// Única función de generación (no hay un generador por tipo): la invocan
// tanto RequerimientoDetallePage como BandejaBodegaPage.
export async function generarPdfRequerimiento(req) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = await dibujarEncabezado(pdf, req.tipo)
  y = encabezadoSolicitante(pdf, req, y)

  if (req.tipo === 'compra') {
    y = dibujarTablaCompra(pdf, req, y)
    y = dibujarAnalisisTecnico(pdf, req, y)
  } else {
    y = dibujarCuerpoServicio(pdf, req, y)
  }

  dibujarBloquesFirma(pdf, req, y)

  const codigo = FORMATOS[req.tipo].codigo
  pdf.save(`${codigo}_${String(req._id || '').slice(-6)}.pdf`)
}
