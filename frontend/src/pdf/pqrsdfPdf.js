import { jsPDF } from 'jspdf'
import { LOGO_TERMINAL } from '../modules/induccion/induccionData.js'
import { cargarImagen } from './requerimientoPdf.js'

// Formato FO-AC-02 "PQRSDF" (Atención al Cliente, versión 9), prellenado con lo
// que el ciudadano escribió en el sitio web. Las firmas (cliente y funcionario)
// quedan en blanco a propósito: se firman a mano sobre la impresión.

const CODIGO = 'FO- AC-02'
const VIGENCIA = 'SEPTIEMBRE 20 DE 2026'
const VERSION = '9'

const M = 20
const ANCHO = 215.9
const ALTO = 279.4
const UTIL = ANCHO - M * 2
const ALTO_ENC = 26

// Helvetica del PDF solo trae Latin-1: las comillas, guiones y puntos
// suspensivos "tipográficos" (los que pone el teclado del celular) se pasan a su
// equivalente simple y lo que no tiene equivalente (emojis…) se quita, en vez
// de imprimir "??" en el formato.
const aLatin1 = (t) =>
  String(t ?? '')
    .normalize('NFC')
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•●]/g, '-')
    .replace(/[  -  ]/g, ' ')
    .replace(/[^\u0000-ÿ]/g, '')
const norm = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export const TIPOS = [
  ['peticion', 'PETICIÓN'],
  ['queja', 'QUEJA'],
  ['reclamo', 'RECLAMO'],
  ['sugerencia', 'SUGERENCIA'],
  ['denuncia', 'DENUNCIA'],
  ['felicidades', 'FELICIDADES'],
]
export const CALIDADES = [
  ['empresa', 'EMPRESA TRANSPORTADORA'],
  ['conductor', 'CONDUCTOR'],
  ['copropietario', 'COPROPIETARIO'],
  ['usuario', 'USUARIO'],
]
export const MEDIOS = [
  ['llamada', 'LLAMADA'],
  ['personalmente', 'PERSONALMENTE'],
  ['escrita', 'ESCRITA'],
]
export const TIPOS_DOC = [
  ['CC', 'CC'],
  ['CE', 'CE'],
  ['TI', 'TI'],
  ['PA', 'PASAPORTE'],
]

export const DATOS_VACIOS = {
  numero: '',
  fecha: '',
  hora: '',
  tipo: '',
  discriminacion: '',
  cualDiscriminacion: '',
  nombreCompleto: '',
  cedula: '',
  direccion: '',
  correo: '',
  telefono: '',
  calidad: '',
  servicio: '',
  medio: 'escrita',
  descripcion: '',
  nombres: '',
  apellidos: '',
  tipoDoc: '',
  pais: '',
  funcionario: '',
}

function partirFecha(valor) {
  const d = new Date(valor ? String(valor).replace(' ', 'T') : '')
  if (Number.isNaN(d.getTime())) return { fecha: '', hora: '' }
  return {
    fecha: d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
  }
}

function partirNombre(completo) {
  const p = String(completo || '').trim().split(/\s+/).filter(Boolean)
  if (p.length <= 1) return { nombres: p[0] || '', apellidos: '' }
  const corte = p.length === 3 ? 1 : Math.ceil(p.length / 2)
  return { nombres: p.slice(0, corte).join(' '), apellidos: p.slice(corte).join(' ') }
}

const tipoDesdeTexto = (t) => {
  const n = norm(t)
  return TIPOS.find(([k]) => n.includes(k.slice(0, 6)))?.[0] || ''
}

// Busca, entre los campos del radicado, el primero cuya etiqueta contenga alguna
// de las palabras (sin tildes ni mayúsculas) y que traiga un valor que no sea un adjunto.
function buscar(campos, palabras, excluir = []) {
  const c = (campos || []).find((x) => {
    const e = norm(x.etiqueta)
    return !x.adjunto && x.valor && palabras.some((p) => e.includes(p)) && !excluir.some((p) => e.includes(p))
  })
  return c ? String(c.valor).trim() : ''
}

const calidadDesdeTexto = (t) => {
  const n = norm(t)
  return CALIDADES.find(([k]) => n.includes(k.slice(0, 6)))?.[0] || ''
}
const medioDesdeTexto = (t) => {
  const n = norm(t)
  return MEDIOS.find(([k]) => n.includes(k.slice(0, 5)))?.[0] || ''
}
const siNoDesdeTexto = (t) => {
  const n = norm(t).trim()
  return n === 'si' ? 'si' : n === 'no' ? 'no' : ''
}
// "Cédula de ciudadanía (CC)", "Pasaporte"… -> CC / CE / TI / PA
const tipoDocDesdeTexto = (t) => {
  const n = norm(t)
  if (!n) return ''
  if (n.includes('pasaporte')) return 'PA'
  if (n.includes('extranj') || /\(ce\)/.test(n)) return 'CE'
  if (n.includes('tarjeta') || /\(ti\)/.test(n)) return 'TI'
  return 'CC'
}

// El formato no tiene casilla de ciudad ni de asunto, pero el sitio los pide:
// la ciudad va con la dirección y el asunto encabeza la descripción.
function conCiudad(direccion, ciudad) {
  if (!ciudad || norm(direccion).includes(norm(ciudad))) return direccion
  return direccion ? `${direccion}, ${ciudad}` : ciudad
}
function conAsunto(asunto, descripcion) {
  if (!asunto || norm(descripcion).startsWith(norm(asunto))) return descripcion
  return descripcion ? `Asunto: ${asunto}\n${descripcion}` : `Asunto: ${asunto}`
}

// Arma los datos del formato a partir del radicado y del funcionario que hace
// el trámite. Todo queda editable antes de descargar.
export function datosDesdeRadicado(radicado, usuario) {
  const campos = radicado?.campos || []
  const { fecha, hora } = partirFecha(radicado?.fecha)
  const nombreCompleto = buscar(campos, ['nombre', 'apellido'])
  const nombres = buscar(campos, ['nombres'])
  const apellidos = buscar(campos, ['apellidos'])
  const partes = partirNombre(nombreCompleto)
  // "Tipo de documento" también dice "documento": se excluye para no tomarlo por el número.
  const documento = buscar(campos, ['identificacion', 'cedula', 'documento'], ['tipo de documento'])
  const tipoDoc = tipoDocDesdeTexto(buscar(campos, ['tipo de documento']))
  const funcionario = [usuario?.nombre, usuario?.cargo].filter(Boolean).join(' - ')

  return {
    ...DATOS_VACIOS,
    numero: radicado?.radicado || '',
    fecha,
    hora,
    tipo: tipoDesdeTexto(buscar(campos, ['tipo de solicitud'])),
    calidad: calidadDesdeTexto(buscar(campos, ['tipo de usuario', 'calidad'])),
    discriminacion: siNoDesdeTexto(buscar(campos, ['discriminacion'], ['cual'])),
    cualDiscriminacion: buscar(campos, ['cual']),
    medio: medioDesdeTexto(buscar(campos, ['presentada mediante'])) || 'escrita',
    nombreCompleto: nombreCompleto || [nombres, apellidos].filter(Boolean).join(' '),
    cedula: documento,
    direccion: conCiudad(buscar(campos, ['direccion']), buscar(campos, ['ciudad', 'municipio'])),
    correo: radicado?.resumen?.correo || buscar(campos, ['correo', 'email', 'e-mail']),
    telefono: buscar(campos, ['telefono', 'celular', 'movil']),
    servicio: buscar(campos, ['servicio']),
    descripcion: conAsunto(
      buscar(campos, ['asunto', 'referencia']),
      buscar(campos, ['inquietud', 'comentario', 'descripcion', 'mensaje', 'situacion'], ['asunto']),
    ),
    nombres: nombres || partes.nombres,
    apellidos: apellidos || partes.apellidos,
    tipoDoc,
    funcionario,
  }
}

function encabezado(pdf, logo, pagina, total) {
  pdf.setDrawColor(0)
  pdf.setLineWidth(0.3)
  pdf.rect(M, M, UTIL, ALTO_ENC)
  const a = 34
  const b = 100
  pdf.line(M + a, M, M + a, M + ALTO_ENC)
  pdf.line(M + a + b, M, M + a + b, M + ALTO_ENC)
  pdf.line(M + a, M + ALTO_ENC / 2, M + a + b, M + ALTO_ENC / 2)
  pdf.line(M + a + b, M + ALTO_ENC / 2, M + UTIL, M + ALTO_ENC / 2)
  if (logo) {
    const e = Math.min((a - 6) / logo.width, (ALTO_ENC - 4) / logo.height)
    const w = logo.width * e
    const h = logo.height * e
    pdf.addImage(logo.dataUrl, 'PNG', M + (a - w) / 2, M + (ALTO_ENC - h) / 2, w, h)
  }
  pdf.setTextColor(0)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text('ATENCIÓN AL CLIENTE', M + a + b / 2, M + 7.5, { align: 'center' })
  pdf.text('PQRSDF', M + a + b / 2, M + ALTO_ENC / 2 + 7.5, { align: 'center' })
  const x = M + a + b + (UTIL - a - b) / 2
  pdf.text('CODIGO:', x, M + 5, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  pdf.text(CODIGO, x, M + 10, { align: 'center' })
  pdf.setFont('helvetica', 'bold')
  pdf.text('VIGENCIA:', x, M + ALTO_ENC / 2 + 5, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.text(VIGENCIA, x, M + ALTO_ENC / 2 + 9.5, { align: 'center' })
  pdf.setFontSize(7.5)
  pdf.text(`VERSIÓN: ${VERSION}`, M + 8, ALTO - 14)
  pdf.text(`PAG: ${pagina} DE ${total}`, M + UTIL, ALTO - 18, { align: 'right' })
}

// Etiqueta en negrita + valor sobre una línea. Devuelve el alto usado.
function campoLinea(pdf, etiqueta, valor, x, y, ancho) {
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text(etiqueta, x, y)
  const ex = x + pdf.getTextWidth(etiqueta) + 2
  pdf.setLineWidth(0.15)
  pdf.line(ex, y + 0.8, x + ancho, y + 0.8)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  let t = aLatin1(valor)
  while (t && pdf.getTextWidth(t) > x + ancho - ex - 1) t = t.slice(0, -1)
  pdf.text(t, ex + 0.5, y)
}

function marca(pdf, x, y, activa, cuadro = false) {
  if (cuadro) {
    pdf.setLineWidth(0.25)
    pdf.rect(x, y - 3.2, 3.6, 3.6)
    if (activa) {
      pdf.setFont('helvetica', 'bold')
      pdf.text('X', x + 0.8, y - 0.2)
    }
  } else {
    // "PETICIÓN____": la X va sobre el trazo.
    pdf.setLineWidth(0.15)
    pdf.line(x, y + 0.8, x + 6, y + 0.8)
    if (activa) {
      pdf.setFont('helvetica', 'bold')
      pdf.text('X', x + 2, y)
    }
  }
}

function opciones(pdf, lista, actual, x, y, { cuadro = false, separacion = 3 } = {}) {
  let cx = x
  for (const [clave, texto] of lista) {
    pdf.setFont('helvetica', cuadro ? 'bold' : 'normal')
    pdf.setFontSize(cuadro ? 9 : 8)
    pdf.text(texto, cx, y)
    cx += pdf.getTextWidth(texto) + 1.5
    marca(pdf, cx, y, actual === clave, cuadro)
    cx += (cuadro ? 3.6 : 6) + separacion
  }
}

export async function construirPdfPqrsdf(datos) {
  const d = { ...DATOS_VACIOS, ...datos }
  const pdf = new jsPDF({ unit: 'mm', format: 'letter' })
  let logo = null
  try {
    logo = await cargarImagen(LOGO_TERMINAL)
  } catch (err) {
    console.error('No se pudo cargar el logo en el PDF PQRSDF:', err)
  }

  // La descripción puede ser larga: si no cabe en el espacio del formato, el
  // resto sigue en una hoja adicional ("continuación") y nada se corta.
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  const lineasDesc = pdf.splitTextToSize(aLatin1(d.descripcion), UTIL - 2)
  // 11 renglones dejan la firma del cliente por encima del pie de página.
  const LINEAS_PAGINA = 11
  const enHoja1 = lineasDesc.slice(0, LINEAS_PAGINA)
  const resto = lineasDesc.slice(LINEAS_PAGINA)
  const total = resto.length ? 3 : 2

  // ── Página 1 ────────────────────────────────────────────────────────────────
  encabezado(pdf, logo, 1, total)
  let y = M + ALTO_ENC + 12
  campoLinea(pdf, 'No.', d.numero, M + 8, y, 50)
  y += 12
  campoLinea(pdf, 'FECHA:', d.fecha, M + 8, y, 62)
  campoLinea(pdf, 'HORA:', d.hora, M + 100, y, 62)
  y += 11
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text('TIPO:', M + 8, y)
  opciones(pdf, TIPOS, d.tipo, M + 19, y, { separacion: 2 })
  y += 7
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text('VICTIMA DE DISCRIMINACION', M + 8, y)
  opciones(pdf, [['si', 'SI'], ['no', 'NO']], d.discriminacion, M + 56, y, { separacion: 2 })
  campoLinea(pdf, 'CUAL?', d.cualDiscriminacion, M + 98, y, 62)
  y += 8
  campoLinea(pdf, 'NOMBRE: Y APELLIDO:', d.nombreCompleto, M + 8, y, UTIL - 8)
  y += 8
  campoLinea(pdf, 'CEDULA:', d.cedula, M + 8, y, 80)
  y += 8
  campoLinea(pdf, 'DIRECCIÓN:', d.direccion, M + 8, y, 110)
  y += 8
  campoLinea(pdf, 'CORREO ELECTRONICO:', d.correo, M + 8, y, 118)
  y += 8
  campoLinea(pdf, 'TELÉFONO:', d.telefono, M + 8, y, 70)
  y += 9
  opciones(pdf, CALIDADES.slice(0, 3), d.calidad, M + 8, y, { cuadro: true, separacion: 8 })
  y += 9
  opciones(pdf, CALIDADES.slice(3), d.calidad, M + 8, y, { cuadro: true })
  y += 11
  pdf.setFont('helvetica', 'bold')
  pdf.text('SERVICIO DONDE SE ORIGINA LA NO CONFORMIDAD:', M + 8, y)
  y += 6
  campoLinea(pdf, '', d.servicio, M + 8, y, 150)
  y += 9
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text('PRESENTADA MEDIANTE:', M + 8, y)
  opciones(pdf, MEDIOS, d.medio, M + 50, y, { separacion: 4 })
  y += 8
  pdf.setFont('helvetica', 'bold')
  pdf.text('DESCRIPCIÓN SITUACION PLANTEADA POR LA PARTE INTERESADA:', M + 8, y)
  y += 6
  pdf.setFont('helvetica', 'normal')
  pdf.setLineWidth(0.15)
  for (let i = 0; i < LINEAS_PAGINA; i++) {
    pdf.line(M + 8, y + 0.8, M + UTIL, y + 0.8)
    if (enHoja1[i]) pdf.text(enHoja1[i], M + 9, y)
    y += 5.6
  }
  y += 8
  pdf.setFont('helvetica', 'bold')
  pdf.text('FIRMA CLIENTE /USUARIO:', M + 8, y)
  pdf.line(M + 52, y + 0.8, M + 52 + 100, y + 0.8)

  // ── Página 2 ────────────────────────────────────────────────────────────────
  pdf.addPage()
  encabezado(pdf, logo, 2, total)
  y = M + ALTO_ENC + 10
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('NOMBRE, FIRMA Y CARGO FUNCIONARIO QUE RECIBE:', M, y)
  const ex = M + pdf.getTextWidth('NOMBRE, FIRMA Y CARGO FUNCIONARIO QUE RECIBE:') + 2
  pdf.setFont('helvetica', 'normal')
  pdf.line(ex, y + 0.8, M + UTIL, y + 0.8)
  pdf.text(aLatin1(d.funcionario), ex + 0.5, y)
  y += 9
  pdf.setFont('helvetica', 'bold')
  pdf.text('PRIVACIDAD Y AUTORIZACIÓN EXPRESA PARA EL TRATAMIENTO DE DATOS.', M + UTIL / 2, y, { align: 'center' })
  y += 6

  const parrafos = [
    'EL TERMINAL DE TRANSPORTES DE NEIVA S.A. en cumplimiento de lo definido en la Ley 1581 de 2012, el Decreto Reglamentario 1377 de 2013 y nuestra Política de protección de datos personales, le informa que los datos personales que usted suministre en virtud de las operaciones que solicite o celebre con EL TERMINAL DE TRANSPORTES DE NEIVA S.A.; serán tratados mediante el uso y mantenimiento de medidas de seguridad técnicas, físicas y administrativas a fin de impedir que terceros no autorizados accedan a los mismos, lo anterior de conformidad a lo definido en la Ley, el desarrollo de las funciones públicas delegadas por el Estado y aquellas propias de su actividad gremial.',
    'El responsable del tratamiento de sus datos personales es EL TERMINAL DE TRANSPORTES DE NEIVA S.A. domiciliada y ubicada en la Transversal 5 # 5-312 Módulo Centenario Piso 3 de la Ciudad de Neiva, quien los recogerá a través de sus diferentes canales y serán usados para: a) actividades de operación y registro; b) atender o formalizar cualquier tipo de trámite, producto o servicio que usted solicite o requiera; c) realizar encuestas, estadísticas, invitaciones o convocatorias por EL TERMINAL DE TRANSPORTES DE NEIVA S.A. o cualquiera de sus asociados de negocios; d) ofrecerle y/o informarle productos y/o servicios del TERMINAL DE TRANSPORTES DE NEIVA S.A. o cualquier de sus asociados de negocios; e) transferirlos a terceros, afiliados o asociados de negocios, de conformidad con las funciones regladas; f) cumplir las funciones establecidas en el Código de Comercio Colombiano, en el artículo 10 del Decreto 898 de 2002 y en las demás normas que complementen su marco jurídico operacional.',
    'Usted podrá ejercer los derechos que la Ley prevé, siguiendo los procedimientos que TERMINAL DE TRANSPORTES DE NEIVA S.A. proporciona para tales efectos, los cuales pueden conocer en la Política de Protección de Datos Personales publicada en la Página WEB y/o en la cartelera informativa del TERMINAL DE TRANSPORTES DE NEIVA S.A. para dudas e inquietudes relacionadas con estos temas deben escribirnos a: gerencia@elterminalneiva.com; es importante mencionar que, el ejercicio de sus derechos no es requisito previo ni impide el ejercicio de otro derecho; que cualquier modificación al presente aviso le será notificado a través de los medios que disponga EL TERMINAL DE TRANSPORTES DE NEIVA S.A. para tal fin.',
    'Leído lo anterior autorizo de manera previa, explícita e inequívoca al TERMINAL DE TRANSPORTES DE NEIVA S.A. y sus asociados de negocios para el tratamiento de los datos personales suministrados por mi persona dentro de las finalidades legales, contractuales, comerciales y las aquí contempladas. Declaro que soy el titular de la información reportada en este formulario para autorizar el tratamiento de mis datos personales, que le he suministrado de forma voluntaria y es completa, confiable, exacta y verídica.',
  ]
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  for (const p of parrafos) {
    const l = pdf.splitTextToSize(p, UTIL)
    pdf.text(l, M, y, { align: 'justify', maxWidth: UTIL })
    y += l.length * 3.5 + 3.5
  }
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.5)
  pdf.text('NOTA: Por favor diligenciar a maquina o letra imprenta. No se admiten tachones o enmendaduras. Los campos con (*) son obligatorios.', M, y)
  y += 6

  // Tabla de datos del titular.
  const mitad = UTIL * 0.58
  const h = 11
  const celda = (x, yy, w, titulo, valor) => {
    pdf.setLineWidth(0.25)
    pdf.rect(x, yy, w, h)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.text(titulo, x + 1.5, yy + 4)
    if (valor) {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      let t = aLatin1(valor)
      while (t && pdf.getTextWidth(t) > w - 3) t = t.slice(0, -1)
      pdf.text(t, x + 1.5, yy + 9)
    }
  }
  celda(M, y, mitad, '*NOMBRE(S)', d.nombres)
  celda(M + mitad, y, UTIL - mitad, '*APELLIDO(S)', d.apellidos)
  y += h
  celda(M, y, mitad, '*IDENTIFICACION: No.', d.cedula)
  pdf.rect(M + mitad, y, UTIL - mitad, h)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.text('*TIPO DE DOCUMENTO', M + mitad + 1.5, y + 4)
  const td = TIPOS_DOC.map(([k, t]) => (k === 'PA' ? `PASAPORTE${d.tipoDoc === 'PA' ? ' (X)' : ''}` : `${t}: ${d.tipoDoc === k ? 'X' : '__'}`))
  pdf.text(`${td.slice(0, 3).join('  ')}  ${td[3]}  PAIS: ${aLatin1(d.pais) || '______'}`, M + mitad + 1.5, y + 9)
  y += h
  celda(M, y, mitad, 'CORREO/MAIL:', d.correo)
  celda(M + mitad, y, UTIL - mitad, 'TELEFONO:', d.telefono)
  y += h
  celda(M, y, mitad, 'FECHA: DIA/MES/AÑO', d.fecha)
  celda(M + mitad, y, UTIL - mitad, '*FIRMA:', '')

  // ── Hoja de continuación de la descripción (solo si no cabió) ─────────────
  if (resto.length) {
    pdf.addPage()
    encabezado(pdf, logo, 3, total)
    let yy = M + ALTO_ENC + 10
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.text(`Continuación de la descripción · ${aLatin1(d.numero)}`, M, yy)
    yy += 7
    pdf.setFont('helvetica', 'normal')
    let pend = resto
    while (pend.length) {
      const caben = Math.max(1, Math.floor((ALTO - 30 - yy) / 4.8))
      pdf.text(pend.slice(0, caben), M, yy)
      pend = pend.slice(caben)
      if (pend.length) {
        pdf.addPage()
        encabezado(pdf, logo, pdf.internal.getNumberOfPages(), total)
        yy = M + ALTO_ENC + 10
      }
    }
  }
  return pdf
}

export const nombreArchivoPqrsdf = (datos) => `PQRSDF_${String(datos?.numero || 'formato').replace(/[^A-Za-z0-9-]+/g, '_')}.pdf`

export async function generarPdfPqrsdf(datos) {
  const pdf = await construirPdfPqrsdf(datos)
  pdf.save(nombreArchivoPqrsdf(datos))
}
