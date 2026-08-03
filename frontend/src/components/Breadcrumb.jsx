// Breadcrumb puramente presentacional: quien lo usa (AppLayout.jsx) calcula
// los segmentos a partir de la ruta actual + MODULOS_REGISTRO. Mantenerlo
// tonto aquí evita acoplar esta primitiva a la forma del registro de rutas.
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/cn.js'

export function Breadcrumb({ items }) {
  if (!items || items.length === 0) return null
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      {items.map((item, i) => {
        const esUltimo = i === items.length - 1
        return (
          <span key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />}
            {item.to && !esUltimo ? (
              <Link
                to={item.to}
                className="shrink-0 text-slate-500 transition-colors hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(
                  'truncate',
                  esUltimo ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
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
