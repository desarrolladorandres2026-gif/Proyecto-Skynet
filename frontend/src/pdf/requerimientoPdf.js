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

// Umbral que mejor separa las dos poblaciones del histograma (papel y tinta):
// el que maximiza la varianza entre clases (método de Otsu).
function umbralOtsu(histograma, total) {
  let sumaTotal = 0
  for (let v = 0; v < 256; v++) sumaTotal += v * histograma[v]
  let sumaFondo = 0
  let pesoFondo = 0
  let mejorVarianza = -1
  let umbral = 128
  for (let v = 0; v < 256; v++) {
    pesoFondo += histograma[v]
    if (!pesoFondo) continue
    const pesoFrente = total - pesoFondo
    if (!pesoFrente) break
    sumaFondo += v * histograma[v]
    const mediaFondo = sumaFondo / pesoFondo
    const mediaFrente = (sumaTotal - sumaFondo) / pesoFrente
    const varianza = pesoFondo * pesoFrente * (mediaFondo - mediaFrente) ** 2
    if (varianza > mejorVarianza) {
      mejorVarianza = varianza
      umbral = v + 1
    }
  }
  return umbral
}

// Borra grupos de tinta aislados más pequeños que `minimo` píxeles (polvo,
// ruido de la cámara): no son trazo y estirarían el recorte de la firma.
function quitarMotas(esTinta, width, height, minimo) {
  const visitado = new Uint8Array(esTinta.length)
  const pila = new Int32Array(esTinta.length)
  const grupo = []
  for (let inicio = 0; inicio < esTinta.length; inicio++) {
    if (!esTinta[inicio] || visitado[inicio]) continue
    let tope = 0
    pila[tope++] = inicio
    visitado[inicio] = 1
    grupo.length = 0
    while (tope) {
      const p = pila[--tope]
      grupo.push(p)
      const x = p % width
      const y = (p - x) / width
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const q = ny * width + nx
          if (esTinta[q] && !visitado[q]) {
            visitado[q] = 1
            pila[tope++] = q
          }
        }
      }
    }
    if (grupo.length < minimo) for (const p of grupo) esTinta[p] = 0
  }
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
      const total = width * height

      // Paso 1: Luminancia de cada píxel "sobre papel blanco". Un gris que
      // Cloudinary dejó casi transparente cuenta como claro, no como tinta.
      const lum = new Uint8Array(total)
      const histograma = new Uint32Array(256)
      for (let i = 0, p = 0; i < src.length; i += 4, p++) {
        const alfa = src[i + 3] / 255
        const l = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]
        const v = Math.round(255 - alfa * (255 - l))
        lum[p] = v
        histograma[v]++
      }

      // Paso 2: Tinta = más oscuro que el umbral de Otsu de ESTA foto. Un umbral
      // fijo (antes "< 210") convertía en negro el papel gris o con sombra y la
      // firma salía sobre un recuadro oscuro en vez de fondo transparente.
      // El tope de 150 evita que una sombra suave del papel cuente como trazo.
      const umbral = Math.min(umbralOtsu(histograma, total), 150)
      const esTinta = new Uint8Array(total)
      for (let p = 0; p < total; p++) {
        if (lum[p] < umbral) esTinta[p] = 1
      }
      quitarMotas(esTinta, width, height, Math.max(6, Math.round(total * 0.00003)))

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

// Recorta la firma (ya oscurecida: tinta opaca sobre fondo transparente) al
// rectángulo que ocupa el trazo. Sin esto, el margen vacío que trae la imagen
// deja la rúbrica flotando por encima de la raya del Vo.Bo.
function recortarFirma(dataUrl) {
  const img = new Image()
  return new Promise((resolve) => {
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img
      const sinRecorte = { dataUrl, width: w, height: h }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      const px = ctx.getImageData(0, 0, w, h).data

      let minX = w
      let minY = h
      let maxX = -1
      let maxY = -1
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (px[(y * w + x) * 4 + 3] > 0) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      if (maxX < 0) return resolve(sinRecorte)

      const ancho = maxX - minX + 1
      const alto = maxY - minY + 1
      const recorte = document.createElement('canvas')
      recorte.width = ancho
      recorte.height = alto
      recorte.getContext('2d').drawImage(canvas, minX, minY, ancho, alto, 0, 0, ancho, alto)
      resolve({ dataUrl: recorte.toDataURL('image/png'), width: ancho, height: alto })
    }
    img.onerror = () => resolve(null)
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
// Borde inferior del contenido: debajo solo va el pie (VERSIÓN / PAG).
const LIMITE_Y = ALTO_PAGINA - MARGIN
const ALTO_ENCABEZADO = 25
// Primera Y libre debajo del encabezado institucional (igual en toda hoja).
const Y_TRAS_ENCABEZADO = MARGIN + ALTO_ENCABEZADO + 10
// Caja máxima de la rúbrica del Vo.Bo (compra), ya recortada al trazo. Si
// sale más ancha que la raya de firma, la raya se alarga hasta cubrirla.
const ANCHO_FIRMA_COMPRA = 100
const ALTO_MAX_FIRMA_COMPRA = 34

// Interlineado real (mm) de la fuente activa: el mismo que usa
// pdf.text(arrayDeLineas), así cajas y texto miden lo mismo.
function altoLinea(pdf) {
  return pdf.getLineHeight() / pdf.internal.scaleFactor
}

// Se carga una sola vez por PDF: el encabezado se repite en cada hoja de
// continuación cuando la descripción de los ítems no cabe en una sola.
async function cargarLogo() {
  try {
    return await cargarImagen(LOGO_TERMINAL)
  } catch (err) {
    console.error('No se pudo cargar el logo en el PDF de requerimiento:', err)
    return null
  }
}

function dibujarEncabezado(pdf, tipo, logo) {
  const formato = FORMATOS[tipo]
  const altoCaja = ALTO_ENCABEZADO
  const anchoLogo = 28
  const anchoDatos = 39
  const anchoTitulo = ANCHO_UTIL - anchoLogo - anchoDatos

  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.4)
  pdf.rect(MARGIN, MARGIN, ANCHO_UTIL, altoCaja)
  pdf.line(MARGIN + anchoLogo, MARGIN, MARGIN + anchoLogo, MARGIN + altoCaja)
  pdf.line(MARGIN + anchoLogo + anchoTitulo, MARGIN, MARGIN + anchoLogo + anchoTitulo, MARGIN + altoCaja)
  pdf.line(MARGIN + anchoLogo + anchoTitulo, MARGIN + altoCaja / 2, ANCHO_PAGINA - MARGIN, MARGIN + altoCaja / 2)

  if (logo) {
    const { dataUrl, width, height } = logo
    const anchoDisponible = anchoLogo - 8
    const altoDisponible = altoCaja - 4
    const escala = Math.min(anchoDisponible / width, altoDisponible / height)
    const logoW = width * escala
    const logoH = height * escala
    pdf.addImage(dataUrl, 'PNG', MARGIN + (anchoLogo - logoW) / 2, MARGIN + (altoCaja - logoH) / 2, logoW, logoH)
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

  return Y_TRAS_ENCABEZADO
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

function dibujarTablaCompra(pdf, req, yInicial, nuevaPagina) {
  let y = yInicial
  // Alto de una fila de 1 línea; cada línea extra suma un interlineado.
  const ALTO_FILA_MIN = 7.4
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

  function saltarPagina() {
    y = nuevaPagina()
    dibujarEncabezadoTabla()
  }

  dibujarEncabezadoTabla()
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  const L = altoLinea(pdf)
  const lineasQueCaben = (espacio) => Math.floor((espacio - ALTO_FILA_MIN) / L) + 1
  const cabenEnPaginaNueva = lineasQueCaben(LIMITE_Y - Y_TRAS_ENCABEZADO - alturaEncabezado)

  // Se agregan únicamente las filas de los productos reales por seguridad
  for (const item of req.itemsCompra || []) {
    const valores = [
      fmtFechaPdf(item.fechaSolicitud),
      item.descripcionProducto || '',
      String(item.cantidad ?? ''),
      item.destino || '',
      '',
    ]
    // Todas las líneas de cada celda (antes se tomaba solo la [0] y una
    // descripción larga salía cortada en el PDF impreso).
    let pendientes = valores.map((v, i) => (v ? pdf.splitTextToSize(v, COLS_COMPRA[i].w - 2.4) : []))

    for (;;) {
      const lineasFila = Math.max(1, ...pendientes.map((l) => l.length))
      const caben = lineasQueCaben(LIMITE_Y - y)
      // Una fila que cabe entera en una hoja nueva no se parte: pasa completa
      // a la siguiente. Solo se parte la que no cabría en ninguna hoja.
      if (caben < lineasFila && (caben < 1 || lineasFila <= cabenEnPaginaNueva)) {
        saltarPagina()
        continue
      }

      const n = Math.min(lineasFila, caben)
      const altoFila = ALTO_FILA_MIN + (n - 1) * L
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      let x = MARGIN
      COLS_COMPRA.forEach((col, i) => {
        pdf.rect(x, y, col.w, altoFila)
        const trozo = pendientes[i].slice(0, n)
        if (trozo.length) pdf.text(trozo, x + 1.2, y + 4.8)
        x += col.w
      })
      y += altoFila

      pendientes = pendientes.map((l) => l.slice(n))
      if (pendientes.every((l) => l.length === 0)) break
      saltarPagina()
    }
  }

  return y + 6
}

function dibujarAnalisisTecnico(pdf, req, yInicial, nuevaPagina) {
  let y = yInicial
  const ALTO_CABECERA = 9
  // Aire + rúbrica más alta posible + raya y rótulo del Vo.Bo, para que en
  // una hoja con texto corto la firma quepa debajo sin saltar de página.
  const RESERVA_VOBO = 6 + ALTO_MAX_FIRMA_COMPRA + 1 + 6
  const PADDING = 4

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  const L = altoLinea(pdf)
  const lineasQueCaben = (espacio) => Math.floor((espacio - PADDING) / L)
  const lineas = pdf.splitTextToSize(req.financiero?.analisisTecnico || 'N/A', ANCHO_UTIL - 5)

  // Cabecera y primeras líneas van juntas: si el texto cabría entero en una
  // hoja nueva (o aquí no caben ni 3 líneas), todo el bloque pasa a la siguiente.
  const cabenAqui = lineasQueCaben(LIMITE_Y - y - ALTO_CABECERA)
  const cabenEnPaginaNueva = lineasQueCaben(LIMITE_Y - Y_TRAS_ENCABEZADO - ALTO_CABECERA)
  if (lineas.length > cabenAqui && (lineas.length <= cabenEnPaginaNueva || cabenAqui < 3)) {
    y = nuevaPagina()
  }

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

  // Celda de cuerpo: crece con el texto y, si no cabe ni en una hoja, sigue
  // en la siguiente.
  let pendientes = lineas
  for (;;) {
    const trozo = pendientes.slice(0, lineasQueCaben(LIMITE_Y - y))
    pendientes = pendientes.slice(trozo.length)
    let alto = trozo.length * L + PADDING
    if (!pendientes.length) {
      // Texto corto: se conserva el alto del formato (22–38 mm, lo que quepa
      // antes del Vo.Bo) para que el recuadro se pueda diligenciar a mano.
      const altoFormato = Math.max(22, Math.min(38, LIMITE_Y - RESERVA_VOBO - y))
      alto = Math.max(alto, Math.min(altoFormato, LIMITE_Y - y))
    }

    pdf.setDrawColor(15, 23, 42)
    pdf.setLineWidth(0.4)
    pdf.rect(MARGIN, y, ANCHO_UTIL, alto)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(trozo, MARGIN + 2.5, y + 5.5)
    y += alto

    if (!pendientes.length) break
    y = nuevaPagina()
  }

  // Borde inferior del recuadro: el aire hasta el Vo.Bo lo decide dibujarVoboCompra.
  return y
}

async function cargarFirmaCompra(req) {
  const firmaUrl = req.financiero?.firma?.url || (typeof req.financiero?.firma === 'string' ? req.financiero?.firma : null)
  if (!firmaUrl || req.estado === 'rechazado') return null
  try {
    const { dataUrl, width, height } = await cargarImagen(firmaUrl)
    const oscura = await oscurecerFirma(dataUrl, width, height)
    const firma = (await recortarFirma(oscura)) || { dataUrl: oscura, width, height }
    const escala = Math.min(ANCHO_FIRMA_COMPRA / firma.width, ALTO_MAX_FIRMA_COMPRA / firma.height)
    return { dataUrl: firma.dataUrl, ancho: firma.width * escala, alto: firma.height * escala }
  } catch (err) {
    console.error('No se pudo cargar la firma en el PDF de compra:', err)
    return null
  }
}

async function dibujarVoboCompra(pdf, req, yInicial, nuevaPagina) {
  const firma = await cargarFirmaCompra(req)
  const ANCHO_LINEA = Math.max(80, firma ? firma.ancho : 0)

  // yInicial es el borde inferior del recuadro de Análisis técnico. La rúbrica
  // se apoya sobre la raya y crece hacia arriba: la raya baja justo lo
  // necesario para dejar AIRE_FIRMA entre el recuadro y el punto más alto del
  // trazo. Sin firma (aún sin aprobar) se deja el espacio de siempre para
  // firmar a mano.
  const AIRE_FIRMA = 2
  // Cuánto baja el trazo por debajo de la raya, como una firma hecha a mano
  // que la cruza. Más de ~1.5 mm empezaría a pisar el rótulo "Vo.Bo".
  const SOLAPE_FIRMA = 1.5
  const separacion = firma ? AIRE_FIRMA + firma.alto - SOLAPE_FIRMA : 28
  let yLinea = yInicial + separacion
  // Raya + rótulo "Vo.Bo" no caben sin pisar el pie: todo pasa a la hoja siguiente.
  if (yLinea + 6 + SOLAPE_FIRMA > LIMITE_Y) yLinea = nuevaPagina() + separacion

  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.4)
  pdf.line(MARGIN, yLinea, MARGIN + ANCHO_LINEA, yLinea)

  if (firma) {
    // La imagen viene recortada a la tinta: su borde inferior es el punto más
    // bajo del trazo, que queda SOLAPE_FIRMA por debajo de la raya.
    pdf.addImage(firma.dataUrl, 'PNG', MARGIN + (ANCHO_LINEA - firma.ancho) / 2, yLinea - firma.alto + SOLAPE_FIRMA, firma.ancho, firma.alto)
  }

  // El rótulo baja lo mismo que el trazo cruza la raya, para no pisarlo.
  const yRotulo = yLinea + 4.5 + (firma ? SOLAPE_FIRMA : 0)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text('Vo.Bo: ', MARGIN, yRotulo)
  pdf.setFont('helvetica', 'normal')
  pdf.text('Director Administrativo', MARGIN + pdf.getTextWidth('Vo.Bo: '), yRotulo)
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
  const logo = await cargarLogo()
  // Hoja de continuación: repite el encabezado institucional y devuelve la Y libre.
  const nuevaPagina = () => {
    pdf.addPage()
    return dibujarEncabezado(pdf, req.tipo, logo)
  }
  let y = dibujarEncabezado(pdf, req.tipo, logo)

  if (req.tipo === 'compra') {
    y = encabezadoSolicitante(pdf, req, y)
    y = dibujarTablaCompra(pdf, req, y, nuevaPagina)
    y = dibujarAnalisisTecnico(pdf, req, y, nuevaPagina)
    await dibujarVoboCompra(pdf, req, y, nuevaPagina)
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
