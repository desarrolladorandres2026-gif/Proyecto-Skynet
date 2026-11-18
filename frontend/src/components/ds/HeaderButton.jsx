import { cn } from '../../lib/cn.js'
import { IconoCandado, IconoCobrar, IconoDescarga, IconoDocumento, IconoGenerar, IconoImpresora, IconoMas, IconoPagar } from './iconos.jsx'

const VARIANTES = {
  primary: 'btn-sk',
  secondary: 'btn-sk',
}

// Dibujo + clase de animación por acción: el trazo reacciona a group-hover
// del <button> que lo envuelve (o sigue solo, vía `busy`, para "generar").
function DibujoAccion({ accion, busy }) {
  const base = 'h-4 w-4 shrink-0 motion-reduce:transition-none motion-reduce:transform-none'
  switch (accion) {
    case 'crear':
      return <IconoMas className={cn(base, 'transition-transform duration-200 ease-out group-hover:rotate-90')} />
    case 'cobrar':
      return <IconoCobrar className={cn(base, 'transition-transform duration-200 ease-out group-hover:translate-y-1')} />
    case 'pagar':
      return <IconoPagar className={cn(base, 'transition-transform duration-200 ease-out group-hover:-translate-y-1')} />
    case 'generar':
      return (
        <IconoGenerar
          className={cn(
            base,
            'transition-transform duration-500 ease-linear',
            busy ? 'animate-spin motion-reduce:animate-none' : 'group-hover:rotate-180',
          )}
        />
      )
    case 'cerrar':
      return <IconoCandado className={cn(base, 'transition-transform duration-200 ease-out group-hover:scale-90')} />
    default:
      return null
  }
}

// Botón de encabezado de página: rounded-[10px] + sombra suave, variante
// primary (azul) o secondary (blanco). `accion` elige qué dibujo y qué
// animación de trazo usar (ver DibujoAccion) — ninguna librería de iconos.
export function HeaderButton({ variant = 'primary', accion, busy = false, disabled, className, children, ...props }) {
  return (
    <button
      type={props.type ?? 'button'}
      disabled={disabled || busy}
      className={cn(
        'group text-sm',
        VARIANTES[variant],
        accion && 'btn-sk--icono',
        className,
      )}
      {...props}
    >
      {accion ? <DibujoAccion accion={accion} busy={busy} /> : null}
      <span>{busy ? 'Procesando…' : children}</span>
    </button>
  )
}

// Misma forma que HeaderButton: impresora dibujada cuya hoja sale al pasar
// el cursor (la hoja vive dentro del propio SVG como un segundo <path> que
// se desliza con group-hover, sin reconstruir el ícono en cada estado).
export function PrintButton({ variant = 'secondary', className, children = 'Imprimir', ...props }) {
  return (
    <button
      type={props.type ?? 'button'}
      className={cn(
        'group relative text-sm',
        VARIANTES[variant],
        className,
      )}
      {...props}
    >
      <span className="relative h-4 w-4 shrink-0">
        <IconoImpresora className="h-4 w-4" />
        <span
          aria-hidden="true"
          className="absolute -top-1.5 left-0.5 h-1.5 w-3 border border-current bg-current/10 transition-transform duration-200 ease-out group-hover:-translate-y-1 motion-reduce:transition-none"
        />
      </span>
      <span>{children}</span>
    </button>
  )
}

// Cara oscura (bg-tinta) con icono de documento. Al pasar el cursor la cara
// baja (translate-y) revelando una pestaña azul con flecha de descarga que
// rebota mientras el cursor está encima — la pestaña vive detrás, position
// absolute, y solo se "descubre" cuando la cara oscura se desplaza.
export function ExportButton({ className, children = 'Exportar', ...props }) {
  return (
    <button
      type={props.type ?? 'button'}
      className={cn('group relative inline-block rounded-[10px] shadow-[0_10px_10px_rgba(0,0,0,0.065)]', className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 flex h-full items-end justify-center rounded-[10px] bg-azul pb-1.5 text-papel"
      >
        <IconoDescarga className="h-4 w-4 animate-bounce motion-reduce:animate-none" />
      </span>
      <span className="relative inline-flex items-center gap-2 rounded-[10px] bg-tinta px-4 py-2.5 text-sm font-semibold text-papel transition-transform duration-200 ease-out group-hover:translate-y-2 motion-reduce:transition-none">
        <IconoDocumento className="h-4 w-4 shrink-0" />
        {children}
      </span>
    </button>
  )
}
