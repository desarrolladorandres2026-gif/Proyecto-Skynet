import { Link } from 'react-router-dom'
import { Flame, ArrowRight, Clock, ShieldAlert } from 'lucide-react'
import { cn } from '../../lib/cn.js'

const PRIORIDAD_COLORES = {
  critica: 'bg-rose-500/10 text-rose-700 border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  alta: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  media: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30',
  baja: 'bg-slate-500/10 text-slate-700 border-slate-500/20 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30',
}

export function ColaAtencionPrioritaria({ cola = [], className = '' }) {
  if (!cola || cola.length === 0) return null

  return (
    <div className={cn('flex flex-col rounded-xl border border-slate-200 bg-white/95 p-4 shadow-soft-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/70 w-full', className)}>
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-500/10 text-rose-600 border border-rose-500/20 shadow-xs dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30">
            <Flame className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            Cola de Atención Prioritaria
            <span className="panel-mono text-[10px] font-semibold bg-rose-500/10 text-rose-700 border border-rose-500/20 px-2 py-0.5 rounded-full dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30">
              {cola.length}
            </span>
          </h2>
        </div>
      </div>

      <div className="mt-3 space-y-2 overflow-y-auto max-h-[480px] pr-1 scrollbar-thin">
        {cola.map((item) => {
          const badgeClass = PRIORIDAD_COLORES[item.prioridad] || PRIORIDAD_COLORES.media
          const fechaFormateada = item.fecha ? new Intl.DateTimeFormat('es-CO', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(item.fecha)) : ''

          return (
            <div
              key={item.id}
              className="group flex items-center justify-between gap-2.5 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2 transition-colors hover:bg-slate-100/80 dark:border-slate-800/60 dark:bg-slate-950/40 dark:hover:bg-slate-800/40"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="shrink-0">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="panel-mono text-[9px] font-semibold uppercase text-brand-700 dark:text-brand-400">
                      [{item.modulo}]
                    </span>
                    <span className={cn('panel-mono text-[9px] font-semibold uppercase px-1 py-0.2 rounded border', badgeClass)}>
                      {item.prioridad || item.estado}
                    </span>
                    {fechaFormateada && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {fechaFormateada}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-slate-900 group-hover:text-brand-600 dark:text-white dark:group-hover:text-cyan-200 transition-colors truncate">
                    {item.titulo}
                  </p>
                </div>
              </div>

              <div className="shrink-0">
                <Link
                  to={item.to}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-brand-600 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-white dark:bg-slate-800 dark:hover:bg-brand-600 dark:text-slate-200 dark:hover:text-white transition-all shadow-xs"
                >
                  Atender
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
