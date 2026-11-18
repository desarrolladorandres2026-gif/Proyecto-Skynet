import { NavidadLoginFondo } from './Login.jsx'
import './navidad.css'

// Nieve ligera sobre toda la app del teléfono (menos copos que en el login
// para cuidar la batería), por debajo de las hojas inferiores.
export function NavidadMovilFondo() {
  return <NavidadLoginFondo cantidad={24} clase="navidad-movil-nieve" />
}

// Nieve acumulada sobre el borde superior de la barra inferior. El padre debe
// ser `relative`.
export function NavidadMovilPie() {
  return (
    <svg className="navidad-movil-pie" viewBox="0 0 400 14" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M0 14 V8 q12 -9 25 -1 t25 0 t25 1 t25 -1 t25 0 t25 1 t25 -1 t25 0 t25 1 t25 -1 t25 0 t25 1 t25 -1 t25 0 t25 1 t25 -1 V14Z"
        fill="#f8fafc"
      />
      {[18, 58, 98, 138, 178, 218, 258, 298, 338, 378].map((x, i) => (
        <circle
          key={x}
          cx={x}
          cy="3"
          r="1.8"
          fill={['#ef4444', '#22c55e', '#facc15', '#60a5fa'][i % 4]}
          className="navidad-bombilla-svg"
          style={{ animationDelay: `${(i % 4) * 0.3}s` }}
        />
      ))}
    </svg>
  )
}
