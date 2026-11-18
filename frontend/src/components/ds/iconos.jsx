// Dibujos lineales a mano para el sistema de diseño (ds/): nunca una
// librería de iconos externa. Todos viewBox 24x24, stroke currentColor,
// fill none — así heredan el color de texto del botón que los envuelve.
function Trazo({ children, className, strokeWidth = 1.75, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function IconoOjo(props) {
  return (
    <Trazo {...props}>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </Trazo>
  )
}

export function IconoLapiz(props) {
  return (
    <Trazo {...props}>
      <path d="M4 20h4L19.5 8.5a2 2 0 0 0 0-2.8l-.7-.7a2 2 0 0 0-2.8 0L4.5 16.5 4 20Z" />
      <path d="M14.5 6.5 17.5 9.5" />
    </Trazo>
  )
}

export function IconoAnular(props) {
  return (
    <Trazo {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 8l8 8" />
    </Trazo>
  )
}

export function IconoCobrar(props) {
  return (
    <Trazo {...props}>
      <path d="M12 3v11" />
      <path d="M8 10.5 12 14.5 16 10.5" />
      <path d="M4 16.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2.5" />
    </Trazo>
  )
}

export function IconoPagar(props) {
  return (
    <Trazo {...props}>
      <path d="M12 21V10" />
      <path d="M8 13.5 12 9.5 16 13.5" />
      <path d="M4 16.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2.5" />
    </Trazo>
  )
}

export function IconoDocumento(props) {
  return (
    <Trazo {...props}>
      <path d="M7 3.5h7l3.5 3.5V20a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-16a.5.5 0 0 1 .5-.5Z" />
      <path d="M14 3.5V7h3.5" />
      <path d="M9 13h6M9 16h6" />
    </Trazo>
  )
}

export function IconoPapelera(props) {
  return (
    <Trazo {...props}>
      <path d="M5 7h14" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M7 7l1 12.5A1.5 1.5 0 0 0 9.5 21h5a1.5 1.5 0 0 0 1.5-1.5L17 7" />
      <path d="M10 11v5M14 11v5" />
    </Trazo>
  )
}

export function IconoMas(props) {
  return (
    <Trazo {...props}>
      <path d="M12 5v14M5 12h14" />
    </Trazo>
  )
}

export function IconoGenerar(props) {
  return (
    <Trazo {...props}>
      <path d="M20 11a8 8 0 0 0-14.6-4.3M4 11V5.5" />
      <path d="M4 13a8 8 0 0 0 14.6 4.3M20 13v5.5" />
      <path d="M4 5.5h5.5M20 18.5h-5.5" />
    </Trazo>
  )
}

export function IconoCandado(props) {
  return (
    <Trazo {...props}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Trazo>
  )
}

export function IconoImpresora(props) {
  return (
    <Trazo {...props}>
      <path d="M7 8V4h10v4" />
      <rect x="4" y="8" width="16" height="7" rx="1.5" />
      <path d="M7 15v4.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V15" />
    </Trazo>
  )
}

export function IconoDescarga(props) {
  return (
    <Trazo {...props}>
      <path d="M12 4v10" />
      <path d="M8 10.5 12 14.5 16 10.5" />
      <path d="M5 18h14" />
    </Trazo>
  )
}

export function IconoFiltro(props) {
  return (
    <Trazo {...props}>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </Trazo>
  )
}

export function IconoFlechaAcordeon(props) {
  return (
    <Trazo {...props}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </Trazo>
  )
}

// Resuelve qué dibujo mostrar en ViewButton/TextButton a partir de palabras
// clave en el propio texto visible del botón — así no hay que pasar un prop
// de icono aparte en cada llamada dispersa por el panel.
const PATRONES = [
  [/anular|cancelar|rechazar/i, IconoAnular],
  [/cobrar/i, IconoCobrar],
  [/pagar/i, IconoPagar],
  [/editar|modificar/i, IconoLapiz],
  [/eliminar|quitar|borrar/i, IconoPapelera],
  [/ver|detalle|mostrar/i, IconoOjo],
]

export function iconoPorTexto(texto = '') {
  for (const [patron, Icono] of PATRONES) {
    if (patron.test(texto)) return Icono
  }
  return IconoOjo
}
