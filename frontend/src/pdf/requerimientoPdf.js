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

// Tamaño carta (letter): 215.9 × 279.4 mm. Margen 20 mm en todos los lados
// para una presentación equilibrada al imprimir en impresora de oficina.
const MARGIN = 20
const ANCHO_PAGINA = 215.9
const ALTO_PAGINA = 279.4
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
      '', // CONTROL DE RECIBIDO: se deja en blanco para diligenciar a mano al recibir
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

// Replica exacta del formato institucional FO-GBS-36 (Requerimiento de
// Servicios). Maneja campos 1–6 y el pie de página completo; no necesita
// encabezadoSolicitante ni dibujarBloquesFirma.
async function dibujarCuerpoServicio(pdf, req, yInicial) {
  let y = yInicial
  const aw = ANCHO_UTIL
  const FOOTER_Y = ALTO_PAGINA - MARGIN + 5

  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.3)

  // Helper: nueva página si no hay espacio suficiente
  function guardar(mm) {
    if (y + mm > ALTO_PAGINA - MARGIN - 18) {
      pdf.addPage()
      y = MARGIN
    }
  }

  // ── CAMPOS 1–3: líneas numeradas ─────────────────────────────────────────
  // Cada campo dibuja el label en bold y el valor en normal en la misma línea.
  function campoLinea(num, label, valor) {
    guardar(9)
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    const prefijo = `${num}.  ${label}: `
    pdf.text(prefijo, MARGIN, y)
    pdf.setFont('helvetica', 'normal')
    const wPrefijo = pdf.getTextWidth(prefijo)
    const espacioValor = aw - wPrefijo
    const lineasValor = pdf.splitTextToSize(valor || '—', espacioValor)
    pdf.text(lineasValor, MARGIN + wPrefijo, y)
    y += Math.max(9, lineasValor.length * 5 + 4)
  }

  campoLinea('1', 'Fecha de Solicitud', fmtFechaPdf(req.fechaSolicitud || req.createdAt))
  campoLinea(
    '2',
    'Nombre y cargo de quien realiza la solicitud',
    [req.solicitante?.nombre, req.cargoSolicitante].filter(Boolean).join('  /  ') || '—',
  )
  campoLinea('3', 'Área o proceso que requiere el servicio', req.areaOProceso)
  y += 2

  // ── CAMPO 4: Descripción con caja bordeada ────────────────────────────────
  guardar(32)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'bold')
  pdf.text('4.  Descripción del tipo de servicio requerido:', MARGIN, y)
  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  const desc4 = req.detalleServicio?.descripcionTipoServicio
    ? pdf.splitTextToSize(req.detalleServicio.descripcionTipoServicio, aw - 4)
    : []
  const altoCaja4 = Math.max(18, desc4.length * 4.8 + 6)
  guardar(altoCaja4)
  pdf.rect(MARGIN, y, aw, altoCaja4)
  if (desc4.length) pdf.text(desc4, MARGIN + 2, y + 5)
  y += altoCaja4 + 6

  // ── CAMPO 5: Actividades — caja con 3 sub-secciones ──────────────────────
  guardar(16)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'bold')
  pdf.text('5.  Actividades a desarrollar por el contratista:', MARGIN, y)
  y += 5
  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(8)
  const instruc = pdf.splitTextToSize(
    '(Especifique: competencia, labores a desarrollar, y requisitos en materia de SST-A, que deba cumplir el contratista para aplicar al proceso de selección.)',
    aw,
  )
  pdf.text(instruc, MARGIN, y)
  y += instruc.length * 4.5 + 3

  // Calcula los altos de cada sub-sección antes de dibujar la caja grande,
  // para poder medir el total y hacer un solo rect (sin costuras visibles).
  function medirSubSeccion(labelTexto, contenido) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    const lineasLabel = pdf.splitTextToSize(labelTexto, aw - 4)
    const altoLabel = lineasLabel.length * 4.8 + 4
    pdf.setFont('helvetica', 'normal')
    const lineasContenido = contenido ? pdf.splitTextToSize(contenido, aw - 4) : []
    const altoContenido = Math.max(18, lineasContenido.length * 4.8 + 6)
    return { lineasLabel, altoLabel, lineasContenido, altoContenido, total: altoLabel + altoContenido }
  }

  const comp    = medirSubSeccion(
    'Competencia (Describa si aplica en términos de educación, formación y experiencia requerida):',
    req.detalleServicio?.competencia,
  )
  const labores = medirSubSeccion('Labores a desarrollar:', req.detalleServicio?.laboresADesarrollar)
  const sstA    = medirSubSeccion('Requisitos SST-A:', req.detalleServicio?.requisitosSST)
  const altoTotal5 = comp.total + labores.total + sstA.total

  guardar(altoTotal5)
  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.3)
  pdf.rect(MARGIN, y, aw, altoTotal5) // caja exterior única

  // Dibuja cada sub-sección: label en bold + contenido en normal, separados
  // por líneas horizontales internas.
  function dibujarSubSeccion(datos) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.text(datos.lineasLabel, MARGIN + 2, y + 4)
    if (datos.lineasContenido.length) {
      pdf.setFont('helvetica', 'normal')
      pdf.text(datos.lineasContenido, MARGIN + 2, y + datos.altoLabel + 4)
    }
    y += datos.total
  }

  dibujarSubSeccion(comp)
  pdf.line(MARGIN, y, MARGIN + aw, y)
  dibujarSubSeccion(labores)
  pdf.line(MARGIN, y, MARGIN + aw, y)
  dibujarSubSeccion(sstA)

  y += 7

  // ── CAMPO 6: Aprobación ───────────────────────────────────────────────────
  guardar(40)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'bold')
  pdf.text('6.  Aprobación de la solicitud:', MARGIN, y)
  y += 9

  // Checkboxes Aprobada / Rechazada
  const chkSize = 4
  const yChk = y - chkSize + 0.5
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text('Aprobada:', MARGIN, y)
  const wAprobada = pdf.getTextWidth('Aprobada:')
  pdf.rect(MARGIN + wAprobada + 2, yChk, chkSize, chkSize)

  const xRechazada = MARGIN + wAprobada + chkSize + 18
  pdf.text('Rechazada:', xRechazada, y)
  const wRechazada = pdf.getTextWidth('Rechazada:')
  pdf.rect(xRechazada + wRechazada + 2, yChk, chkSize, chkSize)

  // Rellena el checkbox según el estado del requerimiento
  const aprobado = ['aprobado', 'pendiente_bodega', 'completado'].includes(req.estado)
  const rechazado = req.estado === 'rechazado'
  if (aprobado) {
    pdf.setFillColor(0, 0, 0)
    pdf.rect(MARGIN + wAprobada + 2.5, yChk + 0.5, chkSize - 1, chkSize - 1, 'F')
  }
  if (rechazado) {
    pdf.setFillColor(0, 0, 0)
    pdf.rect(xRechazada + wRechazada + 2.5, yChk + 0.5, chkSize - 1, chkSize - 1, 'F')
  }
  y += 10

  // *Fecha de aprobación
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  const labelFecha = '*Fecha de aprobación:'
  pdf.text(labelFecha, MARGIN, y)
  if (req.financiero?.fechaDecision) {
    pdf.setFont('helvetica', 'normal')
    pdf.text(
      fmtFechaPdf(req.financiero.fechaDecision),
      MARGIN + pdf.getTextWidth(labelFecha) + 2,
      y,
    )
  }
  y += 8

  // *Nombre y cargo de quien aprueba
  pdf.setFont('helvetica', 'bold')
  const labelNombre = '*Nombre y cargo de quien aprueba la solicitud:'
  pdf.text(labelNombre, MARGIN, y)
  if (req.financiero?.nombreAprobador) {
    const wLabelN = pdf.getTextWidth(labelNombre + ' ')
    pdf.text(req.financiero.nombreAprobador, MARGIN + wLabelN, y)
  }
  y += 6
  if (req.financiero?.cargoAprobador) {
    pdf.setFont('helvetica', 'normal')
    // El cargo se centra a la derecha, bajo el nombre (igual que en la imagen)
    pdf.text(req.financiero.cargoAprobador, MARGIN + aw, y, { align: 'right' })
    y += 6
  }

  // ── PIE DE PÁGINA ─────────────────────────────────────────────────────────
  // Se añade en todas las páginas del documento una vez terminado el contenido.
  const totalPaginas = pdf.internal.getNumberOfPages()
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.text('VERSIÓN: 1', MARGIN, FOOTER_Y)
    pdf.text(`PAG: ${p} DE ${totalPaginas}`, MARGIN + aw, FOOTER_Y, { align: 'right' })
  }
}

async function dibujarBloquesFirma(pdf, req, yInicial) {
  const anchoBloque = 75
  const xFinanciero = MARGIN

  // Tope de la caja de firma: ancho generoso y alto de 30 mm para que
  // firmas grandes no queden recortadas. El escalado "contain" garantiza
  // que nunca se desborde en ningún eje.
  const ALTO_MAX_FIRMA = 30
  const ANCHO_MAX_FIRMA = anchoBloque - 6

  // Procesa la imagen en un canvas: fuerza cada píxel a negro puro
  // (R=G=B=0) y duplica su alpha. Las firmas digitales suelen guardarse
  // con trazos grises o semitransparentes que al imprimir quedan casi
  // invisibles; este paso los convierte en negro sólido sin alterar la
  // forma del trazo.
  function oscurecerFirma(dataUrl, w, h) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    const img = new Image()
    return new Promise((resolve) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, w, h)
        const data = imageData.data
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 0                                    // R → negro
          data[i + 1] = 0                                // G → negro
          data[i + 2] = 0                                // B → negro
          data[i + 3] = Math.min(255, data[i + 3] * 2)  // Alpha x2
        }
        ctx.putImageData(imageData, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = dataUrl
    })
  }

  // PASO 1: cargar la imagen y calcular dimensiones reales ANTES de
  // decidir la posición y en la página. Así el offset vertical usa el
  // alto efectivo de la firma (no el máximo teórico) y no deja hueco vacío.
  let datosFirma = null
  if (req.estado !== 'rechazado' && req.financiero?.firma?.url) {
    try {
      const { dataUrl, width, height } = await cargarImagen(req.financiero.firma.url)
      const escala = Math.min(ALTO_MAX_FIRMA / height, ANCHO_MAX_FIRMA / width)
      const anchoFirma = width * escala
      const altoFirma = height * escala
      const dataUrlOscura = await oscurecerFirma(dataUrl, width, height)
      datosFirma = { dataUrlOscura, anchoFirma, altoFirma }
    } catch (err) {
      // Sin firma disponible (red, CORS, asset borrado): el bloque de texto
      // sigue mostrando quién aprobó y cuándo — no bloquea el PDF.
      console.error('No se pudo cargar la firma en el PDF de requerimiento:', err)
    }
  }

  // PASO 2: calcular y con el alto REAL de la firma escalada + colchón.
  const altoFirmaReal = datosFirma?.altoFirma ?? ALTO_MAX_FIRMA
  let y = yInicial + altoFirmaReal + 4
  if (y > ALTO_PAGINA - 40) {
    pdf.addPage()
    y = MARGIN
  }

  // PASO 3: dibujar la firma en la posición definitiva (una sola vez).
  // La rúbrica flota sobre la línea, como en un documento impreso real.
  if (datosFirma) {
    pdf.addImage(
      datosFirma.dataUrlOscura,
      'PNG',
      xFinanciero + 3,
      y - datosFirma.altoFirma - 1,
      datosFirma.anchoFirma,
      datosFirma.altoFirma,
    )
  }

  // Línea de firma para Financiero
  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.3)
  pdf.line(xFinanciero, y, xFinanciero + anchoBloque, y)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('Financiero', xFinanciero, y + 5)
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
}

// Quita tildes/ñ y cualquier caracter no válido en un nombre de archivo, para
// que el nombre del solicitante quede legible en el PDF descargado.
function sanearParaArchivo(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function nombreArchivoPdfRequerimiento(req) {
  const fecha = new Date(req.fechaSolicitud || req.createdAt)
  const fechaTexto = Number.isNaN(fecha.getTime()) ? 'sin_fecha' : fecha.toISOString().slice(0, 10)
  const nombreTexto = sanearParaArchivo(req.solicitante?.nombre) || 'sin_nombre'
  // Sufijo con los últimos 6 caracteres del _id: fecha+nombre solos podrían
  // repetirse (mismo solicitante, mismo día, dos requerimientos) y pisarse
  // entre sí dentro del .zip de descarga masiva (backupPdfsRequerimientos.js).
  const sufijo = String(req._id || '').slice(-6)
  return `RQ_${fechaTexto}_${nombreTexto}_${sufijo}.pdf`
}

// Construye el documento sin guardarlo — separado de generarPdfRequerimiento
// para que el backup masivo (BackupPage.jsx, descarga en lote de PDFs ya
// aprobados+despachados) pueda meter el mismo PDF en un .zip en vez de
// disparar N descargas individuales del navegador.
export async function construirPdfRequerimiento(req) {
  const pdf = new jsPDF({ unit: 'mm', format: 'letter' })
  let y = await dibujarEncabezado(pdf, req.tipo)

  if (req.tipo === 'compra') {
    // Compra: encabezado de solicitante → tabla → análisis técnico → firma
    y = encabezadoSolicitante(pdf, req, y)
    y = dibujarTablaCompra(pdf, req, y)
    y = dibujarAnalisisTecnico(pdf, req, y)
    await dibujarBloquesFirma(pdf, req, y)
  } else {
    // Servicio: formato FO-GBS-36 completo (campos 1–6 + pie de página).
    // No usa encabezadoSolicitante ni dibujarBloquesFirma — todo está
    // integrado en dibujarCuerpoServicio para respetar el orden y el
    // diseño institucional de la imagen original.
    await dibujarCuerpoServicio(pdf, req, y)
  }

  return pdf
}

// Única función de descarga directa (no hay un generador por tipo): la
// invocan tanto RequerimientoDetallePage como BandejaBodegaPage.
export async function generarPdfRequerimiento(req) {
  const pdf = await construirPdfRequerimiento(req)
  pdf.save(nombreArchivoPdfRequerimiento(req))
}
