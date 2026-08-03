import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// clsx arma la lista de clases condicionales; twMerge resuelve conflictos
// cuando dos clases de Tailwind tocan la misma propiedad (ej. className=
// "p-4" del componente + "p-2" que pasa el caller — sin esto ganaría el
// que aparezca último en el CSS compilado, no el más específico).
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
