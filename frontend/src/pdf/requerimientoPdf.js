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

function oscurecerFirma(dataUrl, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const img = new Image()
  return new Promise((resolve) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      const srcData = ctx.getImageData(0, 0, width, height)
      const dstData = ctx.createImageData(width, height)
      const src = srcData.data
      const dst = dstData.data

      // Paso 1: Detectar píxeles que pertenecen al trazo de tinta (no fondo blanco o transparente)
      const esTinta = new Uint8Array(width * height)
      for (let i = 0, p = 0; i < src.length; i += 4, p++) {
        const r = src[i]
        const g = src[i + 1]
        const b = src[i + 2]
        const a = src[i + 3]
        if (a > 15 && (r < 210 || g < 210 || b < 210)) {
          esTinta[p] = 1
        }
      }

      // Paso 2: Dilatación morfológica (engrosamiento de trazo hacia los 8 vecinos para efecto negrilla/reteñido)
      const radio = 1
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x
          let tieneTintaCerca = false

          for (let dy = -radio; dy <= radio && !tieneTintaCerca; dy++) {
            for (let dx = -radio; dx <= radio; dx++) {
              const ny = y + dy
              const nx = x + dx
              if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                if (esTinta[ny * width + nx]) {
                  tieneTintaCerca = true
                  break
                }
              }
            }
          }

          const outIdx = idx * 4
          if (tieneTintaCerca) {
            dst[outIdx] = 0       // R: negro puro
            dst[outIdx + 1] = 0   // G: negro puro
            dst[outIdx + 2] = 0   // B: negro puro
            dst[outIdx + 3] = 255 // A: 100% opaco y reteñido (negrilla)
          } else {
            dst[outIdx + 3] = 0   // Transparente
          }
        }
      }

      ctx.putImageData(dstData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
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
const MARGIN = 20
const ANCHO_PAGINA = 215.9
const ALTO_PAGINA = 279.4
const ANCHO_UTIL = ANCHO_PAGINA - MARGIN * 2

async function dibujarEncabezado(pdf, tipo) {
  const formato = FORMATOS[tipo]
  const altoCaja = 25
  const anchoLogo = 28
  const anchoDatos = 39
  const anchoTitulo = ANCHO_UTIL - anchoLogo - anchoDatos

  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.4)
  pdf.rect(MARGIN, MARGIN, ANCHO_UTIL, altoCaja)
  pdf.line(MARGIN + anchoLogo, MARGIN, MARGIN + anchoLogo, MARGIN + altoCaja)
  pdf.line(MARGIN + anchoLogo + anchoTitulo, MARGIN, MARGIN + anchoLogo + anchoTitulo, MARGIN + altoCaja)
  pdf.line(MARGIN + anchoLogo + anchoTitulo, MARGIN + altoCaja / 2, ANCHO_PAGINA - MARGIN, MARGIN + altoCaja / 2)

  try {
    const { dataUrl, width, height } = await cargarImagen(LOGO_TERMINAL)
    const anchoDisponible = anchoLogo - 8
    const altoDisponible = altoCaja - 4
    const escala = Math.min(anchoDisponible / width, altoDisponible / height)
    const logoW = width * escala
    const logoH = height * escala
    pdf.addImage(dataUrl, 'PNG', MARGIN + (anchoLogo - logoW) / 2, MARGIN + (altoCaja - logoH) / 2, logoW, logoH)
  } catch (err) {
    console.error('No se pudo cargar el logo en el PDF de requerimiento:', err)
  }

  const xTitulo = MARGIN + anchoLogo + anchoTitulo / 2
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10.5)
  pdf.text('GESTIÓN DE BIENES Y SERVICIOS', xTitulo, MARGIN + 9.5, { align: 'center', maxWidth: anchoTitulo - 4 })
  pdf.setFontSize(12)
  pdf.text(formato.titulo, xTitulo, MARGIN + 18, { align: 'center', maxWidth: anchoTitulo - 4 })

  const xDatos = MARGIN + anchoLogo + anchoTitulo + anchoDatos / 2
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  pdf.text('CÓDIGO:', xDatos, MARGIN + 5, { align: 'center' })
  pdf.setFont('helvetica', 'bold')
  pdf.text(formato.codigo, xDatos, MARGIN + 9.5, { align: 'center' })
  pdf.text('VIGENCIA:', xDatos, MARGIN + 16.5, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  pdf.text(formato.vigencia, xDatos, MARGIN + 21, { align: 'center' })

  return MARGIN + altoCaja + 10
}

function encabezadoSolicitante(pdf, req, yInicial) {
  let y = yInicial
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.text('SOLICITANTE:', MARGIN, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text(req.solicitante?.nombre || '—', MARGIN + 36, y)
  y += 8

  pdf.setFont('helvetica', 'bold')
  pdf.text('CARGO:', MARGIN, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text(req.cargoSolicitante || '—', MARGIN + 36, y)
  y += 8

  return y + 3
}

const COLS_COMPRA = [
  { label: 'FECHA DE LA SOLICITUD', w: 22 },
  { label: 'DESCRIPCIÓN DEL PRODUCTO', w: 62 },
  { label: 'CANTIDAD', w: 22 },
  { label: 'DESTINO', w: 36 },
  { label: 'CONTROL DE RECIBIDO', w: 34 },
]

function dibujarTablaCompra(pdf, req, yInicial) {
  let y = yInicial
  const alturaFila = 7.4
  const alturaEncabezado = 14.5

  function dibujarEncabezadoTabla() {
    pdf.setDrawColor(15, 23, 42)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)

    let x = MARGIN
    for (const col of COLS_COMPRA) {
      pdf.rect(x, y, col.w, alturaEncabezado)
      x += col.w
    }

    x = MARGIN
    for (const col of COLS_COMPRA) {
      const lineas = pdf.splitTextToSize(col.label, col.w - 2)
      const altoTexto = (lineas.length * pdf.getLineHeight()) / pdf.internal.scaleFactor
      pdf.text(lineas, x + col.w / 2, y + (alturaEncabezado - altoTexto) / 2 + 2.3, { align: 'center' })
      x += col.w
    }
    y += alturaEncabezado
  }

  dibujarEncabezadoTabla()
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  const items = req.itemsCompra || []

  // Se agregan únicamente las filas de los productos reales por seguridad
  for (let fila = 0; fila < items.length; fila += 1) {
    const item = items[fila]
    const valores = [
      item ? fmtFechaPdf(item.fechaSolicitud) : '',
      item?.descripcionProducto || '',
      item ? String(item.cantidad ?? '') : '',
      item?.destino || '',
      '',
    ]

    let x = MARGIN
    for (let i = 0; i < COLS_COMPRA.length; i++) {
      const col = COLS_COMPRA[i]
      pdf.rect(x, y, col.w, alturaFila)
      if (valores[i]) {
        const linea = pdf.splitTextToSize(valores[i], col.w - 2)[0]
        pdf.text(linea, x + 1.2, y + 4.8)
      }
      x += col.w
    }
    y += alturaFila
  }

  return y + 6
}

function dibujarAnalisisTecnico(pdf, req, yInicial) {
  let y = yInicial
  const ALTO_CABECERA = 9

  // Auto-ajuste dinámico: calcula el espacio vertical libre antes de la firma Vo.Bo
  // para que el recuadro nunca invada ni se monte sobre la rúbrica del aprobador.
  const espacioRestante = (ALTO_PAGINA - MARGIN - 34) - yInicial
  const ALTO_CUERPO = Math.max(22, Math.min(38, espacioRestante - ALTO_CABECERA))

  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.4)

  // Celda de cabecera
  pdf.rect(MARGIN, y, ANCHO_UTIL, ALTO_CABECERA)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  const labelAnalisis =
    'ANALISIS TECNICO DEL REQUERIMIENTO (Este campo debe ser diligenciado por el Ingeniero de ' +
    'Sistemas cuando se requieren de servicios y productos tecnológicos)'
  const lineasLabel = pdf.splitTextToSize(labelAnalisis, ANCHO_UTIL - 4)
  pdf.text(lineasLabel, MARGIN + 2, y + 4.8)
  y += ALTO_CABECERA

  // Celda de cuerpo
  pdf.rect(MARGIN, y, ANCHO_UTIL, ALTO_CUERPO)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  const valorAnalisis = req.financiero?.analisisTecnico || 'N/A'
  const lineasValor = pdf.splitTextToSize(valorAnalisis, ANCHO_UTIL - 4)
  pdf.text(lineasValor, MARGIN + 2.5, y + 5.5)
  y += ALTO_CUERPO

  return y + 6
}

async function dibujarVoboCompra(pdf, req, yInicial) {
  // Posición de la línea de firma con espacio seguro debajo del recuadro de análisis
  const yLinea = Math.min(yInicial + 22, ALTO_PAGINA - MARGIN - 14)
  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.4)
  pdf.line(MARGIN, yLinea, MARGIN + 80, yLinea)

  const firmaUrl = req.financiero?.firma?.url || (typeof req.financiero?.firma === 'string' ? req.financiero?.firma : null)
  if (firmaUrl && req.estado !== 'rechazado') {
    try {
      const { dataUrl, width, height } = await cargarImagen(firmaUrl)
      const ALTO_MAX = 32
      const ANCHO_MAX = 95
      const escala = Math.min(ANCHO_MAX / width, ALTO_MAX / height)
      const anchoFirma = width * escala
      const altoFirma = height * escala
      const dataUrlOscura = await oscurecerFirma(dataUrl, width, height)
      pdf.addImage(
        dataUrlOscura,
        'PNG',
        MARGIN + (80 - anchoFirma) / 2,
        yLinea - altoFirma - 1,
        anchoFirma,
        altoFirma,
      )
    } catch (err) {
      console.error('No se pudo cargar la firma en el PDF de compra:', err)
    }
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text('Vo.Bo: ', MARGIN, yLinea + 4.5)
  pdf.setFont('helvetica', 'normal')
  pdf.text('Director Administrativo', MARGIN + pdf.getTextWidth('Vo.Bo: '), yLinea + 4.5)
}

// Replica exacta del formato institucional FO-GBS-36 (Requerimiento de Servicios) en 1 sola página.
async function dibujarCuerpoServicio(pdf, req, yInicial) {
  let y = yInicial
  const aw = ANCHO_UTIL
  const FOOTER_Y = ALTO_PAGINA - MARGIN + 5

  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.3)

  // ── CAMPOS 1–3: líneas numeradas con Arial 12 ────────────────────────────
  function campoLinea(num, label, valor) {
    const alturaLinea = pdf.getLineHeight() / pdf.internal.scaleFactor
    pdf.setFontSize(11.5)
    pdf.setFont('helvetica', 'bold')
    const prefijo = `${num}.  ${label}:`
    const wPrefijo = pdf.getTextWidth(prefijo) + 2.5
    const espacioValor = aw - wPrefijo

    // Si el espacio restante para el valor es demasiado estrecho (<60 mm)
    // se imprime el valor en la siguiente línea con sangría para evitar
    // que el texto quede apretado o se amontone con el siguiente campo.
    if (espacioValor < 60) {
      pdf.text(prefijo, MARGIN, y)
      y += alturaLinea
      pdf.setFont('helvetica', 'normal')
      const sangria = 6
      const lineasValor = pdf.splitTextToSize(valor || '—', aw - sangria)
      pdf.text(lineasValor, MARGIN + sangria, y)
      y += Math.max(alturaLinea, lineasValor.length * alturaLinea) + 2.5
    } else {
      pdf.text(prefijo, MARGIN, y)
      pdf.setFont('helvetica', 'normal')
      const lineasValor = pdf.splitTextToSize(valor || '—', espacioValor)
      pdf.text(lineasValor, MARGIN + wPrefijo, y)
      y += Math.max(alturaLinea + 2, lineasValor.length * alturaLinea + 2.5)
    }
  }

  campoLinea('1', 'Fecha de Solicitud', fmtFechaPdf(req.fechaSolicitud || req.createdAt))
  campoLinea(
    '2',
    'Nombre y cargo de quien realiza la solicitud',
    [req.solicitante?.nombre, req.cargoSolicitante].filter(Boolean).join('  /  ') || '—',
  )
  campoLinea('3', 'Área o proceso que requiere el servicio', req.areaOProceso || '—')

  // ── CAMPO 4: Descripción con caja bordeada amplia ─────────────────────────
  pdf.setFontSize(11.5)
  pdf.setFont('helvetica', 'bold')
  pdf.text('4.  Descripción del tipo de servicio requerido:', MARGIN, y)
  y += 4
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  const desc4 = req.detalleServicio?.descripcionTipoServicio
    ? pdf.splitTextToSize(req.detalleServicio.descripcionTipoServicio, aw - 4)
    : []
  const altoCaja4 = Math.max(22, desc4.length * 4.2 + 4)
  pdf.rect(MARGIN, y, aw, altoCaja4)
  if (desc4.length) pdf.text(desc4, MARGIN + 2.5, y + 4.5)
  y += altoCaja4 + 4.5

  // ── CAMPO 5: Actividades — caja amplia con 3 sub-secciones ────────────────
  pdf.setFontSize(11.5)
  pdf.setFont('helvetica', 'bold')
  pdf.text('5.  Actividades a desarrollar por el contratista:', MARGIN, y)
  y += 3.8
  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(8)
  const instruc = pdf.splitTextToSize(
    '(Especifique: competencia, labores a desarrollar, y requisitos en materia de SST-A, que deba cumplir el contratista para aplicar al proceso de selección.)',
    aw,
  )
  pdf.text(instruc, MARGIN, y)
  y += instruc.length * 3.2 + 2

  function medirSubSeccion(labelTexto, contenido, altoMinimo) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    const lineasLabel = pdf.splitTextToSize(labelTexto, aw - 4)
    const altoLabel = lineasLabel.length * 3.6 + 2.5
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    const lineasContenido = contenido ? pdf.splitTextToSize(contenido, aw - 4) : []
    const altoContenido = Math.max(6, lineasContenido.length * 3.6 + 2)
    return {
      lineasLabel,
      altoLabel,
      lineasContenido,
      altoContenido,
      total: Math.max(altoMinimo, altoLabel + altoContenido),
    }
  }

  const comp = medirSubSeccion(
    'Competencia (Describa si aplica en términos de educación, formación y experiencia requerida):',
    req.detalleServicio?.competencia,
    18,
  )
  const labores = medirSubSeccion('Labores a desarrollar:', req.detalleServicio?.laboresADesarrollar, 38)
  const sstA = medirSubSeccion('Requisitos SST-A:', req.detalleServicio?.requisitosSST, 20)
  const altoTotal5 = comp.total + labores.total + sstA.total

  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.3)
  pdf.rect(MARGIN, y, aw, altoTotal5)

  function dibujarSubSeccion(datos) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.text(datos.lineasLabel, MARGIN + 2, y + 3.2)
    if (datos.lineasContenido.length) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.text(datos.lineasContenido, MARGIN + 2, y + datos.altoLabel + 3)
    }
    y += datos.total
  }

  dibujarSubSeccion(comp)
  pdf.line(MARGIN, y, MARGIN + aw, y)
  dibujarSubSeccion(labores)
  pdf.line(MARGIN, y, MARGIN + aw, y)
  dibujarSubSeccion(sstA)

  y += 5

  // ── CAMPO 6: Aprobación ───────────────────────────────────────────────────
  pdf.setFontSize(11.5)
  pdf.setFont('helvetica', 'bold')
  pdf.text('6.  Aprobación de la solicitud:', MARGIN, y)
  y += 6.5

  // Checkboxes Aprobada / Rechazada
  const chkSize = 4
  const yChk = y - chkSize + 0.5
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10.5)
  pdf.text('Aprobada:', MARGIN, y)
  const wAprobada = pdf.getTextWidth('Aprobada:')
  pdf.rect(MARGIN + wAprobada + 2.5, yChk, chkSize, chkSize)

  const xRechazada = MARGIN + wAprobada + chkSize + 16
  pdf.text('Rechazada:', xRechazada, y)
  const wRechazada = pdf.getTextWidth('Rechazada:')
  pdf.rect(xRechazada + wRechazada + 2.5, yChk, chkSize, chkSize)

  const aprobado = req.estado === 'pendiente_bodega' || req.estado === 'aprobado' || req.estado === 'completado' || Boolean(req.financiero?.fechaDecision && req.estado !== 'rechazado')
  const rechazado = req.estado === 'rechazado'
  if (aprobado) {
    pdf.setFillColor(0, 0, 0)
    pdf.rect(MARGIN + wAprobada + 3, yChk + 0.5, chkSize - 1, chkSize - 1, 'F')
  }
  if (rechazado) {
    pdf.setFillColor(0, 0, 0)
    pdf.rect(xRechazada + wRechazada + 3, yChk + 0.5, chkSize - 1, chkSize - 1, 'F')
  }
  y += 7.5

  // *Fecha de aprobación
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10.5)
  const labelFecha = '*Fecha de aprobación:'
  pdf.text(labelFecha, MARGIN, y)
  if (req.financiero?.fechaDecision) {
    pdf.setFont('helvetica', 'normal')
    pdf.text(
      fmtFechaPdf(req.financiero.fechaDecision),
      MARGIN + pdf.getTextWidth(labelFecha) + 2.5,
      y,
    )
  }
  y += 7

  // *Nombre y cargo de quien aprueba la solicitud
  const labelNombre = '*Nombre y cargo de quien aprueba la solicitud:'
  const yNombre = y
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10.5)
  pdf.text(labelNombre, MARGIN, yNombre)

  const nombreAprobador = req.financiero?.nombreAprobador || 'KARENTH JULIETH FALLA NINCO'
  const cargoAprobador = req.financiero?.cargoAprobador || 'Dir. Administrativo y Gestión'

  // Firma del aprobador sobre el nombre y cargo en el lado derecho (+50% más grande)
  const firmaUrl = req.financiero?.firma?.url || (typeof req.financiero?.firma === 'string' ? req.financiero?.firma : null)
  if (firmaUrl && req.estado !== 'rechazado') {
    try {
      const { dataUrl, width, height } = await cargarImagen(firmaUrl)
      const ALTO_MAX = 32
      const ANCHO_MAX = 95
      const escala = Math.min(ANCHO_MAX / width, ALTO_MAX / height)
      const anchoF = width * escala
      const altoF = height * escala
      const dataUrlOscura = await oscurecerFirma(dataUrl, width, height)
      const xFirma = MARGIN + aw - anchoF - 5
      pdf.addImage(dataUrlOscura, 'PNG', xFirma, yNombre - altoF - 1.5, anchoF, altoF)
    } catch (err) {
      console.error('No se pudo cargar la firma en el PDF de servicio:', err)
    }
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text(nombreAprobador, MARGIN + aw, yNombre, { align: 'right' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10.5)
  pdf.text(cargoAprobador, MARGIN + aw, yNombre + 5, { align: 'right' })

  // ── PIE DE PÁGINA ─────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.text('VERSIÓN: 1', MARGIN, FOOTER_Y)
  pdf.text('PAG: 1 DE 1', MARGIN + aw, FOOTER_Y, { align: 'right' })
}

// Quita tildes/ñ y cualquier caracter no válido en un nombre de archivo
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
  const sufijo = String(req._id || '').slice(-6)
  return `RQ_${fechaTexto}_${nombreTexto}_${sufijo}.pdf`
}

function dibujarFooterCompra(pdf, formato) {
  const totalPaginas = pdf.internal.getNumberOfPages()
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    const footerY = ALTO_PAGINA - MARGIN + 5
    pdf.text(`VERSIÓN: ${formato.version}`, MARGIN, footerY)
    pdf.text(`PAG: ${p} DE ${totalPaginas}`, MARGIN + ANCHO_UTIL, footerY, { align: 'right' })
  }
}

export async function construirPdfRequerimiento(req) {
  const pdf = new jsPDF({ unit: 'mm', format: 'letter' })
  let y = await dibujarEncabezado(pdf, req.tipo)

  if (req.tipo === 'compra') {
    y = encabezadoSolicitante(pdf, req, y)
    y = dibujarTablaCompra(pdf, req, y)
    y = dibujarAnalisisTecnico(pdf, req, y)
    await dibujarVoboCompra(pdf, req, y)
    dibujarFooterCompra(pdf, FORMATOS.compra)
  } else {
    await dibujarCuerpoServicio(pdf, req, y)
  }

  return pdf
}

export async function generarPdfRequerimiento(req) {
  const pdf = await construirPdfRequerimiento(req)
  pdf.save(nombreArchivoPdfRequerimiento(req))
}
