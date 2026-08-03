// Checkbox accesible (Radix): reemplaza los <input type="checkbox"> nativos
// sueltos que había en formularios como RolesPage (matriz de permisos).
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '../lib/cn.js'

export function Checkbox({ className = '', ...props }) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        'border-slate-300 bg-white data-[state=checked]:border-brand-600 data-[state=checked]:bg-brand-600',
        'dark:border-slate-600 dark:bg-white/5 dark:data-[state=checked]:border-brand-500 dark:data-[state=checked]:bg-brand-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel-bg)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

// Conveniencia para el patrón "checkbox + texto" que se repite en formularios.
export function CheckboxLabel({ checked, onCheckedChange, disabled, children, className = '' }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      {children}
    </label>
  )
}
