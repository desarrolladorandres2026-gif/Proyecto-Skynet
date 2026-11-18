import { forwardRef } from 'react'
import { Search } from 'lucide-react'
import { cn } from '../../lib/cn.js'

// Buscador tipo píldora: el input y el botón-lupa comparten un mismo fondo
// papel-fondo, con el botón ligeramente montado encima del input (margen
// negativo) para que se vean como una sola pieza, como en el diseño de
// referencia. Sin JS propio: value/onChange/onSubmit los pone quien lo use.
export const SearchInput = forwardRef(function SearchInput(
  { value, onChange, onSubmit, placeholder = 'Buscar…', className, inputClassName, 'aria-label': ariaLabel, ...props },
  ref,
) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(e)
      }}
      className={cn('flex items-center justify-between', className)}
    >
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          'w-full min-w-0 rounded-full border border-transparent bg-papel-fondo px-4 py-2.5 text-sm text-tinta shadow-sm transition-shadow duration-150 ease-out placeholder:text-tinta-segundo hover:shadow-md focus:outline-2 focus:outline-azul motion-reduce:transition-none',
          '-mr-8 pr-10',
          inputClassName,
        )}
        {...props}
      />
      <button
        type="submit"
        aria-label="Buscar"
        className="mt-px shrink-0 rounded-full border border-transparent bg-papel-fondo p-2 text-tinta-segundo transition-colors motion-reduce:transition-none hover:cursor-pointer"
      >
        <Search className="h-[1.1em] w-[1.1em]" aria-hidden="true" />
      </button>
    </form>
  )
})
