import { forwardRef } from 'react'
import { cn } from '../../lib/cn.js'

// Clase compartida por Input/Select: forma de píldora (rounded-full), fondo
// papel-fondo, sombra que sube al pasar el cursor, foco con anillo azul.
// `error` tiñe el borde de rojo en vez de borde-fuerte. Textarea no puede ser
// píldora (multilínea) así que se queda en rounded-2xl.
function claseCampo(error, className, { pildora = true } = {}) {
  return cn(
    'w-full border bg-papel-fondo px-3.5 py-2.5 text-sm text-tinta shadow-sm transition-shadow duration-150 ease-out placeholder:text-tinta-segundo hover:shadow-md focus:outline-2 focus:outline-azul disabled:text-tinta-segundo disabled:shadow-none motion-reduce:transition-none',
    pildora ? 'rounded-full' : 'rounded-2xl',
    error ? 'border-rojo' : 'border-transparent',
    className,
  )
}

export const Input = forwardRef(function Input({ error, className, ...props }, ref) {
  return <input ref={ref} className={claseCampo(error, className)} {...props} />
})

export const Select = forwardRef(function Select({ error, className, children, ...props }, ref) {
  return (
    <select ref={ref} className={claseCampo(error, className)} {...props}>
      {children}
    </select>
  )
})

export const Textarea = forwardRef(function Textarea({ error, className, ...props }, ref) {
  return <textarea ref={ref} className={claseCampo(error, className, { pildora: false })} {...props} />
})
