import { Arbol, Casa } from './Escena.jsx'
import './navidad.css'

const COLORES = ['#ef4444', '#22c55e', '#facc15', '#ffffff']

// Copos: posiciones deterministas (no cambian entre renders).
const COPOS = Array.from({ length: 22 }, (_, i) => ({
  x: (i * 29 + 7) % 100,
  t: i % 4 === 0 ? 5 : 2 + (i % 3),
  d: 7 + ((i * 11) % 7),
  r: (i * 5) % 12,
  v: ((i % 5) - 2) * 8,
}))

// Capa de fondo: va como primer hijo de la barra lateral, con altura 0 y
// pegada arriba (sticky) para no empujar el menú ni moverse al hacer scroll.
// La barra recorta lo que se sale de ella.
export function NavidadLateralFondo() {
  return (
    <div className="navidad-lateral-fondo" aria-hidden="true">
      <div className="navidad-lateral-nieve">
        {COPOS.map((c, i) => (
          <span
            key={i}
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
      <div className="navidad-lateral-luces">
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} style={{ '--c': COLORES[i % COLORES.length], animationDelay: `${(i % 4) * 0.35}s` }} />
        ))}
      </div>
    </div>
  )
}

// Pie de la barra: paisaje nevado con árboles y una casita con luces.
export function NavidadLateralPie() {
  return (
    <div className="navidad-lateral-pie" aria-hidden="true">
      <svg viewBox="0 0 224 130" width="100%" preserveAspectRatio="xMidYMax meet">
        <Arbol x={22} s={1.1} />
        <Arbol x={200} s={0.85} />
        <Casa x={64} color="#2563eb" />
        <Arbol x={170} s={1.2} />
        <path d="M0 112 q56 -9 112 0 t112 0 V130 H0Z" fill="#f8fafc" />
        <rect x="0" y="118" width="224" height="12" fill="#e2e8f0" opacity=".7" />
      </svg>
    </div>
  )
}
