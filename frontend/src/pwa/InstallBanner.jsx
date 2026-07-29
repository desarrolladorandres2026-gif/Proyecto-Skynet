import { usePwaInstall } from './usePwaInstall.js'

export default function InstallBanner() {
  const { visible, esIos, instalar, descartar } = usePwaInstall()

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96 sm:p-0">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <img src="/icons/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Instala Skynet</p>
          {esIos ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              En Safari toca el botón Compartir y luego «Añadir a pantalla de inicio».
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Úsala como app en tu celular o escritorio, con notificaciones.
            </p>
          )}
        </div>

        {!esIos && (
          <button
            onClick={instalar}
            className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700"
          >
            Instalar
          </button>
        )}

        <button
          onClick={descartar}
          aria-label="Cerrar aviso de instalación"
          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
