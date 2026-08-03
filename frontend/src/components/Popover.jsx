// Popover accesible (Radix): base para paneles flotantes puntuales (filtros
// avanzados, selectores de fecha, etc.) que no ameritan un Modal completo.
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '../lib/cn.js'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor

export function PopoverContent({ className = '', sideOffset = 8, align = 'start', ...props }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 rounded-xl border p-4 shadow-soft-lg outline-none',
          'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900',
          'data-[state=open]:animate-zoom-in data-[state=closed]:animate-fade-out',
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}
