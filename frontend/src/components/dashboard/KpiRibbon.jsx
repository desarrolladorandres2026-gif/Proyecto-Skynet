import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '../../lib/cn.js'

const TONO_RIBBON = {
  brand: {
    bg: 'bg-brand-50/80 hover:bg-brand-100/80 border-brand-200/80 text-brand-700 dark:bg-brand-950/40 dark:hover:bg-brand-900/50 dark:border-brand-500/25 dark:text-brand-300',
    badge: 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200',
    dot: 'bg-brand-500 dark:bg-brand-400',
    iconBg: 'bg-brand-500/10 text-brand-600 dark:bg-black/30 dark:text-brand-300',
  },
  emerald: {
    bg: 'bg-emerald-50/80 hover:bg-emerald-100/80 border-emerald-200/80 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 dark:border-emerald-500/25 dark:text-emerald-300',
    badge: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    iconBg: 'bg-emerald-500/10 text-emerald-600 dark:bg-black/30 dark:text-emerald-300',
  },
  amber: {
    bg: 'bg-amber-50/80 hover:bg-amber-100/80 border-amber-200/80 text-amber-700 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 dark:border-amber-500/25 dark:text-amber-300',
    badge: 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
    dot: 'bg-amber-500 dark:bg-amber-400',
    iconBg: 'bg-amber-500/10 text-amber-600 dark:bg-black/30 dark:text-amber-300',
  },
  rose: {
    bg: 'bg-rose-50/80 hover:bg-rose-100/80 border-rose-200/80 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 dark:border-rose-500/25 dark:text-rose-300',
    badge: 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
    dot: 'bg-rose-500 dark:bg-rose-400',
    iconBg: 'bg-rose-500/10 text-rose-600 dark:bg-black/30 dark:text-rose-300',
  },
  violet: {
    bg: 'bg-violet-50/80 hover:bg-violet-100/80 border-violet-200/80 text-violet-700 dark:bg-violet-950/40 dark:hover:bg-violet-900/50 dark:border-violet-500/25 dark:text-violet-300',
    badge: 'bg-violet-500/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200',
    dot: 'bg-violet-500 dark:bg-violet-400',
    iconBg: 'bg-violet-500/10 text-violet-600 dark:bg-black/30 dark:text-violet-300',
  },
}

export function KpiRibbon({ visibles = [], tarjetas = {}, className = '' }) {
  if (!tarjetas || visibles.length === 0) return null

  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 3xl:grid-cols-6 gap-[var(--ui-gap)] w-full', className)}>
      {visibles.map((item) => {
        const Icono = item.icon
        const tono = TONO_RIBBON[item.tono] || TONO_RIBBON.brand
        const valor = tarjetas[item.clave] ?? 0

        return (
          <Link
            key={item.clave}
            to={item.to}
            className={cn(
              'group relative flex items-center justify-between gap-2.5 rounded-xl border p-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft-sm backdrop-blur-md w-full',
              tono.bg
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tono.iconBg)}>
                <Icono className="h-4 w-4" />
              </div>

              <div className="flex flex-col min-w-0">
                <span
                  className="panel-mono text-[10px] uppercase tracking-wider text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-200 transition-colors leading-tight"
                  style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  title={item.label}
                >
                  {item.label}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
                    {valor}
                  </span>
                  <span className={cn('h-1.5 w-1.5 rounded-full', tono.dot)} />
                </div>
              </div>
            </div>

            <ArrowUpRight className="h-4 w-4 text-slate-400 opacity-0 transition-all group-hover:opacity-100 group-hover:text-slate-800 dark:text-slate-500 dark:group-hover:text-white shrink-0" />
          </Link>
        )
      })}
    </div>
  )
}
