import { useState } from 'react'
import { cn } from '../../lib/cn.js'

// Botón "Filtros" con la forma de HeaderButton: despliega `children` (los
// campos del filtro) debajo en un panel con borde propio. `hayFiltros`
// cambia la etiqueta a "Filtros (activos)" cuando alguno está puesto.
export function FilterBar({ hayFiltros = false, children, className }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="inline-flex items-center rounded-full border border-borde-fuerte bg-papel px-4 py-2 text-sm font-semibold text-tinta"
      >
        {abierto ? 'Ocultar filtros' : hayFiltros ? 'Filtros (activos)' : 'Filtros'}
      </button>
      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
          abierto ? 'mt-3 grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden border-t border-borde pt-3">
          <div className="flex flex-wrap items-end gap-3">{children}</div>
        </div>
      </div>
    </div>
  )
}
