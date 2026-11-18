import { PaisajeCerca, Trineo } from './Escena.jsx'
import './navidad.css'

// Copos de pantalla completa: posiciones deterministas.
const COPOS = Array.from({ length: 46 }, (_, i) => ({
  x: (i * 31 + 5) % 100,
  t: i % 5 === 0 ? 6 : 2 + (i % 3),
  d: 8 + ((i * 7) % 8),
  r: (i * 3) % 14,
  v: ((i % 7) - 3) * 10,
  cerca: i % 5 === 0,
}))

// Nieve cayendo sobre TODA la pantalla de login (por encima de las columnas,
// sin capturar clics).
export function NavidadLoginFondo({ cantidad = COPOS.length, clase = "" }) {
  return (
    <div className={`navidad-login-nieve ${clase}`.trim()} aria-hidden="true">
      {COPOS.slice(0, cantidad).map((c, i) => (
        <span
          key={i}
          className={c.cerca ? 'cerca' : undefined}
          style={{
            left: `${c.x}%`,
            width: c.t,
            height: c.t,
            animationDuration: `${c.d}s`,
            animationDelay: `-${c.r}s`,
            '--vaiven': `${c.v}px`,
          }}
        />
      ))}
    </div>
  )
}

// Columna de la foto: saludo arriba y Papá Noel cruzando en trineo.
export function NavidadLoginHero() {
  return (
    <>
      <div className="navidad-login-saludo" aria-hidden="true">
        <span>🎄 ¡Feliz Navidad y próspero Año Nuevo 2027! 🎁</span>
      </div>
      <div className="navidad-login-trineo" aria-hidden="true">
        <Trineo />
      </div>
    </>
  )
}

// Pie de la columna del formulario: paisaje nevado con casas y árboles.
export function NavidadLoginPie() {
  return (
    <div className="navidad-login-pie" aria-hidden="true">
      <PaisajeCerca />
    </div>
  )
}
