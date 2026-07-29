// Contenido de la inducción institucional (Terminal de Transportes de Neiva),
// migrado desde /induccion/*.html a datos planos. El HTML de cada sección es
// de confianza (autoría propia, no viene de usuarios) y se renderiza con
// dangerouslySetInnerHTML en ModuloPage — evita reinventar cada lista/imagen
// como un componente propio para 6 módulos con forma muy distinta entre sí.
//
// icono: sí es UI real (ModuloAcordeon lo renderiza como <Icon/>, no como
// HTML), así que usa componentes lucide-react en vez de emoji — a diferencia
// de los emojis decorativos dentro de los strings `html` de cada sección,
// que son contenido editorial del curso y quedan fuera de esa regla.
import { Building2, ClipboardList, Shield, Siren, Leaf, TrafficCone } from 'lucide-react'

export const RUTA_ASSETS = '/storage/induccion'

const L = RUTA_ASSETS + '/logos'
const I = RUTA_ASSETS + '/images'
const V = RUTA_ASSETS + '/videos'
const D = RUTA_ASSETS + '/docs'

export const LOGO_TERMINAL = `${L}/logo_terminal.png`
export const AGENTE_IA = `${L}/agente.png`

export const MODULOS = [
  {
    id: 1,
    titulo: 'Identidad Corporativa',
    icono: Building2,
    video: { src: `${V}/Historiaterminal1.mp4`, titulo: 'Historia del Terminal de Transportes de Neiva' },
    narracion: [
      'Hola, soy tu asistente virtual y te acompañaré en esta inducción. Vamos a recorrer juntos la historia, misión, visión y valores del Terminal de Transportes de Neiva. ¡Comencemos!',
      'El Terminal de Transportes de Neiva es una infraestructura que facilita la operación de diversas empresas de transporte, dividida en los módulos Antiguo, Regional y Centenario. No vende pasajes ni enruta; administra la operación y orienta a los usuarios.',
      'Nuestra misión es facilitar la administración y operación del transporte terrestre de pasajeros y servicios complementarios, con talento humano competente, buscando la satisfacción de los clientes.',
      'Nuestra visión: para 2025, ser una organización sostenible en la administración del transporte terrestre, reconocida como eje de integración.',
      'Nuestros principios corporativos son la satisfacción al cliente, el liderazgo y crecimiento del talento humano, y la responsabilidad ambiental.',
      'Y finalmente, nuestros valores éticos: lealtad, responsabilidad, honestidad, respeto, eficiencia, compromiso, competitividad y solidaridad.',
      'Perfecto, has llegado al final del módulo. Ya puedes realizar el quiz para reforzar lo aprendido.',
    ],
    secciones: [
      {
        id: 'historia',
        titulo: 'Historia',
        html: `
          <p class="ind-lead">El Terminal de Transportes de Neiva inició sus operaciones con el objetivo de ofrecer transporte terrestre seguro y confiable. A lo largo de los años, hemos crecido y adaptado nuestros servicios, incorporando tecnología, talento humano capacitado y procesos eficientes, siempre buscando satisfacer las necesidades de nuestros pasajeros y contribuir al desarrollo de la región.</p>
          <div class="ind-box">
            <p>El Terminal de Transportes de Neiva es una infraestructura que facilita la operación de diversas empresas de transporte. Está dividido en tres módulos:</p>
            <ul class="ind-list">
              <li><strong>Módulo Antiguo (Propiedad Horizontal):</strong> Atiende servicios mixtos de corta y mediana distancia a nivel nacional.</li>
              <li><strong>Módulo Regional:</strong> Se enfoca en rutas de corta distancia dentro del departamento del Huila.</li>
              <li><strong>Módulo Centenario:</strong> Ofrece servicios de lujo para rutas nacionales.</li>
            </ul>
            <p>El terminal no vende pasajes, ni despacha o enruta las rutas; su función principal es administrar la operación, registrando llegadas y salidas, y orientar a los usuarios.</p>
            <p>Además, cuenta con servicios complementarios (como baterías sanitarias) y suplementarios (corresponsales bancarios, cajeros electrónicos, restaurantes, cafeterías y dulcerías) para garantizar la comodidad de los usuarios.</p>
            <p>El Terminal de Transportes de Neiva forma parte del servicio conexo al transporte, asegurando los pilares de calidad, accesibilidad, seguridad y equidad en su operación.</p>
          </div>
        `,
      },
      {
        id: 'mision',
        titulo: 'Misión',
        html: `<p class="ind-lead">Facilitar la administración y operación del transporte terrestre de pasajeros y servicios complementarios, con talento humano competente, tecnología e infraestructura adecuada, buscando la satisfacción de los clientes y contribuyendo al desarrollo socio-urbanístico de Neiva y su área de influencia.</p>`,
      },
      {
        id: 'vision',
        titulo: 'Visión',
        html: `<p class="ind-lead">Para 2025, ser una organización sostenible en la administración del transporte terrestre de pasajeros, reconocida como eje de integración, ofreciendo servicios complementarios que beneficien a clientes y partes interesadas.</p>`,
      },
      {
        id: 'principios',
        titulo: 'Principios Corporativos',
        html: `
          <ul class="ind-list">
            <li>Satisfacción al cliente</li>
            <li>Liderazgo y crecimiento del talento humano</li>
            <li>Responsabilidad ambiental</li>
          </ul>
        `,
      },
      {
        id: 'valores',
        titulo: 'Valores Éticos',
        html: `
          <p class="ind-lead">La sociedad Terminal de Transportes de Neiva tiene definidos los siguientes valores éticos que guían su funcionamiento:</p>
          <div class="ind-grid">
            ${['Lealtad', 'Responsabilidad', 'Honestidad', 'Respeto', 'Eficiencia', 'Compromiso', 'Competitividad', 'Solidaridad']
              .map((v) => `<div class="ind-tile" style="max-width:150px"><h4>${v}</h4></div>`)
              .join('')}
          </div>
        `,
      },
    ],
  },

  {
    id: 2,
    titulo: 'Gestión Institucional',
    icono: ClipboardList,
    video: null,
    narracion: [
      'Hola de nuevo, bienvenido al módulo dos de tu proceso de inducción. En este espacio conocerás nuestras políticas institucionales, los objetivos del Sistema de Gestión Integral y las certificaciones que respaldan nuestro compromiso con la calidad.',
      'Comencemos con las políticas institucionales. Descárgalas y léelas con atención, ya que guían nuestras acciones y reflejan los valores de la empresa.',
      'A continuación, revisa los objetivos del Sistema de Gestión Integral. Estos muestran hacia dónde dirigimos nuestros esfuerzos para mejorar continuamente y brindar un servicio de excelencia.',
      'Luego, observa el mapa de procesos institucional. Allí verás cómo se conectan nuestras áreas para lograr los resultados que nos proponemos cada día.',
      'Y para finalizar, conoce nuestras certificaciones. Ellas demuestran el compromiso del Terminal de Transportes de Neiva con la calidad, el medio ambiente y la seguridad de todos.',
      '¡Excelente! Has completado el módulo dos. Ya puedes realizar el quiz para continuar con la siguiente etapa.',
    ],
    secciones: [
      {
        id: 'politicas',
        titulo: 'Políticas Institucionales',
        html: `
          <div class="ind-box">
            <p>Descarga y lee detenidamente cada una de las políticas institucionales de la empresa:</p>
            <div class="ind-downloads">
              <a class="panel-btn-secundario rounded-lg px-3 py-2 text-sm inline-block" href="${D}/politica_sistema_de_gestion_integral.pdf" download>📄 Política del Sistema de Gestión Integral</a>
              <a class="panel-btn-secundario rounded-lg px-3 py-2 text-sm inline-block" href="${D}/politica_alcohol_y_drogas.pdf" download>📄 Política de Alcohol y Drogas</a>
              <a class="panel-btn-secundario rounded-lg px-3 py-2 text-sm inline-block" href="${D}/politica_desconexion_laboral.pdf" download>📄 Política de Desconexión Laboral</a>
              <a class="panel-btn-secundario rounded-lg px-3 py-2 text-sm inline-block" href="${D}/politica_discriminacion.pdf" download>📄 Política de No Discriminación</a>
              <a class="panel-btn-secundario rounded-lg px-3 py-2 text-sm inline-block" href="${D}/politica_acoso_laboral.pdf" download>📄 Política de Prevención del Acoso Laboral</a>
              <a class="panel-btn-secundario rounded-lg px-3 py-2 text-sm inline-block" href="${D}/politica_acoso_sexual.pdf" download>📄 Política de Prevención de Acoso Sexual</a>
            </div>
          </div>
        `,
      },
      {
        id: 'objetivos',
        titulo: 'Objetivos del Sistema de Gestión Integral (SGI)',
        html: `
          <ul class="ind-list">
            <li>Propender por la generación de rentabilidad económica.</li>
            <li>Mejorar continuamente el SGI.</li>
            <li>Lograr la satisfacción del cliente.</li>
            <li>Garantizar el cumplimiento de los requisitos legales aplicables.</li>
            <li>Prevenir y minimizar la contaminación ambiental.</li>
            <li>Prevenir accidentes de trabajo y enfermedades laborales.</li>
            <li>Promover la participación de los trabajadores en la mejora del SGI.</li>
          </ul>
        `,
      },
      {
        id: 'mapa',
        titulo: 'Mapa de Procesos',
        html: `
          <p class="ind-lead">Consulta el mapa de procesos institucional, donde se representa gráficamente la estructura y funcionamiento del Sistema de Gestión Integral:</p>
          <figure class="ind-figure">
            <img src="${I}/mapa_de_procesos.png" alt="Mapa de Procesos" />
          </figure>
        `,
      },
      {
        id: 'certificaciones',
        titulo: 'Certificaciones',
        html: `
          <ul class="ind-list">
            <li>ISO 9001:2015 - Sistema de Gestión de Calidad.</li>
            <li>ISO 14001:2015 - Sistema de Gestión Ambiental.</li>
            <li>ISO 45001:2018 - Seguridad y Salud en el Trabajo.</li>
          </ul>
        `,
      },
    ],
  },

  {
    id: 3,
    titulo: 'Seguridad y Salud en el Trabajo',
    icono: Shield,
    video: { src: `${V}/Video_SST.mp4`, titulo: 'Seguridad y Salud en el Trabajo' },
    narracion: [
      'Bienvenido al módulo tres. Aquí conocerás las bases del Sistema de Gestión de Seguridad y Salud en el Trabajo, los factores de riesgo más comunes y las normas que te ayudan a mantenerte seguro y saludable.',
      'Medicina preventiva: protege tu salud en el trabajo.',
      'Seguridad industrial: evita accidentes laborales.',
      'Higiene industrial: cuida el ambiente de trabajo.',
      'Factores de riesgo: identifica peligros comunes.',
      'Deberes del trabajador: cumple las normas y usa protección.',
      'Comité COPASST: promueve la prevención de riesgos.',
      'Convivencia laboral: fomenta el respeto y bienestar.',
      'Acoso laboral: la ley protege tu dignidad.',
      'Excelente. Revisa el contenido y presenta el quiz para comprobar tu aprendizaje.',
    ],
    secciones: [
      {
        id: 'info',
        titulo: '🩺 Medicina Preventiva y del Trabajo',
        html: `
          <p class="ind-lead">Orientada por acciones de salud, se basa en la prevención y control de factores causantes de enfermedad común y ocupacional.</p>
          <div class="ind-content">
            <h3>Subprogramas</h3>
            <ul class="ind-list">
              <li>🧪 Exámenes y Evaluaciones Médicas</li>
              <li>💉 Jornadas de Vacunación</li>
              <li>🏃‍♀️ Capacitaciones en Estilos de Vida Saludable</li>
              <li>📊 Sistemas de Vigilancia Epidemiológica: Ergonómico, Auditivo y Biológico</li>
            </ul>
            <h3>🦺 Seguridad Industrial</h3>
            <p class="ind-lead">Para factores de riesgo causantes de accidentes de trabajo:</p>
            <ul class="ind-list">
              <li>Inspecciones e Investigaciones</li>
              <li>Orden y Aseo</li>
              <li>Procedimientos Operativos por Tareas Críticas</li>
              <li>Planes de emergencia</li>
              <li>Mantenimiento (Equipos y Maquinaria)</li>
              <li>Hojas de Seguridad</li>
            </ul>
            <h3>🧴 Higiene Industrial</h3>
            <p class="ind-lead">Para factores de riesgo causantes de Enfermedad Laboral:</p>
            <ul class="ind-list">
              <li>Mediciones Ambientales y Ocupacionales</li>
              <li>Ruido</li>
              <li>Iluminación</li>
              <li>Ergonómicas</li>
              <li>Contamos con nuestra ARL - Equidad Seguros</li>
            </ul>
          </div>
          <figure class="ind-figure">
            <img src="${I}/emermedica.jpeg" alt="Emermédica - Medicina Preventiva" style="max-width:360px" />
          </figure>
        `,
      },
      {
        id: 'riesgos',
        titulo: '⚠️ Factores de Riesgo Laboral',
        html: `
          <p class="ind-lead">Los siguientes factores de riesgo aplican de manera general a todos los cargos de la empresa, incluyendo personal administrativo, operativo, de mantenimiento y de servicios generales.</p>
          <ul class="ind-list">
            <li><strong>CONDICIONES DE SEGURIDAD (LOCATIVAS):</strong> Riesgo de caídas a distinto o mismo nivel (escaleras, sillas, superficies irregulares) y condiciones del entorno físico de trabajo.</li>
            <li><strong>PSICOSOCIALES:</strong> Factores derivados de la organización y carga laboral, tales como trabajo repetitivo, monotonía, altos ritmos de trabajo, turnos, sobretiempos, responsabilidades y relaciones interpersonales.</li>
            <li><strong>BIOMECÁNICOS:</strong> Posturas prolongadas o inadecuadas, levantamiento y transporte de cargas, movimientos manuales con esfuerzo o fuera del ángulo de confort.</li>
            <li><strong>FÍSICOS:</strong> Exposición a ruido, variaciones de temperatura, iluminación inadecuada o vibraciones.</li>
            <li><strong>QUÍMICOS:</strong> Contacto o exposición a aerosoles sólidos (polvos orgánicos o inorgánicos, humos, fibras), gases o vapores presentes en el entorno laboral.</li>
            <li><strong>BIOLÓGICOS:</strong> Exposición a microorganismos (bacterias, virus, hongos) derivados de las condiciones del trabajo o del ambiente.</li>
            <li><strong>ELÉCTRICOS:</strong> Riesgo de contacto con instalaciones o equipos eléctricos, especialmente en áreas de mantenimiento o servicio técnico.</li>
            <li><strong>MECÁNICOS:</strong> Uso o manipulación de máquinas, herramientas o equipos con partes móviles o cortantes.</li>
            <li><strong>RIESGO CRÍTICO:</strong> Actividades que implican tránsito vehicular o trabajos en altura.</li>
            <li><strong>RIESGO PÚBLICO:</strong> Situaciones externas de delincuencia o desorden público durante desplazamientos o actividades laborales.</li>
          </ul>
        `,
      },
      {
        id: 'deberes',
        titulo: '🧾 Responsabilidades del Trabajador Según la Normatividad Legal Vigente',
        html: `
          <ul class="ind-list">
            <li>Procurar el cuidado integral de su salud atendiendo las recomendaciones y/o restricciones emitidas por el médico evaluador tanto en el ámbito intralaboral como en el extralaboral.</li>
            <li>Suministrar información clara, veraz y completa sobre su estado de salud, paraclínicos, historias clínicas, recomendaciones o restricciones médicas, y los diagnósticos de las patologías que presente al momento de la realización de las evaluaciones médicas ocupacionales.</li>
            <li>Cumplir las normas, reglamentos e instrucciones del Sistema de Gestión de la Seguridad y Salud en el Trabajo de la empresa, incluyendo el uso correcto de los elementos de protección personal que su trabajo amerite.</li>
            <li>Informar oportunamente al empleador o contratante y al comité paritario de seguridad acerca de los peligros y riesgos latentes en su sitio de trabajo.</li>
            <li>Asistir a las evaluaciones médicas ocupacionales programadas por el empleador dentro de la jornada laboral establecida; su incumplimiento acarreará sanciones de abuso del derecho conforme a la normatividad vigente.</li>
            <li>Participar en las pausas activas durante la jornada laboral, e informar al empleador objeciones de conciencia, credos, limitaciones en su estado de salud, posturas culturales o políticas que afecten la realización de las pausas.</li>
            <li>Acatar las recomendaciones médico-laborales emitidas por el médico especialista en medicina del trabajo, salud ocupacional o seguridad y salud en el trabajo, tanto en el ámbito laboral como extralaboral.</li>
            <li>Participar en las actividades de identificación de riesgos y prevención del consumo y/o trastornos mentales.</li>
            <li>Participar en las estrategias para la prevención de problemas y/o trastornos mentales.</li>
            <li>Participar en las actividades de capacitación en seguridad y salud en el trabajo definidas en el plan de capacitación del SGI.</li>
            <li>Participar y contribuir al cumplimiento de los objetivos del SGI.</li>
            <li>Administrar, gestionar y ajustar los procedimientos, protocolos, procesos y demás documentos que involucren el área.</li>
            <li>Cumplir las normas, reglamentos e instrucciones del SG-SST de la empresa y las demás establecidas en el Decreto 1072 de 2015 y normas que lo modifiquen, sustituyan o adicionen.</li>
          </ul>
          <div class="ind-content">
            <h3>🚦 Funciones y responsabilidades en Seguridad Vial</h3>
            <ul class="ind-list">
              <li>Reportar siniestros viales en desplazamientos laborales.</li>
              <li>Participar en las capacitaciones de seguridad vial.</li>
              <li>Cumplir la legislación y los lineamientos de seguridad vial de la organización.</li>
            </ul>
          </div>
        `,
      },
      {
        id: 'copasst',
        titulo: '👥 Comité Paritario de Seguridad y Salud en el Trabajo (COPASST)',
        html: `
          <p class="ind-lead">El <strong>COPASST</strong> es un organismo de promoción y vigilancia de las normas y reglamentos sobre seguridad y salud en el trabajo. Su objetivo es fomentar la participación de todos los trabajadores en la prevención de riesgos laborales.</p>
          <div class="ind-content">
            <h3>¿Qué es?</h3>
            <p class="ind-lead">Es un <strong>comité paritario</strong>, lo que significa que está conformado por partes iguales entre representantes de los <strong>empleadores</strong> y de los <strong>trabajadores</strong>.</p>
            <h3>¿Qué hace?</h3>
            <ul class="ind-list">
              <li>Investiga incidentes y accidentes de trabajo.</li>
              <li>Realiza inspecciones de equipos, procesos e instalaciones.</li>
              <li>Intermedia en temas relacionados con la <strong>medicina preventiva y del trabajo</strong>.</li>
              <li>Propone medidas para la mejora continua de la seguridad y salud laboral.</li>
            </ul>
          </div>
        `,
      },
      {
        id: 'convivencia',
        titulo: '🤝 Comité de Convivencia Laboral',
        html: `
          <div class="ind-content">
            <h3>¿Qué es?</h3>
            <p class="ind-lead">Es un grupo de vigilancia cuya finalidad es contribuir a proteger a los trabajadores contra los riesgos psicosociales que puedan afectar la salud.</p>
            <h3>¿Qué objetivo persigue?</h3>
            <ul class="ind-list">
              <li>Promover un excelente ambiente de convivencia laboral.</li>
              <li>Fomentar relaciones positivas entre los trabajadores de la empresa.</li>
              <li>Respaldar la dignidad e integridad de las personas en el trabajo.</li>
            </ul>
            <h3>¿Quiénes lo conforman?</h3>
            <p class="ind-lead">Representantes de <strong>empleadores</strong> y <strong>empleados</strong> por igual.</p>
          </div>
        `,
      },
      {
        id: 'acoso-laboral',
        titulo: '⚖️ Acoso Laboral',
        html: `
          <p class="ind-lead"><strong>LEY 1010 DE 2006:</strong> Acoso Laboral</p>
          <div class="ind-content">
            <h3>Objeto</h3>
            <p class="ind-lead">Definir, prevenir, corregir y sancionar las diversas formas de agresión, maltrato, vejámenes, trato desconsiderado y ofensivo, y en general todo ultraje a la dignidad humana que se ejercen sobre quienes realizan sus actividades en el contexto de una relación laboral privada o pública.</p>
            <p class="ind-lead">Toda conducta persistente y demostrable, ejercida sobre un empleado por parte de un empleador, jefe, superior jerárquico, compañero o subalterno, encaminada a infundir miedo, intimidación, terror o angustia; causar perjuicio laboral; generar desmotivación en el trabajo; o inducir la renuncia del mismo.</p>
            <h3>Modalidades</h3>
            <ul class="ind-list">
              <li><strong>Maltrato laboral:</strong> violencia física o verbal.</li>
              <li><strong>Persecución laboral:</strong> actos reiterados o arbitrarios.</li>
              <li><strong>Discriminación laboral:</strong> todo trato diferenciado por razones de raza, género, edad, origen familiar o nacional, discapacidad, credo religioso, preferencia política o situación social que carezca de toda razonabilidad desde el punto de vista laboral.</li>
              <li><strong>Inequidad laboral:</strong> diferencias en funciones o remuneración.</li>
              <li><strong>Entorpecimiento laboral:</strong> obstaculizar el desarrollo del trabajo.</li>
              <li><strong>Desprotección laboral:</strong> impartir órdenes no adecuadas.</li>
              <li><strong>Actos de irrespeto a la dignidad humana:</strong> comportamientos contrarios a la disciplina o subordinación laboral, al desempeño del trabajo, a la seguridad o a la salud ocupacional.</li>
            </ul>
            <h3>Ámbito de Aplicación</h3>
            <p class="ind-lead"><strong>Se aplica a:</strong> Trabajadores del sector privado y público.</p>
            <p class="ind-lead"><strong>No aplica a:</strong> Relaciones civiles o comerciales derivadas de contratos de prestación de servicios sin relación de jerarquía o subordinación, ni a contratación administrativa.</p>
          </div>
        `,
      },
      {
        id: 'epp',
        titulo: '🧤 Uso Adecuado de los Elementos de Protección Personal (EPP)',
        html: `
          <p class="ind-lead">Recuerda utilizar correctamente los elementos de protección personal para prevenir accidentes y enfermedades laborales.</p>
          <figure class="ind-figure">
            <img src="${I}/uso_adecuado_epp.png" alt="Uso adecuado de los elementos de protección personal" />
          </figure>
        `,
      },
      {
        id: 'pausas-activas',
        titulo: '🧘‍♀️ Pausas Activas en la Jornada Laboral',
        html: `
          <p class="ind-lead">Las pausas activas son breves descansos que se realizan durante la jornada laboral para promover la salud física y mental, reducir el estrés y prevenir enfermedades musculoesqueléticas.</p>
          <ul class="ind-list">
            <li>Ayudan a mejorar la concentración y el estado de ánimo.</li>
            <li>Previenen lesiones por esfuerzo repetitivo.</li>
            <li>Reducen la fatiga visual y mental.</li>
            <li>Favorecen la circulación y la postura.</li>
          </ul>
          <div class="ind-downloads">
            <a class="panel-btn-secundario rounded-lg px-3 py-2 text-sm inline-block" href="${D}/instructivo_pausas_activas.pdf" target="_blank" rel="noreferrer">⬇️ Descargar Instructivo de Pausas Activas</a>
          </div>
        `,
      },
    ],
  },

  {
    id: 4,
    titulo: 'Prevención, Preparación y Respuesta ante Emergencias',
    icono: Siren,
    video: null,
    narracion: [
      'Bienvenido al módulo cuatro, Procedimientos Operativos Normalizados. Aquí aprenderás sobre los PONS, las brigadas de emergencia, cómo actuar ante accidentes o incendios, y los protocolos de evacuación y accesibilidad. Al finalizar podrás realizar el quiz para evaluar tu aprendizaje.',
    ],
    secciones: [
      {
        id: 'introduccion',
        titulo: '🆘 Introducción a Emergencias',
        html: `
          <p class="ind-lead">Las <strong>emergencias</strong> son situaciones inesperadas que pueden poner en riesgo la vida, la salud, los bienes o el entorno. Conocer cómo actuar frente a ellas es fundamental para reducir sus consecuencias y proteger a todas las personas involucradas.</p>
          <p class="ind-lead">En el entorno laboral, cada trabajador debe mantener la calma, seguir los <strong>protocolos de emergencia</strong> y acatar las instrucciones del personal encargado. Una respuesta rápida, organizada y segura puede marcar la diferencia ante cualquier situación crítica.</p>
        `,
      },
      {
        id: 'pons',
        titulo: '📘 ¿Qué son los PONS?',
        html: `
          <p class="ind-lead">Los <strong>Procedimientos Operativos Normalizados (PONS)</strong> son documentos que describen de forma clara, ordenada y secuencial cómo deben ejecutarse las tareas o procesos dentro de la organización. Su finalidad es garantizar la calidad, la seguridad y la eficiencia de las operaciones, reduciendo errores y promoviendo un ambiente laboral seguro.</p>
          <p class="ind-lead">Aplicar los PONS asegura que todos los colaboradores sigan las mismas pautas, permitiendo mantener la uniformidad en los resultados y el cumplimiento de los requisitos legales y normativos.</p>
          <div class="ind-downloads">
            <a class="panel-btn-secundario rounded-lg px-3 py-2 text-sm inline-block" href="${D}/PONS_en_caso_de_emergencia.xlsx" download>📥 Descargar PONS en caso de emergencia (Excel)</a>
          </div>
        `,
      },
      {
        id: 'brigadas',
        titulo: '🚒 Brigadas de Emergencia',
        html: `
          <p class="ind-lead">Es el grupo de trabajo conformado por empleados voluntarios, distribuidos estratégicamente en los diferentes niveles y turnos de trabajo, quienes reciben capacitación en primeros auxilios, técnicas bomberiles, salvamento y rescate. Además, tienen entrenamiento permanente y cuentan con la coordinación de empleados. Son quienes llevan a cabo las acciones operativas en caso de emergencia.</p>
        `,
      },
      {
        id: 'emergencias',
        titulo: '🚨 Qué hacer en caso de un accidente laboral o incendio',
        html: `
          <div class="ind-content">
            <h3>🩹 Accidente Laboral</h3>
            <ol class="ind-list-ol">
              <li>Detener labores inmediatamente.</li>
              <li>Suspender la operación de equipos y herramientas involucradas en el accidente.</li>
              <li>Prestar los primeros auxilios al lesionado.</li>
              <li>Informar al responsable del área (supervisor, operador o HSEQ).</li>
              <li>Si es necesario, trasladar al lesionado a la IPS más cercana.</li>
              <li>Reportar e investigar el accidente.</li>
            </ol>
            <h3>🔥 Incendio</h3>
            <ol class="ind-list-ol">
              <li>Analizar el tipo de incendio (Clase A: papel, madera; Clase B: gasolina; Clase C: eléctrico).</li>
              <li>Evaluar si puede ser controlado de forma segura.</li>
              <li>Usar agua, tierra o extintor multipropósito (ABC) según el tipo de fuego.</li>
              <li>Si no puede controlarse, evacuar el área y dirigirse al punto de encuentro más cercano.</li>
              <li>Reportar e investigar las causas del incendio.</li>
              <li>Implementar acciones correctivas para evitar su repetición.</li>
            </ol>
          </div>
        `,
      },
      {
        id: 'alarmas',
        titulo: '🏃‍♂️ Alarmas, Puntos de Encuentro y Protocolos de Accesibilidad',
        html: `
          <p class="ind-lead">En caso de emergencia, todas las personas deben seguir los protocolos establecidos para garantizar una evacuación rápida, segura y ordenada.</p>
          <div class="ind-content">
            <h3>🔔 Alarmas</h3>
            <ul class="ind-list">
              <li><strong>Sonido intermitente — Alerta:</strong> inspección preventiva.</li>
              <li><strong>Sonido continuo — Evacuación inmediata:</strong> abandonar el área.</li>
            </ul>
            <h3>📍 Puntos de Encuentro</h3>
            <ul class="ind-puntos">
              <li><strong>1.</strong> Entrada oficinas administrativas, módulo Centenario.<img src="${I}/punto_1.png" alt="Punto de encuentro 1" /></li>
              <li><strong>2.</strong> Plataforma de abordaje, módulo Centenario.<img src="${I}/punto_2.png" alt="Punto de encuentro 2" /></li>
              <li><strong>3.</strong> Entrada principal del módulo Regional.<img src="${I}/punto_3.png" alt="Punto de encuentro 3" /></li>
              <li><strong>4.</strong> Zona norte (Propiedad Horizontal).<img src="${I}/punto_4.png" alt="Punto de encuentro 4" /></li>
            </ul>
            <h3>♿ Protocolo de Accesibilidad</h3>
            <p class="ind-lead">Define las directrices para la atención y evacuación segura de personas con discapacidad en caso de emergencia.</p>
            <div class="ind-downloads">
              <a class="panel-btn-secundario rounded-lg px-3 py-2 text-sm inline-block" href="${D}/protocolo_de_accesibilidad.pdf" target="_blank" rel="noreferrer">📄 Descargar Protocolo de Accesibilidad</a>
            </div>
          </div>
        `,
      },
    ],
  },

  {
    id: 5,
    titulo: 'Gestión Ambiental',
    icono: Leaf,
    video: null,
    narracion: [
      'Bienvenido al módulo cinco, Gestión Ambiental. Aquí aprenderás sobre el manejo adecuado de residuos, el uso eficiente de recursos, los impactos ambientales, y el Sistema Globalmente Armonizado. Lee con atención cada parte y al finalizar podrás realizar el quiz para evaluar tu aprendizaje. ¡Comencemos!',
    ],
    secciones: [
      {
        id: 'introduccion',
        titulo: '🌿 Introducción a la Gestión Ambiental',
        html: `
          <p class="ind-lead">La gestión ambiental es un pilar esencial para alcanzar el equilibrio entre el desarrollo organizacional y la preservación del entorno natural. A través de estrategias sostenibles y programas integrales, buscamos reducir los impactos ambientales derivados de nuestras actividades, optimizando el uso de los recursos y fomentando una cultura ecológica en todos los niveles de la organización.</p>
          <p class="ind-lead">Este compromiso va más allá del cumplimiento normativo: representa una apuesta por la innovación, la eficiencia y la mejora continua.</p>
        `,
      },
      {
        id: 'residuos',
        titulo: '♻️ Programa de Gestión Integrado de Residuos',
        html: `
          <p class="ind-lead">El <strong>Programa de Gestión Integrada de Residuos</strong> busca promover el manejo adecuado de los desechos generados en la organización, garantizando la separación en la fuente, el aprovechamiento de materiales reciclables y la disposición final responsable.</p>
          <p class="ind-lead">Dentro del programa se promueve el reciclaje de materiales como papel, cartón, plástico, vidrio y metales, alcanzando un promedio anual de <strong>15.000 kg de residuos reciclados</strong>. Asimismo, se gestionan los <strong>Residuos de Aparatos Eléctricos y Electrónicos (RAEE)</strong> y los residuos orgánicos mediante procesos de valorización ambiental.</p>
          <div class="ind-row">
            <img src="${I}/compostera.png" alt="Sistema de compostaje móvil inteligente fotovoltaico" />
            <div class="ind-row-texto">
              <h4>🌱 Sistema de Compostaje Móvil Inteligente</h4>
              <p>En el año 2023 adquirimos, junto con la empresa huilense <strong>GOLDEN ALBA</strong>, un sistema de compostaje móvil inteligente fotovoltaico, como muestra de nuestro compromiso con el medio ambiente y el desarrollo sostenible.</p>
              <p>Procesa aproximadamente <strong>1.5 toneladas de residuos orgánicos al mes</strong>, funcionando completamente a base de <strong>energía solar</strong>.</p>
            </div>
          </div>
        `,
      },
      {
        id: 'plagas',
        titulo: '🐛 Programa de Control de Plagas',
        html: `
          <p class="ind-lead">El <strong>Programa de Control de Plagas</strong> tiene como propósito prevenir, controlar y eliminar la presencia de organismos que puedan afectar la salud, la inocuidad, la infraestructura o el entorno de trabajo, minimizando el uso de productos químicos y priorizando métodos ecológicos y preventivos.</p>
          <div class="ind-content">
            <h3>🔹 Medidas preventivas y monitoreo</h3>
            <ul class="ind-list">
              <li>Mantener las áreas limpias, libres de restos de alimentos y basuras acumuladas.</li>
              <li>Evitar dejar puertas y ventanas abiertas innecesariamente; sellar accesos potenciales.</li>
              <li>Revisar y mantener limpios los puntos con humedad y almacenamiento de insumos.</li>
              <li>Implementación de <strong>cebaderas de monitoreo</strong> en puntos estratégicos para detección temprana.</li>
            </ul>
            <h3>🔹 Intervenciones programadas y manejo responsable</h3>
            <p class="ind-lead">Se realizan <strong>dos fumigaciones al año</strong> como mínimo, ejecutadas por personal especializado, con productos certificados y registro detallado de cada intervención.</p>
          </div>
          <div class="ind-grid">
            <div class="ind-tile"><img src="${I}/cebaderas.png" alt="Cebaderas de monitoreo" /><h4>Control de Cebaderas</h4><p>Inspección y monitoreo con cebaderas ecológicas para detectar actividad de plagas.</p></div>
            <div class="ind-tile"><img src="${I}/fumigacion.png" alt="Fumigación controlada" /><h4>Fumigaciones Programadas</h4><p>Dos fumigaciones anuales como estándar; ejecución anticipada si la situación lo exige.</p></div>
            <div class="ind-tile"><img src="${I}/comejen.png" alt="Control de comején" /><h4>Control de Comején</h4><p>Tratamientos focalizados y preventivos, protegiendo la estructura del edificio.</p></div>
          </div>
          <p class="ind-highlight">🪴 El control adecuado de plagas protege la salud, la infraestructura y contribuye a la sostenibilidad operacional.</p>
        `,
      },
      {
        id: 'energia',
        titulo: '⚡ Programa de Uso Eficiente y Racional de Energía',
        html: `
          <p class="ind-lead">Este programa busca optimizar el consumo energético de la organización, promoviendo el uso responsable de la electricidad y la implementación de tecnologías limpias que reduzcan la huella de carbono.</p>
          <p class="ind-lead">Se han incorporado sistemas de energía renovable, incluyendo la instalación de <strong>paneles solares</strong>, además de fomentar el apagado de equipos no esenciales, la iluminación eficiente y la capacitación del personal en prácticas de ahorro energético.</p>
          <div class="ind-gallery">
            <img src="${I}/panel_solar_1.png" alt="Panel solar en funcionamiento" />
            <img src="${I}/panel_solar_2.png" alt="Instalación de paneles solares" />
            <img src="${I}/panel_solar_3.png" alt="Sistema fotovoltaico en la organización" />
          </div>
          <figure class="ind-figure">
            <img src="${I}/resultado_paneles.jpeg" alt="Resultados del sistema de paneles solares" />
            <figcaption>🔆 Resultados del Sistema Fotovoltaico: un avance significativo hacia la autosuficiencia energética.</figcaption>
          </figure>
          <figure class="ind-figure">
            <img src="${I}/raee.png" alt="Gestión de RAEE" />
          </figure>
        `,
      },
      {
        id: 'agua',
        titulo: '💧 Programa de Uso Eficiente y Racional de Agua',
        html: `
          <p class="ind-lead">Este programa tiene como propósito garantizar un uso consciente, responsable y sostenible del recurso hídrico dentro de la organización, promoviendo la reducción del consumo, la reutilización y el aprovechamiento eficiente del agua.</p>
          <p class="ind-lead">Entre las acciones implementadas se incluyen dispositivos ahorradores, la detección temprana de fugas, campañas de sensibilización para el personal y la gestión responsable del agua lluvia.</p>
        `,
      },
      {
        id: 'impactos',
        titulo: '🌎 Impactos ambientales',
        html: `
          <p class="ind-lead">Todas las actividades humanas generan algún tipo de impacto sobre el ambiente. Identificar, prevenir y mitigar estos impactos permite reducir riesgos y cumplir con los compromisos de sostenibilidad de la empresa.</p>
          <div class="ind-grid">
            <div class="ind-tile"><img src="${I}/contaminacion.png" alt="Contaminación ambiental" /><h4>Contaminación</h4><p>Provocada por derrames, emisiones o manejo inadecuado de residuos.</p></div>
            <div class="ind-tile"><img src="${I}/consumo.png" alt="Consumo excesivo de recursos" /><h4>Consumo excesivo</h4><p>El uso ineficiente de agua, energía o materiales genera mayor impacto y costos.</p></div>
            <div class="ind-tile"><img src="${I}/ruido.png" alt="Ruido y contaminación auditiva" /><h4>Ruido</h4><p>El exceso de ruido puede afectar la salud de las personas y la fauna cercana.</p></div>
            <div class="ind-tile"><img src="${I}/flora_fauna.png" alt="Afectación de flora y fauna" /><h4>Daño a flora y fauna</h4><p>La tala, vertimientos o residuos en lugares no permitidos alteran ecosistemas.</p></div>
          </div>
          <p class="ind-highlight">🌱 Recuerda: cada trabajador puede prevenir los impactos ambientales siguiendo las buenas prácticas y reportando cualquier situación anormal.</p>
        `,
      },
      {
        id: 'plan',
        titulo: '🗂️ Plan de Manejo Ambiental',
        html: `
          <p class="ind-lead">El plan de manejo ambiental incluye acciones preventivas, responsables de ejecución y controles para reducir impactos. Cada trabajador tiene un rol: cumplir procedimientos, reportar incidentes y participar en campañas de formación.</p>
        `,
      },
      {
        id: 'sga',
        titulo: '🧪 Sistema Globalmente Armonizado (SGA)',
        html: `
          <p class="ind-lead">El <strong>Sistema Globalmente Armonizado de Clasificación y Etiquetado de Productos Químicos (SGA)</strong> tiene como objetivo comunicar de manera clara los peligros asociados al uso de sustancias químicas, garantizando que los trabajadores comprendan los riesgos y adopten medidas seguras para su manejo, almacenamiento y transporte.</p>
          <figure class="ind-figure">
            <img src="${I}/pictograma.png" alt="Pictogramas del Sistema Globalmente Armonizado" />
          </figure>
          <div class="ind-box">
            <p>🔹 <strong>Recuerda:</strong> Antes de manipular cualquier sustancia química, verifica su etiqueta y ficha de seguridad (MSDS).</p>
            <p>🔹 Usa siempre los elementos de protección personal recomendados.</p>
            <p>🔹 Reporta de inmediato cualquier derrame o fuga a tu supervisor.</p>
          </div>
          <p class="ind-highlight">🧤 Comprender los símbolos del SGA te protege a ti, a tus compañeros y al medio ambiente.</p>
        `,
      },
    ],
  },

  {
    id: 6,
    titulo: 'Seguridad Vial',
    icono: TrafficCone,
    video: null,
    narracion: [
      'Bienvenido al módulo seis, Seguridad Vial. Aquí encontrarás la definición de seguridad vial, el plan estratégico para gestionar riesgos viales, la estructura y funciones del comité de seguridad vial y recomendaciones prácticas para conductores y peatones. Cuando termines, presenta el quiz para evaluar tu aprendizaje. ¡Buen viaje y mucha atención!',
    ],
    secciones: [
      {
        id: 'definicion',
        titulo: '🚦 Definición de Seguridad Vial',
        html: `<p class="ind-lead">La seguridad vial es el conjunto de normas, prácticas y medidas orientadas a prevenir y reducir los accidentes de tránsito, protegiendo a conductores, pasajeros y peatones. Promueve la responsabilidad y la cultura del autocuidado en la vía.</p>`,
      },
      {
        id: 'plan',
        titulo: '📋 Plan Estratégico de Seguridad Vial',
        html: `
          <p class="ind-lead">El Plan Estratégico de Seguridad Vial (PESV) incluye políticas, procesos y acciones preventivas para gestionar los riesgos viales: capacitación, control de rutas, mantenimiento de vehículos, evaluación de conductores y concienciación en buenas prácticas.</p>
          <p class="ind-lead">Su objetivo es reducir incidentes y garantizar desplazamientos laborales seguros.</p>
        `,
      },
      {
        id: 'comite',
        titulo: '👥 Comité de Seguridad Vial',
        html: `
          <p class="ind-lead">El Comité de Seguridad Vial está compuesto por representantes de diferentes áreas. Sus funciones principales incluyen:</p>
          <ul class="ind-list">
            <li>Diseñar y supervisar las acciones del PESV.</li>
            <li>Analizar incidentes y realizar planes de mejora.</li>
            <li>Coordinar campañas de formación y campañas de sensibilización.</li>
            <li>Monitorear el cumplimiento de las políticas de seguridad vial.</li>
          </ul>
        `,
      },
      {
        id: 'recomendaciones',
        titulo: '⚠️ Recomendaciones de Seguridad Vial',
        html: `
          <ul class="ind-list">
            <li>Usa siempre el cinturón de seguridad y elementos de protección cuando aplique.</li>
            <li>Respeta los límites de velocidad y las señales de tránsito.</li>
            <li>No uses el celular mientras conduces; detén el vehículo para atender llamadas o mensajes.</li>
            <li>No conduzcas bajo los efectos del alcohol o sustancias psicoactivas.</li>
            <li>Mantén pausas y evita la fatiga en viajes largos.</li>
            <li>Realiza el mantenimiento preventivo del vehículo y verifica condiciones antes de salir.</li>
          </ul>
        `,
      },
    ],
  },
]

export function obtenerModulo(id) {
  return MODULOS.find((m) => m.id === Number(id))
}

export const QUIZZES = {
  1: {
    titulo: 'Quiz Módulo 1: Identidad Corporativa',
    preguntas: [
      {
        id: 'q1',
        texto: '¿Cuál es el objetivo principal del Terminal de Transportes de Neiva?',
        opciones: [
          { valor: 'A', texto: 'Vender tiquetes y despachar buses directamente' },
          { valor: 'B', texto: 'Administrar la operación, orientar a los usuarios y registrar llegadas y salidas' },
          { valor: 'C', texto: 'Ofrecer servicios de hotelería' },
          { valor: 'D', texto: 'Promover el turismo internacional' },
        ],
        correcta: 'B',
      },
      {
        id: 'q2',
        texto: '¿Cuáles son los tres módulos que conforman el Terminal de Transportes de Neiva?',
        opciones: [
          { valor: 'A', texto: 'Principal, ejecutivo y regional' },
          { valor: 'B', texto: 'Centenario, regional, antiguo (propiedad horizontal)' },
          { valor: 'C', texto: 'Norte, Sur y Central' },
          { valor: 'D', texto: 'Urbano, Intermunicipal y Rural' },
        ],
        correcta: 'B',
      },
      {
        id: 'q3',
        texto: 'Según la misión, ¿cuál es la prioridad del Terminal de Transportes de Neiva?',
        opciones: [
          { valor: 'A', texto: 'Incrementar las utilidades' },
          { valor: 'B', texto: 'Facilitar la administración y operación del transporte, garantizando la satisfacción de los clientes' },
          { valor: 'C', texto: 'Desarrollar infraestructura para carga pesada' },
          { valor: 'D', texto: 'Promover viajes internacionales' },
        ],
        correcta: 'B',
      },
      {
        id: 'q4',
        texto: '¿Qué busca lograr la visión del Terminal para el año 2025?',
        opciones: [
          { valor: 'A', texto: 'Ser una organización sostenible, reconocida como eje de integración del transporte terrestre' },
          { valor: 'B', texto: 'Vender boletos electrónicos' },
          { valor: 'C', texto: 'Convertirse en una agencia de viajes' },
          { valor: 'D', texto: 'Expandirse a otros países' },
        ],
        correcta: 'A',
      },
      {
        id: 'q5',
        texto: '¿Cuáles son algunos de los valores éticos del Terminal de Transportes de Neiva?',
        opciones: [
          { valor: 'A', texto: 'Competencia desleal y apatía' },
          { valor: 'B', texto: 'Lealtad, responsabilidad, honestidad, respeto y compromiso' },
          { valor: 'C', texto: 'Rapidez, flexibilidad y secreto' },
          { valor: 'D', texto: 'Rentabilidad y liderazgo político' },
        ],
        correcta: 'B',
      },
    ],
  },
  2: {
    titulo: 'Quiz Módulo 2: Gestión Institucional',
    preguntas: [
      {
        id: 'q1',
        texto: '¿Cuál de los siguientes enunciados hace parte del Sistema de Gestión Integral (SGI)?',
        opciones: [
          { valor: 'A', texto: 'Pagos de cartera' },
          { valor: 'B', texto: 'Calidad, ambiental y seguridad y salud en el trabajo' },
          { valor: 'C', texto: 'Contratación' },
          { valor: 'D', texto: 'Recursos humanos' },
        ],
        correcta: 'B',
      },
      {
        id: 'q2',
        texto: '¿De qué trata la Política del Sistema de Gestión Integral (SGI)?',
        opciones: [
          { valor: 'A', texto: 'Reducir vacaciones' },
          { valor: 'B', texto: 'Incrementar ganancias sin seguridad' },
          {
            valor: 'C',
            texto:
              'Está comprometida con la satisfacción del cliente, el cumplimiento de la legislación vigente, el uso racional de los recursos naturales, la promoción de un ambiente de trabajo seguro y saludable, y el fortalecimiento de las competencias del personal',
          },
          { valor: 'D', texto: 'Aumentar el horario laboral' },
        ],
        correcta: 'C',
      },
      {
        id: 'q3',
        texto: '¿Qué representa el Mapa de Procesos de la empresa?',
        opciones: [
          { valor: 'A', texto: 'La estructura y funcionamiento del SGI' },
          { valor: 'B', texto: 'El listado de empleados' },
          { valor: 'C', texto: 'El calendario de vacaciones' },
          { valor: 'D', texto: 'Las políticas internas' },
        ],
        correcta: 'A',
      },
      {
        id: 'q4',
        texto: '¿Cuál norma corresponde al Sistema de Gestión Ambiental?',
        opciones: [
          { valor: 'A', texto: 'ISO 45001:2018' },
          { valor: 'B', texto: 'ISO 9001:2015' },
          { valor: 'C', texto: 'ISO 14001:2015' },
          { valor: 'D', texto: 'ISO 27001:2013' },
        ],
        correcta: 'C',
      },
      {
        id: 'q5',
        texto: '¿Qué busca la Política de Prevención del Acoso Laboral?',
        opciones: [
          { valor: 'A', texto: 'Controlar el tiempo de descanso' },
          { valor: 'B', texto: 'Permitir discusiones en el trabajo' },
          { valor: 'C', texto: 'Ofrecer buenos ambientes laborales' },
          { valor: 'D', texto: 'Exigir disponibilidad 24/7' },
        ],
        correcta: 'C',
      },
    ],
  },
  3: {
    titulo: 'Quiz Módulo 3: Seguridad y Salud en el Trabajo (SST)',
    preguntas: [
      {
        id: 'q1',
        texto: '¿Cuál es el principal objetivo de la SST?',
        opciones: [
          { valor: 'A', texto: 'Cumplir únicamente con la normatividad' },
          { valor: 'B', texto: 'Proteger y promover la salud de los trabajadores' },
          { valor: 'C', texto: 'Aumentar la productividad sin control de riesgos' },
          { valor: 'D', texto: 'Reducir los costos operativos' },
        ],
        correcta: 'B',
      },
      {
        id: 'q2',
        texto: '¿Qué norma internacional se relaciona con la SST?',
        opciones: [
          { valor: 'A', texto: 'ISO 9001:2015' },
          { valor: 'B', texto: 'ISO 14001:2015' },
          { valor: 'C', texto: 'ISO 45001:2018' },
          { valor: 'D', texto: 'ISO 27001:2013' },
        ],
        correcta: 'C',
      },
      {
        id: 'q3',
        texto: '¿Cuál es la ley por la cual se reglamenta el acoso laboral?',
        opciones: [
          { valor: 'A', texto: 'Ley 2550 de 2005' },
          { valor: 'B', texto: 'Ley 1010 de 2006' },
          { valor: 'C', texto: 'Ley 3030 de 2004' },
          { valor: 'D', texto: 'Ley 3636 de 2003' },
        ],
        correcta: 'B',
      },
      {
        id: 'q4',
        texto: '¿Una de mis responsabilidades como trabajador es?',
        opciones: [
          {
            valor: 'A',
            texto:
              'Procurar el cuidado integral de mi salud, atendiendo las recomendaciones y/o restricciones emitidas por el médico evaluador',
          },
          { valor: 'B', texto: 'Llegar tarde' },
          { valor: 'C', texto: 'Utilizar el celular durante la jornada laboral' },
          { valor: 'D', texto: 'Llegar mal vestido' },
        ],
        correcta: 'A',
      },
      {
        id: 'q5',
        texto: '¿Qué entidad en Colombia supervisa el cumplimiento de la SST?',
        opciones: [
          { valor: 'A', texto: 'Ministerio de Salud' },
          { valor: 'B', texto: 'Ministerio del Trabajo' },
          { valor: 'C', texto: 'Ministerio de Educación' },
          { valor: 'D', texto: 'Ministerio de Ambiente' },
        ],
        correcta: 'B',
      },
    ],
  },
  4: {
    titulo: 'Quiz Módulo 4: Emergencias',
    preguntas: [
      {
        id: 'q1',
        texto: '¿Cuál es el propósito principal de los Procedimientos Operativos Normalizados (PONS)?',
        opciones: [
          { valor: 'A', texto: 'Reducir únicamente los costos operativos' },
          { valor: 'B', texto: 'Garantizar la calidad, seguridad y eficiencia en las operaciones' },
          { valor: 'C', texto: 'Sustituir los manuales de trabajo existentes' },
          { valor: 'D', texto: 'Promover la competencia entre empleados' },
        ],
        correcta: 'B',
      },
      {
        id: 'q2',
        texto: '¿Quiénes conforman las brigadas de emergencia dentro de la organización?',
        opciones: [
          { valor: 'A', texto: 'Personal externo especializado en rescate' },
          { valor: 'B', texto: 'Empleados voluntarios' },
          { valor: 'C', texto: 'Directivos de la empresa' },
          { valor: 'D', texto: 'Visitantes del área administrativa' },
        ],
        correcta: 'B',
      },
      {
        id: 'q3',
        texto: '¿Cuál es la primera acción ante un accidente laboral?',
        opciones: [
          { valor: 'A', texto: 'Reportarlo a la ARL inmediatamente' },
          { valor: 'B', texto: 'Continuar trabajando hasta recibir ayuda' },
          { valor: 'C', texto: 'Detener las labores y suspender el uso de equipos' },
          { valor: 'D', texto: 'Esperar instrucciones sin actuar' },
        ],
        correcta: 'C',
      },
      {
        id: 'q4',
        texto: '¿Qué tipo de sonido indica una evacuación inmediata?',
        opciones: [
          { valor: 'A', texto: 'Sonido intermitente' },
          { valor: 'B', texto: 'Sonido continuo' },
          { valor: 'C', texto: 'Doble tono corto' },
          { valor: 'D', texto: 'Timbre prolongado cada 10 segundos' },
        ],
        correcta: 'B',
      },
      {
        id: 'q5',
        texto: '¿Cuál es el propósito del protocolo de accesibilidad?',
        opciones: [
          { valor: 'A', texto: 'Esperar a que evacúen por su cuenta' },
          { valor: 'B', texto: 'Determinar las directrices para la atención a las personas con discapacidad' },
          { valor: 'C', texto: 'Priorizar la salida personal primero' },
          { valor: 'D', texto: 'No tenerlos en cuenta en el conteo final' },
        ],
        correcta: 'B',
      },
    ],
  },
  5: {
    titulo: 'Quiz Módulo 5: Gestión Ambiental',
    preguntas: [
      {
        id: 'q1',
        texto: '¿Cuál es el objetivo principal del manejo adecuado de residuos?',
        opciones: [
          { valor: 'A', texto: 'Facilitar la recolección sin separación' },
          { valor: 'B', texto: 'Minimizar los impactos ambientales y promover el reciclaje' },
          { valor: 'C', texto: 'Reducir únicamente los costos de disposición final' },
          { valor: 'D', texto: 'Almacenar todos los residuos juntos' },
        ],
        correcta: 'B',
      },
      {
        id: 'q2',
        texto: 'En tu empresa, ¿qué tipo de residuos se depositan en la caneca verde?',
        opciones: [
          { valor: 'A', texto: 'Residuos orgánicos como restos de alimentos' },
          { valor: 'B', texto: 'Papel, cartón y plásticos reciclables' },
          { valor: 'C', texto: 'Residuos peligrosos' },
          { valor: 'D', texto: 'Material sanitario' },
        ],
        correcta: 'A',
      },
      {
        id: 'q3',
        texto: '¿Por qué es importante el uso eficiente de los recursos naturales?',
        opciones: [
          { valor: 'A', texto: 'Porque ayuda a reducir el impacto ambiental y los costos operativos' },
          { valor: 'B', texto: 'Porque evita que los empleados desperdicien materiales' },
          { valor: 'C', texto: 'Solo para cumplir con la legislación ambiental' },
          { valor: 'D', texto: 'Porque mejora la estética de las instalaciones' },
        ],
        correcta: 'A',
      },
      {
        id: 'q4',
        texto: '¿Qué es un impacto ambiental?',
        opciones: [
          { valor: 'A', texto: 'Cualquier efecto positivo o negativo que una actividad genera sobre el entorno' },
          { valor: 'B', texto: 'Solo los daños producidos por la contaminación industrial' },
          { valor: 'C', texto: 'Un evento climático inesperado' },
          { valor: 'D', texto: 'La modificación natural del ambiente sin intervención humana' },
        ],
        correcta: 'A',
      },
      {
        id: 'q5',
        texto: '¿Qué representa el Sistema Globalmente Armonizado (SGA)?',
        opciones: [
          { valor: 'A', texto: 'Un sistema para clasificar, etiquetar y comunicar peligros de sustancias químicas' },
          { valor: 'B', texto: 'Un método para reducir el uso de químicos en la industria' },
          { valor: 'C', texto: 'Una norma que regula la gestión de residuos hospitalarios' },
          { valor: 'D', texto: 'Una guía para el almacenamiento de materiales reciclables' },
        ],
        correcta: 'A',
      },
    ],
  },
  6: {
    titulo: 'Quiz Módulo 6: Seguridad Vial',
    preguntas: [
      {
        id: 'q1',
        texto: '¿Qué busca la seguridad vial dentro de una organización?',
        opciones: [
          { valor: 'A', texto: 'Aumentar la velocidad de los vehículos de la empresa' },
          { valor: 'B', texto: 'Prevenir accidentes y proteger la vida de las personas en la vía' },
          { valor: 'C', texto: 'Incentivar el uso de transporte privado' },
          { valor: 'D', texto: 'Evitar controles de tránsito' },
        ],
        correcta: 'B',
      },
      {
        id: 'q2',
        texto: '¿Qué es el Plan Estratégico de Seguridad Vial (PESV)?',
        opciones: [
          { valor: 'A', texto: 'Un conjunto de políticas, programas y acciones para reducir los riesgos viales' },
          { valor: 'B', texto: 'Un plan para fomentar el uso de motocicletas' },
          { valor: 'C', texto: 'Un reglamento exclusivo para conductores públicos' },
          { valor: 'D', texto: 'Un protocolo solo para vehículos de carga' },
        ],
        correcta: 'A',
      },
      {
        id: 'q3',
        texto: '¿Quiénes conforman el Comité de Seguridad Vial en una empresa?',
        opciones: [
          { valor: 'A', texto: 'Los vigilantes y conductores únicamente' },
          { valor: 'B', texto: 'Representantes de diferentes áreas comprometidos con la seguridad vial' },
          { valor: 'C', texto: 'Solo el área de recursos humanos' },
          { valor: 'D', texto: 'Personal externo contratado' },
        ],
        correcta: 'B',
      },
      {
        id: 'q4',
        texto: '¿Qué acción debe realizar un conductor antes de salir a la vía?',
        opciones: [
          { valor: 'A', texto: 'Revisar el estado del vehículo y usar los elementos de seguridad' },
          { valor: 'B', texto: 'Evitar el cinturón de seguridad para estar más cómodo' },
          { valor: 'C', texto: 'No revisar el vehículo y salir cuanto antes' },
          { valor: 'D', texto: 'Encender la música a alto volumen' },
        ],
        correcta: 'A',
      },
      {
        id: 'q5',
        texto: '¿Cuál de las siguientes es una recomendación clave para la seguridad vial?',
        opciones: [
          { valor: 'A', texto: 'Respetar las señales de tránsito y no conducir bajo los efectos del alcohol' },
          { valor: 'B', texto: 'Usar el celular mientras se conduce' },
          { valor: 'C', texto: 'Conducir a exceso de velocidad para llegar más rápido' },
          { valor: 'D', texto: 'Ignorar los pasos peatonales' },
        ],
        correcta: 'A',
      },
    ],
  },
}

export function obtenerQuiz(id) {
  return QUIZZES[Number(id)]
}

// Encuestas a resolver antes de generar el certificado (mismas del
// felicitaciones.html original).
export const ENCUESTAS = [
  { label: '📋 Perfil sociodemográfico', href: 'https://forms.gle/7zrhSJE9PC62LkfT9' },
  { label: '🛣️ Diagnóstico seguridad vial', href: 'https://forms.gle/6BZe3jRzzzowm3Ut7' },
]
