import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

const ACTUALIZADO = '18 de agosto de 2026'

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
            Terminal de Transporte de Neiva
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
            Términos y condiciones · Política de privacidad
          </h1>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Última actualización: {ACTUALIZADO}
          </p>

          <nav className="mt-6 flex flex-wrap gap-2 text-xs font-medium">
            <a href="#terminos" className="rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:border-sky-400 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-400">
              Términos y condiciones
            </a>
            <a href="#privacidad" className="rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:border-sky-400 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-400">
              Política de privacidad
            </a>
          </nav>

          <div className="mt-8 space-y-8">
            <Seccion id="terminos" titulo="1. Términos y condiciones de uso">
              <p>
                Skynet es el sistema interno de gestión del Terminal de Transporte de Neiva. El acceso está
                restringido a personal autorizado mediante una cuenta nominal asignada por un administrador;
                no está disponible para el público general.
              </p>
              <p>
                Cada usuario es responsable de la confidencialidad de su contraseña y de toda actividad
                realizada bajo su sesión. Las credenciales son personales e intransferibles: no deben
                compartirse ni usarse desde cuentas de terceros.
              </p>
              <p>
                El sistema debe usarse únicamente para las funciones propias del cargo (mantenimiento,
                requerimientos, ausencias, gestión documental y demás módulos habilitados según el rol
                asignado). El acceso a datos por fuera del alcance del rol, la alteración de registros de
                auditoría o cualquier intento de vulnerar los controles de seguridad constituye uso indebido
                y puede dar lugar a las medidas administrativas o disciplinarias a que haya lugar.
              </p>
              <p>
                El Terminal puede actualizar, suspender o modificar funcionalidades del sistema en cualquier
                momento por motivos de mantenimiento, mejora o seguridad, procurando el menor impacto posible
                en la operación.
              </p>
            </Seccion>

            <Seccion id="privacidad" titulo="2. Política de privacidad y tratamiento de datos">
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
