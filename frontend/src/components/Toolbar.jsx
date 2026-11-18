// Barra de filtros consolidada: la exploración del código encontró 4
// variantes distintas hechas a mano (form+Input, form+Input+Btn, selects
// sueltos sin form, un Input de fecha solo) sin componente compartido. Este
// es solo el contenedor con spacing consistente — cada página sigue
// poniendo sus propios Field/Input/Select de ui.jsx adentro.
import { cn } from '../lib/cn.js'
import { Btn } from './ui.jsx'
import { SearchInput } from './ds/index.js'

export function Toolbar({ children, className = '' }) {
  return <div className={cn('mb-4 flex flex-wrap items-end gap-3', className)}>{children}</div>
}

export function ToolbarSearch({ value, onChange, placeholder = 'Buscar…', className = '', label = 'Buscar' }) {
  return (
    <label className={cn('block min-w-[14rem] flex-1', className)}>
      <span className="mb-1.5 block text-sm font-semibold text-tinta dark:text-slate-100">
        {label}
      </span>
      <SearchInput value={value} onChange={onChange} placeholder={placeholder} aria-label={label} />
    </label>
  )
}

export function ToolbarReset({ onClick, visible = true }) {
  if (!visible) return null
  return (
    <Btn variante="fantasma" onClick={onClick}>
      Limpiar
    </Btn>
  )
}
