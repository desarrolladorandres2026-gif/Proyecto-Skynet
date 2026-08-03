// Tooltip accesible (Radix): usado sobre todo por el sidebar colapsado de
// AppLayout.jsx, donde solo queda el ícono visible y el label necesita
// aparecer al pasar el mouse o al enfocar con teclado.
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '../lib/cn.js'

export function TooltipProvider({ children }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={100}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export function Tooltip({ label, children, side = 'right' }) {
  if (!label) return children
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          className={cn(
            'panel-mono z-50 rounded-md border px-2.5 py-1.5 text-[11px] font-medium tracking-wide shadow-soft-md',
            'border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200',
            'data-[state=delayed-open]:animate-fade-in'
          )}
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-white dark:fill-slate-900" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
