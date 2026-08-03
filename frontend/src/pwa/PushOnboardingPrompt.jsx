import { Link } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { usePushOnboarding } from './usePushOnboarding.js'

// Aviso post-login para activar push, igual de discreto y descartable que
// InstallBanner.jsx (incluso comparten estética) pero independiente de él:
// uno es "instala la app", este es "déjala avisarte" — un usuario puede
// querer uno sin el otro. Vive en AppShell.jsx (dentro de la sesión
// autenticada), nunca en /login: pedir el permiso exige sesión, y la
// explicación previa (por qué se pide) es justo lo que reemplaza al patrón
// de pedirlo apenas carga la página.
export default function PushOnboardingPrompt() {
  const { visible, push, descartar } = usePushOnboarding()

  if (!visible) return null

  async function activar() {
    await push.activar()
    if (push.permiso === 'granted' || !push.error) descartar()
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-96 sm:p-0">
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600/10 text-sky-600 dark:text-sky-400">
          <Bell className="h-5 w-5" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Activa las notificaciones</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Entérate al instante de tickets, órdenes y requerimientos asignados, aunque tengas la app cerrada.
          </p>

          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={activar}
              disabled={push.cargando}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 disabled:opacity-60"
            >
              {push.cargando ? 'Activando…' : 'Activar'}
            </button>
            <Link
              to="/notificaciones"
              onClick={descartar}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              Más tarde
            </Link>
          </div>
          {push.error && <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{push.error}</p>}
        </div>

        <button
          onClick={descartar}
          aria-label="Cerrar aviso de notificaciones"
          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
