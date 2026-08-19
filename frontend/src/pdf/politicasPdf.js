import { jsPDF } from 'jspdf'

// Genera el PDF descargable de las políticas del SGI a partir del mismo
// contenido mostrado en LegalPage. Documento de solo texto (sin logo/firma
// escaneada) por lo que no necesita el flujo de carga de imagen vía fetch
// que usa requerimientoPdf.js.

const MARGIN = 18
const ANCHO_PAGINA = 210
const ALTO_PAGINA = 297
const ANCHO_UTIL = ANCHO_PAGINA - MARGIN * 2

function nuevaPagina(pdf) {
  pdf.addPage()
  return MARGIN
}

function asegurarEspacio(pdf, y, alturaNecesaria) {
  if (y + alturaNecesaria > ALTO_PAGINA - MARGIN) return nuevaPagina(pdf)
  return y
}

function escribirTitulo(pdf, y, texto) {
  y = asegurarEspacio(pdf, y, 12)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.text(texto, MARGIN, y)
  return y + 7
}

function escribirParrafo(pdf, y, texto) {
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  const lineas = pdf.splitTextToSize(texto, ANCHO_UTIL)
  for (const linea of lineas) {
    y = asegurarEspacio(pdf, y, 6)
    pdf.text(linea, MARGIN, y)
    y += 5.2
  }
  return y + 2
}

function escribirLista(pdf, y, items) {
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  for (const item of items) {
    const lineas = pdf.splitTextToSize(`•  ${item}`, ANCHO_UTIL - 4)
    for (const [i, linea] of lineas.entries()) {
      y = asegurarEspacio(pdf, y, 6)
      pdf.text(linea, MARGIN + (i === 0 ? 0 : 4), y)
      y += 5.2
    }
  }
  return y + 2
}

export function generarPoliticasPdf({ fechaAprobacion = '25 de julio de 2026' } = {}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGIN

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text('Políticas del Sistema de Gestión Integral (SGI)', MARGIN, y)
  y += 6
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(90)
  pdf.text('Terminal de Transportes de Neiva S.A. · NIT 891.102.824-3', MARGIN, y)
  pdf.setTextColor(0)
  y += 10

  y = escribirTitulo(pdf, y, 'Alcance del Sistema de Gestión Integral')
  y = escribirParrafo(
    pdf,
    y,
    'Administración de Terminal de Transportes y operación de servicios de transporte, incluyendo los servicios auxiliares (arrendamiento inmobiliario y de baterías sanitarias) y sus servicios complementarios (zonas operativas) en sus instalaciones de la ciudad de Neiva.'
  )

  y = escribirTitulo(pdf, y, 'No aplicabilidad')
  y = escribirParrafo(
    pdf,
    y,
    'Bajo el modelo normativo ISO 9001:2015 no aplica el numeral 8.3 Diseño y Desarrollo de los productos y servicios, debido a que el servicio prestado en el Terminal de Transporte de Neiva se encuentra regulado por la normatividad legal vigente; por lo tanto, no se realizan actividades diferentes a las referidas en la norma.'
  )

  y = escribirTitulo(pdf, y, 'Objetivos del Sistema de Gestión Integral (SGI)')
  y = escribirLista(pdf, y, [
    'Propender por la generación de rentabilidad económica.',
    'Mejorar continuamente el SGI.',
    'Lograr la satisfacción del cliente.',
    'Garantizar el cumplimiento de los requisitos legales aplicables y otros requisitos que la organización suscriba.',
    'Prevenir y minimizar la contaminación por aspectos e impactos ambientales significativos en la prestación del servicio.',
    'Prevenir accidentes de trabajo y enfermedades laborales en la prestación del servicio.',
    'Promover la participación y consulta de los trabajadores en la planificación, implementación, evaluación y mejora continua del SGI.',
    'Mejorar la competencia del personal para la prestación del servicio.',
  ])

  y = escribirTitulo(pdf, y, 'Política del Sistema de Gestión Integral SGI')
  y = escribirParrafo(
    pdf,
    y,
    'El Terminal de Transportes de Neiva S.A. es una empresa dedicada a la administración de la operación de transporte como una unidad de servicios permanente en la ciudad de Neiva (Huila); que está comprometida a nivel directivo con el mejoramiento continuo del Sistema de Gestión Integral, estableciendo acciones de promoción del sistema de gestión integral, suministrando y garantizando los recursos para la planificación, implementación y seguimiento del Sistema de Gestión Integral, a partir del cumplimiento de los siguientes objetivos:'
  )
  y = escribirLista(pdf, y, [
    'Asegurar la satisfacción del cliente con respecto al cumplimiento de sus requisitos por parte de la organización.',
    'Cumplir la legislación colombiana aplicable y otros requisitos que haya suscrito la organización en materia de calidad, medio ambiente, seguridad y salud en el trabajo y de seguridad vial.',
    'Usar racionalmente los recursos naturales, disminuyendo los impactos ambientales de las actividades realizadas y de esta manera preservar el medio ambiente a través del establecimiento y la implementación de programas ambientales.',
    'Propiciar un ambiente de trabajo seguro y saludable, que permita la prevención de incidentes, accidentes de trabajo, enfermedades laborales y siniestros viales, con alcance sobre los desplazamientos laborales y los trayectos en itinere para todos sus colaboradores; mediante la gestión de los riesgos, a través de la identificación de peligros, la evaluación y valoración de los riesgos, estableciendo las medidas de control pertinentes y la identificación de oportunidades, que garanticen la seguridad y salud de los trabajadores.',
    'Fortalecer la competencia del personal y su compromiso con el Sistema de Gestión Integral, promoviendo la consulta y participación activa de los trabajadores en las diferentes actividades y programas de gestión.',
  ])
  y = escribirParrafo(pdf, y, 'Esta política deberá ser comunicada y estará disponible para todas las partes interesadas.')

  y = nuevaPagina(pdf)
  y = escribirTitulo(pdf, y, 'Política de prevención para el no consumo de alcohol, tabaco y sustancias psicoactivas')
  y = escribirParrafo(
    pdf,
    y,
    'El Terminal de Transportes de Neiva S.A., en su compromiso con el medio ambiente y la protección de la salud y el bienestar de sus trabajadores, adopta la presente política con el fin de garantizar un entorno libre de consumo de tabaco, aerosoles emitidos por sucedáneos e imitadores de alcohol y sustancias psicoactivas, y en consecuencia prohíbe la posesión, distribución, venta y/o consumo de los trabajadores, contratistas y subcontratistas en las instalaciones de la empresa o cualquier otro sitio, mientras se estén cumpliendo funciones propias del cargo o usando el uniforme o distintivos propios del Terminal, conforme a la Ley 1566 de 2012, la Ley 1335 de 2009 y la Resolución 089 de 2019 del Ministerio de Salud y Protección Social.'
  )
  y = escribirTitulo(pdf, y, 'Objetivo')
  y = escribirParrafo(
    pdf,
    y,
    'Establecer lineamientos claros para la prevención del consumo de sustancias que afectan la salud y el desempeño laboral, promoviendo la adopción de hábitos saludables y el cumplimiento de la normativa vigente en materia de seguridad y salud en el trabajo.'
  )
  y = escribirTitulo(pdf, y, 'Alcance')
  y = escribirParrafo(
    pdf,
    y,
    'Esta política aplica a todos los trabajadores, contratistas, usuarios, visitantes y cualquier persona que ingrese a las instalaciones del Terminal de Transportes de Neiva, conforme a lo dispuesto en la Ley 1566 de 2012, que reconoce el consumo de sustancias psicoactivas como un asunto de salud pública.'
  )
  y = escribirTitulo(pdf, y, 'Principios de la política')
  y = escribirLista(pdf, y, [
    'Prevención: desarrollo de programas de sensibilización y educación sobre los efectos nocivos del consumo de sustancias.',
    'Cumplimiento legal: aplicación de la normatividad vigente en materia de salud ocupacional.',
    'Intervención: apoyo a trabajadores que requieran orientación sobre prevención y tratamiento de adicciones.',
  ])
  y = escribirTitulo(pdf, y, 'Prohibiciones')
  y = escribirParrafo(
    pdf,
    y,
    'De conformidad con lo establecido en la Ley 1335 de 2009 y el Decreto 1072 de 2015, se prohíbe de manera estricta el consumo, porte, distribución, comercialización o cualquier tipo de tenencia de productos derivados del tabaco, bebidas alcohólicas y/o sustancias psicoactivas dentro de las instalaciones de la empresa, sin excepción alguna. Así mismo, se prohíbe el ingreso y permanencia de personas que se encuentren bajo los efectos de alcohol, tabaco o sustancias psicoactivas, por representar un riesgo para la seguridad, el ambiente laboral y el cumplimiento de las funciones asignadas. El incumplimiento podrá dar lugar a las sanciones disciplinarias correspondientes, conforme al reglamento interno de trabajo y la normatividad vigente.'
  )
  y = escribirTitulo(pdf, y, 'Prohibición a visitantes y entornos libres de humo')
  y = escribirParrafo(
    pdf,
    y,
    'Con fundamento en los artículos 18 y 19 de la Ley 1335 de 2009, el Terminal reconoce el derecho de las personas no fumadoras a respirar aire puro y libre de humo de tabaco. En consecuencia, queda estrictamente prohibido a todos los visitantes fumar o consumir productos derivados del tabaco, aerosoles, alcohol o sustancias psicoactivas dentro de las instalaciones cerradas del Terminal (áreas comunes, salas de espera, cafeterías, baños, andenes cubiertos y demás espacios señalados en la ley), así como ingresar o permanecer bajo sus efectos.'
  )
  y = escribirTitulo(pdf, y, 'Supervisión y cumplimiento')
  y = escribirParrafo(
    pdf,
    y,
    'El Terminal se reserva el derecho de realizar requisas, inspecciones y pruebas aleatorias sin previo aviso, conforme al artículo 56 del Código Sustantivo del Trabajo. Quienes incumplan esta política estarán sujetos a las medidas del Reglamento Interno de Trabajo (trabajadores) o al retiro inmediato de las instalaciones, con apoyo de la Policía Nacional en caso de reincidencia o negativa (visitantes y particulares), en aplicación del parágrafo del artículo 19 de la Ley 1335 de 2009.'
  )
  y = escribirTitulo(pdf, y, 'Vigencia y difusión')
  y = escribirParrafo(
    pdf,
    y,
    'Esta política será difundida entre los trabajadores, contratistas y subcontratistas de la organización por medio de avisos visibles al público, la página oficial del Terminal y circulares internas. Rige a partir de su fecha de aprobación.'
  )

  y = nuevaPagina(pdf)
  y = escribirTitulo(pdf, y, 'Política de no discriminación')
  y = escribirParrafo(
    pdf,
    y,
    'El Terminal de Transportes de Neiva S.A. está comprometido a ofrecer a todos sus colaboradores, proveedores, clientes y demás partes interesadas:'
  )
  y = escribirLista(pdf, y, [
    'Acciones de prevención y eliminación de todo acto de discriminación.',
    'Mecanismos de denuncia y rutas de atención para prevenir y solucionar eficaz y oportunamente los casos de discriminación que se puedan presentar en las actividades y procesos de la organización.',
    'Trato justo y equitativo a todos los clientes que requieren los servicios del Terminal, sin importar su condición física, raza, religión, ideología, cultura o cualquier otra situación que los distinga.',
    'Respeto por la diversidad y la individualidad, e igualdad de oportunidades.',
    'La propagación de una cultura plural y tolerante, y el rechazo absoluto a todo acto de violencia.',
    'La anulación de toda práctica que atente contra la dignidad de las personas.',
    'El impulso a la equidad de género y la equidad laboral.',
    'El respeto del derecho a la libre expresión de las ideas y la convivencia respetuosa e incluyente.',
  ])
  y = escribirParrafo(
    pdf,
    y,
    'En la organización se promueve la cultura de no discriminación hacia cualquier persona en aspectos de selección, contratación, promoción de cargos y condiciones de empleo, por motivos de sexo, raza, color de piel, edad, origen, nacionalidad, religión, discapacidad, orientación sexual, identidad de género, embarazo, creencia política, apariencia física, o cualquier otro factor que imposibilite la igualdad entre las personas, ya sean colaboradores, clientes y/o proveedores.'
  )
  y = escribirParrafo(
    pdf,
    y,
    'El personal del Terminal es responsable de cumplir con la igualdad de condiciones de trabajo que plantea esta política. Será difundida entre los trabajadores, contratistas y subcontratistas de la organización y rige a partir de su fecha de aprobación.'
  )

  y = asegurarEspacio(pdf, y, 20)
  y += 4
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text(`Revisadas y aprobadas, ${fechaAprobacion}.`, MARGIN, y)
  y += 10
  pdf.setFont('helvetica', 'bold')
  pdf.text('RAHDA HERMOSA CAMACHO', MARGIN, y)
  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.text('Gerente — Terminal de Transportes de Neiva S.A.', MARGIN, y)

  pdf.save('Politicas-SGI-Terminal-Neiva.pdf')
}
