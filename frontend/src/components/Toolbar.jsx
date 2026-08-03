// Barra de filtros consolidada: la exploración del código encontró 4
// variantes distintas hechas a mano (form+Input, form+Input+Btn, selects
// sueltos sin form, un Input de fecha solo) sin componente compartido. Este
// es solo el contenedor con spacing consistente — cada página sigue
// poniendo sus propios Field/Input/Select de ui.jsx adentro.
import { Search, X } from 'lucide-react'
import { cn } from '../lib/cn.js'
import { Btn } from './ui.jsx'

export function Toolbar({ children, className = '' }) {
  return <div className={cn('mb-4 flex flex-wrap items-end gap-3', className)}>{children}</div>
}

export function ToolbarSearch({ value, onChange, placeholder = 'Buscar…', className = '', label = 'Buscar' }) {
  return (
    <label className={cn('relative block min-w-[14rem] flex-1', className)}>
      <span className="panel-mono mb-1.5 block text-[11px] tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">
        {label}
      </span>
      <Search className="pointer-events-none absolute top-1/2 left-3 mt-[0.3rem] h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="panel-input w-full rounded-lg py-2 pr-3 pl-9 text-sm"
      />
    </label>
  )
}

export function ToolbarReset({ onClick, visible = true }) {
  if (!visible) return null
  return (
    <Btn variante="fantasma" onClick={onClick}>
      <X className="h-3.5 w-3.5" aria-hidden="true" />
      Limpiar
    </Btn>
  )
}
