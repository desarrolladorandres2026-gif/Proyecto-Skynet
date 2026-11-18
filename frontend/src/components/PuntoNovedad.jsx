import { cn } from '../lib/cn.js'

// Punto de "novedad" junto a un enlace del menú. El anillo claro lo separa del
// fondo (azul del sidebar, o la barra del shell móvil); el pulso se apaga con
// prefers-reduced-motion. El texto "Nuevo" es solo para lectores de pantalla:
// sin él el punto no comunicaría nada a quien no lo ve.
export function PuntoNovedad({ className }) {
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5 shrink-0', className)}>
      <span
        aria-hidden="true"
        className="absolute inline-flex h-full w-full rounded-full bg-warn-300 opacity-75 motion-safe:animate-ping"
      />
      <span aria-hidden="true" className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warn-400 ring-1 ring-white/80" />
      <span className="sr-only">Nuevo</span>
    </span>
  )
}
