import { ChevronRight, Gauge } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '../lib/cn.js'

export function Breadcrumb({ items }) {
  if (!items || items.length === 0) return null

  return (
    <nav aria-label="Navegación de migas de pan" className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
      {/* Ícono inicial de Panel de Control con resplandor neón */}
      <Link
        to="/dashboard"
        className="flex items-center gap-1.5 p-1.5 rounded-lg text-cyan-600 dark:text-cyan-300 hover:bg-cyan-500/10 transition-all duration-300 group"
        title="Ir a Panel de Control"
      >
        <div className="relative flex items-center justify-center p-1 rounded-md bg-cyan-500/10 border border-cyan-500/30 dark:shadow-[0_0_10px_rgba(6,182,212,0.3)] group-hover:scale-110 transition-transform">
          <Gauge className="h-3.5 w-3.5 text-cyan-500 dark:text-cyan-300" />
        </div>
      </Link>

      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cyan-500/40" />

      {items.map((item, i) => {
        const esUltimo = i === items.length - 1
        return (
          <span key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-2">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cyan-500/40" />}
            {item.to && !esUltimo ? (
              <Link
                to={item.to}
                className="shrink-0 font-medium text-slate-600 hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-300 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(
                  'truncate px-2 py-0.5 rounded-lg transition-all',
                  esUltimo
                    ? 'font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-500/10 dark:bg-cyan-400/15 border border-cyan-500/30 dark:shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                    : 'text-slate-500 dark:text-slate-400'
                )}
                aria-current={esUltimo ? 'page' : undefined}
              >
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
