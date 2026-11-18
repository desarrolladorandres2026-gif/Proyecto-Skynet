import { forwardRef } from 'react'
import { cn } from '../../lib/cn.js'
import { IconoPapelera, iconoPorTexto } from './iconos.jsx'

const VARIANTES = {
  primary: 'btn-sk',
  danger: 'btn-sk btn-sk--danger',
  secondary: 'btn-sk',
}

// Botón rectangular plano: sin sombra ni animación. El estado busy cambia el
// texto a "Procesando…" en vez de superponer un spinner — mismo tamaño,
// sin layout shift ni dibujo adicional que mantener sincronizado.
export const Button = forwardRef(function Button(
  { variant = 'primary', busy = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      disabled={disabled || busy}
      className={cn(
        'text-sm',
        VARIANTES[variant],
        className,
      )}
      {...props}
    >
      {busy ? 'Procesando…' : children}
    </button>
  )
})

// Botón de fila: sin borde ni fondo, solo texto de color + un dibujo lineal
// a la izquierda que se infiere del propio texto visible (ver iconos.jsx).
// Pensado para acciones dentro de una tabla (Ver/Editar/Anular/Cobrar/...).
export const TextButton = forwardRef(function TextButton(
  { danger = false, icon, className, children, ...props },
  ref,
) {
  const Icono = icon ?? iconoPorTexto(typeof children === 'string' ? children : '')
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      className={cn(
        'group inline-flex items-center gap-1.5 text-sm font-medium transition-colors motion-reduce:transition-none',
        danger ? 'text-rojo hover:text-rojo-oscuro' : 'text-azul hover:text-azul-oscuro',
        className,
      )}
      {...props}
    >
      <Icono className="h-4 w-4 shrink-0 transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-hover:scale-110 motion-reduce:transition-none motion-reduce:transform-none" />
      <span>{children}</span>
    </button>
  )
})

// Alias: mismo componente, nombre usado donde la acción es explícitamente
// de lectura ("Ver detalle") — conservado aparte porque así lo pide el
// sistema de diseño, aunque hoy sea un simple re-export.
export const ViewButton = TextButton

// Círculo oscuro de 32px que, al pasar el cursor o enfocar, se estira a una
// píldora roja de 96px revelando el texto. El ancho fijo (w-8 -> w-24) es lo
// que anima: el icono y el texto quedan absolutamente posicionados dentro
// para no reflow-ear el resto de la fila mientras se estira.
export function DeleteButton({ texto = 'Eliminar', className, ...props }) {
  return (
    <button
      type="button"
      aria-label={texto}
      className={cn(
        'group relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tinta text-papel transition-all duration-300 ease-out hover:w-24 hover:justify-start hover:bg-rojo hover:pl-3 focus-visible:w-24 focus-visible:justify-start focus-visible:bg-rojo focus-visible:pl-3 motion-reduce:transition-none',
        className,
      )}
      {...props}
    >
      <IconoPapelera className="h-4 w-4 shrink-0" />
      <span className="ml-1.5 max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-300 ease-out group-hover:max-w-16 group-hover:opacity-100 group-focus-visible:max-w-16 group-focus-visible:opacity-100 motion-reduce:transition-none">
        {texto}
      </span>
    </button>
  )
}
