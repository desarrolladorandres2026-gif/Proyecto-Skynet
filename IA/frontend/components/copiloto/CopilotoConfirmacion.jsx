import { ShieldAlert, Check, X, Loader2, CircleAlert } from 'lucide-react'
import { cn } from '../../lib/cn'

// Tarjeta de confirmación de una acción que el modelo propuso pero que el
// servidor NO ejecutó (ver Backend/.../copiloto.confirmaciones.js).
//
// ── Por qué esto es un botón y no un "sí" escrito en el chat ────────────────
// Un "sí" en el chat es texto que interpreta el modelo, y el modelo se puede
// convencer de que ya lo recibió: basta un turno anterior donde el usuario
// dijera "sí" a otra cosa, o un mensaje redactado para llevarlo ahí. Este
// botón manda un token que el modelo nunca vio a un endpoint que no lo
// consulta, así que no hay nada que se pueda escribir en el chat que dispare
// la acción.
//
// Se diferencia visualmente del borrador de requerimiento (ámbar/rojo en vez
// de cian) a propósito: son dos cosas distintas y confundirlas es justo lo que
// hace que la gente pulse "confirmar" por inercia. El cian es el color del
// asistente; esto NO es el asistente hablando, es una decisión del usuario.
export function CopilotoConfirmacion({ confirmacion, onConfirmar, onDescartar, enviando = false, error = '' }) {
  if (!confirmacion) return null

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10 p-3.5 shadow-[0_0_20px_rgba(245,158,11,0.10)]">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 border border-amber-500/30 shrink-0">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800 dark:text-amber-200 leading-tight">
            Confirma esta acción
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
            Todavía no se ha ejecutado nada
          </p>
        </div>
      </div>

      <p className="mb-3 rounded-lg bg-white/60 dark:bg-slate-900/50 px-2.5 py-2 text-xs text-slate-700 dark:text-slate-200">
        {confirmacion.descripcion || 'Esta acción modificará información del sistema de forma permanente.'}
      </p>

      {error && (
        <p className="flex items-start gap-1.5 mb-2.5 text-[11px] text-red-600 dark:text-red-300">
          <CircleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDescartar}
          disabled={enviando}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 dark:text-slate-400 transition-colors disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={enviando}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white transition-all',
            'bg-gradient-to-r from-amber-600 to-orange-600 hover:shadow-[0_0_16px_rgba(245,158,11,0.5)] disabled:opacity-70'
          )}
        >
          {enviando ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Ejecutando…
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Sí, continuar
            </>
          )}
        </button>
      </div>
    </div>
  )
}
