import { jsPDF } from 'jspdf'
import { LOGO_TERMINAL } from '../modules/induccion/induccionData.js'

// Réplica digital de los 2 formatos institucionales del Terminal:
// FO-GBS-09 (Solicitud de Requerimiento / compra) y FO-GBS-36 (Requerimiento
// de Servicios). Mismo patrón que CertificadoPage.jsx (jsPDF + carga de
// imagen vía Promise sobre <img>), reutilizando el logo ya existente.

// Pasar por fetch()+FileReader en vez de un <img crossOrigin="anonymous">
// evita el problema de raíz: jsPDF extrae los píxeles dibujando la imagen en
// un canvas interno, y ese canvas queda "tainted" (addImage falla en
// silencio, atrapado por el catch de cada llamador) si el navegador sirve la
// imagen desde una respuesta cacheada en modo "no-cors" — algo que pasaba
// con el logo porque ya se había cargado antes en la página sin
// crossOrigin (InduccionHome, CertificadoPage). Con un data: URL no hay
// origen que evaluar: nunca tainta el canvas, tanto para el logo local como
// para la firma de Cloudinary.
//
// credentials: 'same-origin' (no 'omit'): /storage/* en el backend exige
// sesión (verificarToken lee la cookie), así que el fetch del logo necesita
// mandar la cookie o el backend responde 401 y el PDF sale sin logo — bug
// real visto en producción (2026-08-18). 'same-origin' cubre ambos casos a
// la vez: manda la cookie hacia el propio origen (logo) y la omite hacia
// Cloudinary (firma), evitando además un preflight CORS que Cloudinary no
// está configurado para aceptar con credenciales.
function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    fetch(src, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(`No se pudo cargar la imagen (${res.status}): ${src}`)
        return res.blob()
      })
      .then((blob) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result
          const img = new Image()
          img.onload = () => resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight })
          img.onerror = reject
          img.src = dataUrl
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      .catch(reject)
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
    const { dataUrl, width, height } = await cargarImagen(LOGO_TERMINAL)
    // Ajuste por contención (ancho Y alto, no solo ancho): el logo actual es
    // cuadrado y llenaría exactamente los 24 mm de altoCaja si solo se
    // escalara por ancho, pegándose a las líneas de arriba/abajo sin margen.
    // min() con el presupuesto más ajustado de los dos ejes evita además que
    // un logo futuro más alto que ancho se desborde de la caja.
    const anchoDisponible = anchoLogo - 8
    const altoDisponible = altoCaja - 4
    const escala = Math.min(anchoDisponible / width, altoDisponible / height)
    const logoW = width * escala
    const logoH = height * escala
    pdf.addImage(dataUrl, 'PNG', MARGIN + (anchoLogo - logoW) / 2, MARGIN + (altoCaja - logoH) / 2, logoW, logoH)
  } catch (err) {
    // Sin logo disponible: la caja queda vacía, no bloquea la generación del PDF.
    console.error('No se pudo cargar el logo en el PDF de requerimiento:', err)
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
  const alturaFilaMinima = 9
  const alturaEncabezado = 9

  function dibujarEncabezadoTabla() {
    pdf.setDrawColor(15, 23, 42)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)

    // Las celdas se rellenan TODAS antes de escribir cualquier texto. En PDF
    // el color de relleno y el color de texto son el mismo registro y BT/ET no
    // lo restauran: al dibujar texto, jsPDF emite `0 g` (negro) y ese negro
    // queda vigente para el siguiente rect('FD'). Intercalando rect y text, de
    // la segunda columna en adelante el encabezado salía como una franja negra
    // con el rótulo negro encima, invisible.
    let x = MARGIN
    pdf.setFillColor(226, 232, 240)
    for (const col of COLS_COMPRA) {
      pdf.rect(x, y, col.w, alturaEncabezado, 'FD')
      x += col.w
    }

    x = MARGIN
    for (const col of COLS_COMPRA) {
      pdf.text(col.label, x + col.w / 2, y + 5, { align: 'center', maxWidth: col.w - 2 })
      x += col.w
    }
    y += alturaEncabezado
  }

  function nuevaPaginaSiHaceFalta(altura) {
    if (y + altura > ALTO_PAGINA - 40) {
      pdf.addPage()
      y = MARGIN
      dibujarEncabezadoTabla()
    }
  }

  dibujarEncabezadoTabla()
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  // getLineHeight() devuelve el alto en puntos (unidad de fuente), no en mm
  // (unidad del documento) — hay que pasarlo por scaleFactor o la altura de
  // fila calculada sale ~2.8x más grande de lo real.
  const alturaLinea = pdf.getLineHeight() / pdf.internal.scaleFactor

  for (const item of req.itemsCompra || []) {
    const valores = [
      fmtFechaPdf(item.fechaSolicitud),
      item.descripcionProducto || '—',
      String(item.cantidad ?? '—'),
      item.destino || '—',
      item.controlRecibido?.recibido ? `Recibido ${fmtFechaPdf(item.controlRecibido.fecha)}` : 'Pendiente',
    ]
    // Alto dinámico: una descripción larga se envuelve en varias líneas
    // (splitTextToSize). Con una altura de fila fija, ese texto se salía de
    // su celda y se encimaba con la fila de abajo — fechas, destino y
    // control de recibido quedaban tapados bajo el desborde, ilegibles.
    const lineasPorColumna = valores.map((valor, i) => pdf.splitTextToSize(valor, COLS_COMPRA[i].w - 3))
    const maxLineas = Math.max(...lineasPorColumna.map((lineas) => lineas.length))
    const alturaFila = Math.max(alturaFilaMinima, maxLineas * alturaLinea + 3)

    nuevaPaginaSiHaceFalta(alturaFila)

    let x = MARGIN
    for (let i = 0; i < COLS_COMPRA.length; i++) {
      const col = COLS_COMPRA[i]
      pdf.rect(x, y, col.w, alturaFila)
      pdf.text(lineasPorColumna[i], x + 1.5, y + 5)
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

// Financiero (izquierda) es el ÚNICO que firma de verdad — tiene línea de
// firma y la rúbrica flotando encima. Bodega (derecha) NUNCA firma: solo
// despacha/registra, así que no lleva línea ni rúbrica, solo texto plano de
// quién gestionó y cuándo. Antes ambos bloques compartían el mismo diseño
// (línea + "APROBADO: nombre"), lo que daba a entender que Bodega también
// firmaba digitalmente el documento — corregido a pedido del usuario
// (2026-08-05): la firma es un dato delicado y solo debe implicar a quien
// de verdad la estampa.
async function dibujarBloquesFirma(pdf, req, yInicial) {
  const anchoBloque = 75
  const xFinanciero = MARGIN
  const xBodega = ANCHO_PAGINA - MARGIN - anchoBloque

  // Ajuste "contain" real: se escala por el lado que primero toque su tope
  // (alto o ancho), así la rúbrica sale al tamaño más grande posible sin
  // deformarse ni desbordar el bloque. Antes se forzaba un alto fijo de
  // 12mm y solo se recortaba el ancho sin volver a calcular el alto — el
  // resultado quedaba chico siempre y, si la firma era muy alargada, hasta
  // se estiraba verticalmente (usuario reportó "la firma queda demasiado
  // pequeña", 2026-08-05).
  const ALTO_MAX_FIRMA = 22
  const ANCHO_MAX_FIRMA = anchoBloque - 10

  // Espacio antes del bloque: tiene que cubrir el alto MÁXIMO posible de la
  // firma flotando por encima de la línea + un colchón, o queda pegada/
  // encimada sobre la última línea de texto del cuerpo (ver bug reportado
  // en el formato de servicios cuando el alto era 12-13mm y el gap 18mm).
  let y = yInicial + ALTO_MAX_FIRMA + 6
  if (y > ALTO_PAGINA - 40) {
    pdf.addPage()
    y = MARGIN
  }

  // La rúbrica se dibuja FLOTANDO sobre la línea (no debajo, como el resto
  // del texto del bloque): así queda como una firma real "encima del
  // renglón", que es donde se espera verla en un formato impreso.
  if (req.estado !== 'rechazado' && req.financiero?.firma?.url) {
    try {
      const { dataUrl, width, height } = await cargarImagen(req.financiero.firma.url)
      const escala = Math.min(ALTO_MAX_FIRMA / height, ANCHO_MAX_FIRMA / width)
      const anchoFirma = width * escala
      const altoFirma = height * escala
      pdf.addImage(dataUrl, 'PNG', xFinanciero + 5, y - altoFirma - 1, anchoFirma, altoFirma)
    } catch (err) {
      // Sin firma disponible (red, CORS, asset borrado): el bloque de texto
      // de abajo sigue mostrando quién aprobó y cuándo — no bloquea el PDF.
      console.error('No se pudo cargar la firma en el PDF de requerimiento:', err)
    }
  }

  // Línea de firma SOLO para Financiero — Bodega no tiene, precisamente
  // porque no firma.
  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.3)
  pdf.line(xFinanciero, y, xFinanciero + anchoBloque, y)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('Financiero', xFinanciero, y + 5)
  pdf.text('Bodega', xBodega, y + 5)
  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(6)
  pdf.text('(registro de despacho, no firma)', xBodega, y + 8.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)

  if (req.financiero?.fechaDecision) {
    const estadoTexto = req.estado === 'rechazado' ? 'RECHAZADO' : 'APROBADO'
    pdf.text(`${estadoTexto}: ${req.financiero.nombreAprobador || '—'}`, xFinanciero, y + 10)
    if (req.financiero.cargoAprobador) pdf.text(req.financiero.cargoAprobador, xFinanciero, y + 14)
    pdf.text(`Fecha: ${fmtFechaPdf(req.financiero.fechaDecision)}`, xFinanciero, y + 18)
  } else {
    pdf.text('Pendiente de aprobación', xFinanciero, y + 10)
  }

  if (req.bodega?.estado === 'aprobada' && req.bodega.fecha) {
    pdf.text(`Despachado por: ${req.bodega.nombreRevisor || '—'}`, xBodega, y + 13)
    if (req.bodega.cargoRevisor) pdf.text(req.bodega.cargoRevisor, xBodega, y + 17)
    pdf.text(`Fecha: ${fmtFechaPdf(req.bodega.fecha)}`, xBodega, y + 21)
  } else if (req.bodega?.estado === 'no_aprobada' && req.bodega.fecha) {
    pdf.text(`No se despachó: ${req.bodega.nombreRevisor || '—'}`, xBodega, y + 13)
    pdf.text(`Fecha: ${fmtFechaPdf(req.bodega.fecha)}`, xBodega, y + 17)
  } else {
    pdf.text('Pendiente de gestión', xBodega, y + 13)
  }
}

export function nombreArchivoPdfRequerimiento(req) {
  const codigo = FORMATOS[req.tipo].codigo
  return `${codigo}_${String(req._id || '').slice(-6)}.pdf`
}

// Construye el documento sin guardarlo — separado de generarPdfRequerimiento
// para que el backup masivo (BackupPage.jsx, descarga en lote de PDFs ya
// aprobados+despachados) pueda meter el mismo PDF en un .zip en vez de
// disparar N descargas individuales del navegador.
export async function construirPdfRequerimiento(req) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = await dibujarEncabezado(pdf, req.tipo)
  y = encabezadoSolicitante(pdf, req, y)

  if (req.tipo === 'compra') {
    y = dibujarTablaCompra(pdf, req, y)
    y = dibujarAnalisisTecnico(pdf, req, y)
  } else {
    y = dibujarCuerpoServicio(pdf, req, y)
  }

  await dibujarBloquesFirma(pdf, req, y)
  return pdf
}

// Única función de descarga directa (no hay un generador por tipo): la
// invocan tanto RequerimientoDetallePage como BandejaBodegaPage.
export async function generarPdfRequerimiento(req) {
  const pdf = await construirPdfRequerimiento(req)
  pdf.save(nombreArchivoPdfRequerimiento(req))
}
