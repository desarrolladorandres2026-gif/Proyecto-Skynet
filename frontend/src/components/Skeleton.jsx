// Skeleton propio (sin react-loading-skeleton): un div con animate-pulse ya
// cubre el caso de uso y hereda directamente la escala de radios/colores del
// sistema en vez de necesitar su propio theming.
import { cn } from '../lib/cn.js'

export function Skeleton({ className = '' }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200/70 dark:bg-white/8', className)} aria-hidden="true" />
}

export function SkeletonStatCards({ cantidad = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="panel-card rounded-xl p-4">
          <Skeleton className="mb-3 h-5 w-5 rounded-md" />
          <Skeleton className="mb-2 h-7 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ filas = 5, columnas = 4 }) {
  return (
    <div className="panel-table-wrap overflow-hidden rounded-xl">
      <table className="min-w-full">
        <tbody>
          {Array.from({ length: filas }).map((_, fila) => (
            <tr key={fila} className="panel-row">
              {Array.from({ length: columnas }).map((_, col) => (
                <td key={col} className="px-3 py-3">
                  <Skeleton className="h-4 w-full max-w-[10rem]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
