import { ShoppingCart, Check, X, Loader2, CircleAlert } from 'lucide-react'
import { cn } from '../../lib/cn'

// Tarjeta de confirmación del borrador que arma preparar_requerimiento_compra
// (ver Backend/copiloto.herramientas.js). Es el ÚNICO lugar de toda la app
// donde presionar un botón hace que algo sugerido por la IA quede guardado de
// verdad — por diseño, ni el modelo ni el resto del código del chat pueden
// saltarse este paso (ver copiloto.controller.js#confirmarRequerimientoCompra:
// un endpoint aparte que el modelo nunca invoca).
export function CopilotoBorradorRequerimiento({ borrador, onConfirmar, onDescartar, enviando = false, error = '' }) {
  if (!borrador) return null

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 dark:bg-cyan-500/10 p-3.5 shadow-[0_0_20px_rgba(6,182,212,0.08)]">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/15 border border-cyan-500/30 shrink-0">
          <ShoppingCart className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800 dark:text-cyan-200 leading-tight">
            Borrador de requerimiento de compra
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
            Sin confirmar — nadie ha sido notificado todavía
          </p>
        </div>
      </div>

      {borrador.areaOProceso && (
        <p className="text-xs text-slate-600 dark:text-slate-300 mb-1.5">
          <span className="font-semibold">Área/proceso:</span> {borrador.areaOProceso}
        </p>
      )}

      <ul className="space-y-1 mb-3">
        {borrador.items.map((item, i) => (
          <li
            key={i}
            className="flex items-baseline gap-1.5 rounded-lg bg-white/60 dark:bg-slate-900/50 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200"
          >
            <span className="font-bold text-cyan-600 dark:text-cyan-400 shrink-0">{item.cantidad}×</span>
            <span className="flex-1 min-w-0">
              {item.descripcionProducto}
              {item.destino && <span className="text-slate-400 dark:text-slate-500"> — {item.destino}</span>}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{item.fechaSolicitud}</span>
          </li>
        ))}
      </ul>

      {error && (
        <p className="flex items-start gap-1.5 mb-2.5 text-[11px] text-red-600 dark:text-red-300">
          <CircleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
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
          <X className="h-3.5 w-3.5" /> Descartar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={enviando}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white transition-all',
            'bg-gradient-to-r from-cyan-600 to-sky-600 hover:shadow-[0_0_16px_rgba(6,182,212,0.5)] disabled:opacity-70'
          )}
        >
          {enviando ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando…
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" /> Confirmar y enviar
            </>
          )}
        </button>
      </div>
    </div>
  )
}
