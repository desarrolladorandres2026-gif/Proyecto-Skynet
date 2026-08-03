// Tabs accesibles (Radix): reemplazo directo del patrón "ChipTabs" que ya
// existía en mobileUi.jsx pero solo para el shell móvil — esta versión es
// la del panel denso (teclado con flechas, panel asociado por aria-*).
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../lib/cn.js'

export const Tabs = TabsPrimitive.Root

export function TabsList({ className = '', ...props }) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/70 p-1 dark:border-white/10 dark:bg-white/5',
        className
      )}
      {...props}
    />
  )
}

export function TabsTrigger({ className = '', ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'panel-mono rounded-lg px-3 py-1.5 text-[12px] font-semibold tracking-wide text-slate-500 transition-all',
        'hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
        'data-[state=active]:bg-white data-[state=active]:text-brand-700 data-[state=active]:shadow-soft-xs',
        'dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-brand-300',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
        className
      )}
      {...props}
    />
  )
}

export function TabsContent({ className = '', ...props }) {
  return <TabsPrimitive.Content className={cn('mt-4 focus-visible:outline-none', className)} {...props} />
}
