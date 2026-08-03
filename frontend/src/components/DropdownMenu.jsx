// Menú desplegable accesible (Radix): usado por el perfil del sidebar y por
// cualquier acción contextual nueva. Wrapper delgado — se exportan las
// piezas ya estilizadas para componer el menú desde el call-site, en vez de
// una API rígida de "items" que no serviría para todos los casos.
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '../lib/cn.js'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuGroup = DropdownMenuPrimitive.Group
export const DropdownMenuSub = DropdownMenuPrimitive.Sub
export const DropdownMenuSubTrigger = DropdownMenuPrimitive.SubTrigger

const menuSurface = cn(
  'panel-mono z-50 min-w-[12rem] overflow-hidden rounded-xl border p-1.5 text-sm shadow-soft-lg outline-none',
  'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900',
  'data-[state=open]:animate-zoom-in data-[state=closed]:animate-fade-out'
)

export function DropdownMenuContent({ className = '', sideOffset = 8, align = 'end', ...props }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(menuSurface, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({ className = '', destructivo = false, ...props }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium outline-none transition-colors select-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        destructivo
          ? 'text-red-600 data-[highlighted]:bg-red-500/10 dark:text-red-400'
          : 'text-slate-700 data-[highlighted]:bg-brand-600/10 data-[highlighted]:text-brand-700 dark:text-slate-200 dark:data-[highlighted]:bg-brand-400/10 dark:data-[highlighted]:text-brand-300',
        className
      )}
      {...props}
    />
  )
}

export function DropdownMenuCheckboxItem({ className = '', children, checked, ...props }) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg py-2 pr-2.5 pl-8 text-[13px] font-medium outline-none select-none',
        'text-slate-700 data-[highlighted]:bg-brand-600/10 dark:text-slate-200 dark:data-[highlighted]:bg-brand-400/10',
        className
      )}
      {...props}
    >
      <DropdownMenuPrimitive.ItemIndicator className="absolute left-2.5 inline-flex">
        <Check className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
      </DropdownMenuPrimitive.ItemIndicator>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

export function DropdownMenuLabel({ className = '', ...props }) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase dark:text-slate-500', className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({ className = '' }) {
  return <DropdownMenuPrimitive.Separator className={cn('my-1.5 h-px bg-slate-200 dark:bg-white/10', className)} />
}

export function DropdownMenuSubContent({ className = '', ...props }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent className={cn(menuSurface, className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuSubTriggerIcon() {
  return <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" aria-hidden="true" />
}
