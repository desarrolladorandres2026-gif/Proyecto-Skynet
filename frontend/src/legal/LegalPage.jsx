import { Link } from 'react-router-dom'
import { ArrowLeft, Download } from 'lucide-react'
import { generarPoliticasPdf } from '../pdf/politicasPdf.js'

const ACTUALIZADO = '25 de julio de 2026'

function Seccion({ id, titulo, children }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-slate-200 pt-6 first:border-t-0 first:pt-0 dark:border-slate-800">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{titulo}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {children}
      </div>
    </section>
  )
}

export default function LegalPage() {
  return (
    <div className="min-h-svh bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver
        </Link>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">
            Terminal de Transportes de Neiva
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
            Políticas del Sistema de Gestión Integral
          </h1>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Revisadas y aprobadas: {ACTUALIZADO}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => generarPoliticasPdf()}
              className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Descargar PDF
            </button>
          </div>

          <nav className="mt-6 flex flex-wrap gap-2 text-xs font-medium">
            <a href="#alcance" className="rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:border-sky-400 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-400">
              Alcance del SGI
            </a>
            <a href="#politica-sgi" className="rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:border-sky-400 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-400">
              Política del SGI
            </a>
            <a href="#prevencion-spa" className="rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:border-sky-400 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-400">
              Prevención alcohol, tabaco y SPA
            </a>
            <a href="#no-discriminacion" className="rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:border-sky-400 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-400">
              No discriminación
            </a>
            <a href="#privacidad" className="rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:border-sky-400 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-400">
              Política de privacidad
            </a>
          </nav>

          <div className="mt-8 space-y-8">
            <Seccion id="alcance" titulo="Alcance del Sistema de Gestión Integral">
              <p>
                Administración de Terminal de Transportes y operación de servicios de transporte, incluyendo los
                servicios auxiliares (arrendamiento inmobiliario y de baterías sanitarias) y sus servicios
                complementarios (zonas operativas) en sus instalaciones de la ciudad de Neiva.
              </p>
              <p className="font-medium text-slate-700 dark:text-slate-200">No aplicabilidad</p>
              <p>
                Bajo el modelo normativo ISO 9001:2015 no aplica el numeral 8.3 Diseño y Desarrollo de los
                productos y servicios, debido a que el servicio prestado en el Terminal de Transporte de Neiva se
                encuentra regulado por la normatividad legal vigente; por lo tanto, no se realizan actividades
                diferentes a las referidas en la norma.
              </p>
              <p className="font-medium text-slate-700 dark:text-slate-200">
                Objetivos del Sistema de Gestión Integral (SGI)
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Propender por la generación de rentabilidad económica.</li>
                <li>Mejorar continuamente el SGI.</li>
                <li>Lograr la satisfacción del cliente.</li>
                <li>
                  Garantizar el cumplimiento de los requisitos legales aplicables y otros requisitos que la
                  organización suscriba.
                </li>
                <li>
                  Prevenir y minimizar la contaminación por aspectos e impactos ambientales significativos en la
                  prestación del servicio.
                </li>
                <li>Prevenir accidentes de trabajo y enfermedades laborales en la prestación del servicio.</li>
                <li>
                  Promover la participación y consulta de los trabajadores en la planificación, implementación,
                  evaluación y mejora continua del SGI.
                </li>
                <li>Mejorar la competencia del personal para la prestación del servicio.</li>
              </ul>
            </Seccion>

            <Seccion id="politica-sgi" titulo="Política del Sistema de Gestión Integral SGI">
              <p>
                El Terminal de Transportes de Neiva S.A., es una empresa dedicada a la administración de la
                operación de transporte como una unidad de servicios permanente en la ciudad de Neiva (Huila); que
                está comprometida a nivel directivo con el mejoramiento continuo del Sistema de Gestión Integral,
                estableciendo acciones de promoción del sistema de gestión integral, suministrando y garantizando
                los recursos para la planificación, implementación y seguimiento del Sistema de Gestión Integral,
                a partir del cumplimiento de los siguientes objetivos:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Asegurar la satisfacción del cliente con respecto al cumplimiento de sus requisitos por parte de
                  la organización.
                </li>
                <li>
                  Cumplir la legislación colombiana aplicable y otros requisitos que haya suscrito la
                  organización en materia de calidad, medio ambiente, seguridad y salud en el trabajo y de
                  seguridad vial.
                </li>
                <li>
                  Usar racionalmente los recursos naturales, disminuyendo los impactos ambientales de las
                  actividades realizadas y de esta manera preservar el medio ambiente a través del establecimiento
                  y la implementación de programas ambientales.
                </li>
                <li>
                  Propiciar un ambiente de trabajo seguro y saludable, que permita la prevención de incidentes,
                  accidentes de trabajo, enfermedades laborales y siniestros viales, con alcance sobre los
                  desplazamientos laborales y los trayectos en itinere para todos sus colaboradores; mediante la
                  gestión de los riesgos, a través de la identificación de peligros, la evaluación y valoración de
                  los riesgos, estableciendo las medidas de control pertinentes y la identificación de
                  oportunidades, que garanticen la seguridad y salud de los trabajadores.
                </li>
                <li>
                  Fortalecer la competencia del personal y su compromiso con el Sistema de Gestión Integral,
                  promoviendo la consulta y participación activa de los trabajadores en las diferentes actividades
                  y programas de gestión.
                </li>
              </ul>
              <p>Esta política deberá ser comunicada y estará disponible para todas las partes interesadas.</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Revisada y aprobada, a los veinticinco (25) días del mes de julio de 2026 — Rahda Hermosa Camacho,
                Gerente.
              </p>
            </Seccion>

            <Seccion
              id="prevencion-spa"
              titulo="Política de prevención para el no consumo de alcohol, tabaco y sustancias psicoactivas"
            >
              <p>
                El Terminal de Transportes de Neiva S.A., en su compromiso con el medio ambiente y la protección
                de la salud y el bienestar de sus trabajadores, adopta la presente política con el fin de
                garantizar un entorno libre de consumo de tabaco, aerosoles emitidos por sucedáneos e imitadores de
                alcohol y sustancias psicoactivas, y en consecuencia prohíbe la posesión, distribución, venta y/o
                consumo de los trabajadores, contratistas y subcontratistas en las instalaciones de la empresa o
                cualquier otro sitio, mientras se estén cumpliendo funciones propias del cargo o usando el
                uniforme o distintivos propios del Terminal, conforme a la Ley 1566 de 2012, la Ley 1335 de 2009 y
                la Resolución 089 de 2019 del Ministerio de Salud y Protección Social.
              </p>
              <p className="font-medium text-slate-700 dark:text-slate-200">Objetivo</p>
              <p>
                Establecer lineamientos claros para la prevención del consumo de sustancias que afectan la salud y
                el desempeño laboral, promoviendo la adopción de hábitos saludables y el cumplimiento de la
                normativa vigente en materia de seguridad y salud en el trabajo.
              </p>
              <p className="font-medium text-slate-700 dark:text-slate-200">Alcance</p>
              <p>
                Esta política aplica a todos los trabajadores, contratistas, usuarios, visitantes y cualquier
                persona que ingrese a las instalaciones del Terminal de Transportes de Neiva, conforme a lo
                dispuesto en la Ley 1566 de 2012, que reconoce el consumo de sustancias psicoactivas como un
                asunto de salud pública.
              </p>
              <p className="font-medium text-slate-700 dark:text-slate-200">Principios de la política</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Prevención: desarrollo de programas de sensibilización y educación sobre los efectos nocivos del
                  consumo de sustancias.
                </li>
                <li>Cumplimiento legal: aplicación de la normatividad vigente en materia de salud ocupacional.</li>
                <li>
                  Intervención: apoyo a trabajadores que requieran orientación sobre prevención y tratamiento de
                  adicciones.
                </li>
              </ul>
              <p className="font-medium text-slate-700 dark:text-slate-200">Prohibiciones</p>
              <p>
                De conformidad con la Ley 1335 de 2009 y el Decreto 1072 de 2015, se prohíbe de manera estricta el
                consumo, porte, distribución, comercialización o cualquier tipo de tenencia de productos derivados
                del tabaco, bebidas alcohólicas y/o sustancias psicoactivas dentro de las instalaciones de la
                empresa, sin excepción alguna. Así mismo, se prohíbe el ingreso y permanencia en las instalaciones
                de personas que se encuentren bajo los efectos de alcohol, tabaco o sustancias psicoactivas, por
                representar un riesgo para la seguridad, el ambiente laboral y el cumplimiento de las funciones
                asignadas. El incumplimiento podrá dar lugar a las sanciones disciplinarias correspondientes,
                conforme al reglamento interno de trabajo y la normatividad vigente.
              </p>
              <p className="font-medium text-slate-700 dark:text-slate-200">
                Prohibición a visitantes y entornos libres de humo
              </p>
              <p>
                Con fundamento en los artículos 18 y 19 de la Ley 1335 de 2009, el Terminal reconoce el derecho de
                las personas no fumadoras a respirar aire puro y libre de humo de tabaco. Queda estrictamente
                prohibido a todos los visitantes fumar o consumir productos derivados del tabaco, aerosoles,
                alcohol o sustancias psicoactivas dentro de las instalaciones cerradas del Terminal (áreas
                comunes, salas de espera, cafeterías, baños, andenes cubiertos y demás espacios señalados en la
                ley), así como ingresar o permanecer bajo sus efectos.
              </p>
              <p className="font-medium text-slate-700 dark:text-slate-200">Supervisión y cumplimiento</p>
              <p>
                El Terminal se reserva el derecho de realizar requisas, inspecciones y pruebas aleatorias sin
                previo aviso, conforme al artículo 56 del Código Sustantivo del Trabajo. Quienes incumplan esta
                política estarán sujetos a las medidas del Reglamento Interno de Trabajo (trabajadores) o al
                retiro inmediato de las instalaciones, con apoyo de la Policía Nacional en caso de reincidencia o
                negativa (visitantes y particulares), en aplicación del parágrafo del artículo 19 de la Ley 1335
                de 2009.
              </p>
              <p className="font-medium text-slate-700 dark:text-slate-200">Vigencia y difusión</p>
              <p>
                Esta política será difundida entre los trabajadores, contratistas y subcontratistas de la
                organización por medio de avisos visibles al público, la página oficial del Terminal y circulares
                internas. Rige a partir de su fecha de aprobación.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                En Neiva (H), a los veinticinco (25) días del mes de julio de 2026 — Rahda Hermosa Camacho,
                Gerente.
              </p>
            </Seccion>

            <Seccion id="no-discriminacion" titulo="Política de no discriminación">
              <p>
                El Terminal de Transporte de Neiva S.A. está comprometido a ofrecer a todos sus colaboradores,
                proveedores, clientes y demás partes interesadas:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Acciones de prevención y eliminación de todo acto de discriminación.</li>
                <li>
                  Mecanismos de denuncia y rutas de atención para prevenir y solucionar eficaz y oportunamente los
                  casos de discriminación que se puedan presentar en las actividades y procesos de la
                  organización.
                </li>
                <li>
                  Trato justo y equitativo a todos los clientes que requieren los servicios del Terminal, sin
                  importar su condición física, raza, religión, ideología, cultura o cualquier otra situación que
                  los distinga.
                </li>
                <li>Respeto por la diversidad y la individualidad, y la igualdad de oportunidades.</li>
                <li>La propagación de una cultura plural y tolerante, y el rechazo absoluto a todo acto de violencia.</li>
                <li>La anulación de toda práctica que atente contra la dignidad de las personas.</li>
                <li>El impulso a la equidad de género y la equidad laboral.</li>
                <li>
                  El respeto del derecho a la libre expresión de las ideas y la convivencia respetuosa e
                  incluyente.
                </li>
              </ul>
              <p>
                En la organización se promueve la cultura de no discriminación hacia cualquier persona en los
                aspectos de selección, contratación, promoción de cargos y condiciones de empleo, por motivos de
                sexo, raza, color de piel, edad, origen, nacionalidad, religión, discapacidad, orientación sexual,
                identidad de género, embarazo, creencia política, apariencia física, o cualquier otro factor que
                imposibilite la igualdad entre las personas, ya sean colaboradores, clientes y/o proveedores.
              </p>
              <p>
                El personal del Terminal de Transporte de Neiva S.A. es responsable de cumplir con la igualdad de
                condiciones de trabajo que plantea esta política. Será difundida entre los trabajadores,
                contratistas y subcontratistas de la organización y rige a partir de su fecha de aprobación.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                En Neiva (H), a los veinticinco (25) días del mes de julio de dos mil veintiséis (2026) — Rahda
                Hermosa Camacho, Gerente.
              </p>
            </Seccion>

            <Seccion id="privacidad" titulo="Política de privacidad y tratamiento de datos">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
                  Responsable del tratamiento
                </p>
                <p><span className="font-medium text-slate-700 dark:text-slate-200">Razón social:</span> Terminal de Transportes de Neiva S.A.</p>
                <p><span className="font-medium text-slate-700 dark:text-slate-200">NIT:</span> 891.102.824-3</p>
                <p><span className="font-medium text-slate-700 dark:text-slate-200">Dirección:</span> Tv. 5 5-312 Piso 3, Zona Industrial, Neiva, Huila, Colombia</p>
                <p><span className="font-medium text-slate-700 dark:text-slate-200">Correo de contacto:</span> contabilidad@elterminalneiva.com</p>
                <p><span className="font-medium text-slate-700 dark:text-slate-200">Teléfono:</span> (317) 440 5981</p>
              </div>
              <p>
                Skynet trata los datos personales de sus usuarios (nombre, correo, cargo, dependencia y
                registros de actividad dentro del sistema) con el único fin de operar la plataforma:
                autenticación, asignación de tareas, trazabilidad y generación de reportes internos.
              </p>
              <p>
                Estos datos no se comparten con terceros ajenos al Terminal de Transporte de Neiva, salvo
                obligación legal. El acceso interno está limitado por el rol de cada usuario y queda
                registrado en el módulo de auditoría.
              </p>
              <p>
                Se almacenan cookies y datos en el navegador estrictamente necesarios para mantener la
                sesión iniciada, recordar preferencias (tema, notificaciones) y proteger la plataforma. No se
                usan cookies de rastreo publicitario ni de terceros.
              </p>
              <p>
                Todo usuario puede solicitar a un administrador la consulta, corrección o eliminación de sus
                datos personales, conforme a la Ley 1581 de 2012 y demás normas colombianas aplicables en
                materia de protección de datos.
              </p>
            </Seccion>
          </div>
        </div>
      </div>
    </div>
  )
}
