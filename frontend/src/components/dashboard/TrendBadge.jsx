// Insignia de tendencia: solo se renderiza cuando hay un delta REAL (actual
// vs. anterior, ambos vienen del backend — ver dashboard.controller.js). No
// existe una versión "placeholder" con número inventado a propósito: si el
// caller no tiene el dato, simplemente no pasa esta pieza.
import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '../../lib/cn.js'

// incrementoEsBueno: subir no siempre es la buena noticia (ej. "novedades
// abiertas" o "daños pendientes" subiendo es una alerta, no un logro) — el
// color refleja si el movimiento es favorable, no solo si es positivo.
export function TrendBadge({ actual, anterior, incrementoEsBueno = true, titulo = 'vs. periodo anterior' }) {
  if (typeof actual !== 'number' || typeof anterior !== 'number' || anterior === 0) return null

  const pct = Math.round(((actual - anterior) / anterior) * 100)
  if (pct === 0) {
    return (
      <span className="panel-mono inline-flex items-center gap-1 rounded-full bg-slate-400/10 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        Sin cambio
      </span>
    )
  }

  const sube = pct > 0
  const esFavorable = sube === incrementoEsBueno
  return (
    <span
      title={titulo}
      className={cn(
        'panel-mono inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        esFavorable
          ? 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300'
          : 'bg-rose-400/10 text-rose-700 dark:text-rose-300'
      )}
    >
      {sube ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
      {Math.abs(pct)}%
    </span>
  )
}
