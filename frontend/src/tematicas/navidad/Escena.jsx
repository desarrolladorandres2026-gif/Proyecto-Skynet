import './navidad.css'

// Gorrito de Papá Noel para poner sobre una esquina de un botón (el botón
// debe ser `relative`).
export function NavidadGorro({ grande = false }) {
  return (
    <svg className={grande ? 'navidad-gorrito navidad-gorrito-grande' : 'navidad-gorrito'} viewBox="0 0 32 28" width="26" height="23" aria-hidden="true">
      <path d="M3 22 Q6 4 22 3 Q20 9 29 18 Z" fill="#dc2626" />
      <path d="M3 22 Q6 4 22 3" fill="none" stroke="#fca5a5" strokeWidth="1" opacity=".6" />
      <rect x="1" y="19" width="30" height="7" rx="3.5" fill="#fff" />
      <circle cx="23" cy="4" r="3.6" fill="#fff" />
    </svg>
  )
}

// Copos de la escena: posiciones fijas (pseudo-aleatorias deterministas) para
// que no cambien entre renders. Cada 5º copo es "de primer plano": más grande,
// borroso y rápido, para dar profundidad.
const COPOS = Array.from({ length: 44 }, (_, i) => {
  const cerca = i % 5 === 0
  return {
    x: (i * 37 + 11) % 100,
    t: cerca ? 6 : 2 + ((i * 7) % 3),
    d: cerca ? 4 + (i % 3) : 6 + ((i * 13) % 6),
    r: (i * 3) % 9,
    v: ((i % 5) - 2) * 7,
    cerca,
  }
})

const COLORES_LUZ = ['#ef4444', '#22c55e', '#facc15', '#60a5fa']

export function Arbol({ x, s = 1 }) {
  return (
    <g transform={`translate(${x} 112) scale(${s})`}>
      <rect x="-3" y="-8" width="6" height="8" fill="#5b3a1e" />
      <path d="M0 -46 L-13 -25 H13 Z" fill="#1f8a45" />
      <path d="M0 -34 L-17 -12 H17 Z" fill="#166534" />
      <path d="M0 -22 L-21 -6 H21 Z" fill="#14532d" />
      <path d="M0 -46 L-5 -38 L0 -40 L5 -38 Z M0 -34 L-7 -26 L0 -28 L7 -26 Z" fill="#fff" opacity=".9" />
      <path d="M0 -52 l2 5 5 .5 -4 3.5 1.2 5 -4.2 -2.8 -4.2 2.8 1.2 -5 -4 -3.5 5 -.5z" fill="#facc15" />
      {[[-6, -20, 0], [5, -28, 1], [-2, -36, 2], [8, -14, 3], [-10, -12, 1]].map(([cx, cy, c], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.8" fill={COLORES_LUZ[c]} className="navidad-bombilla-svg" style={{ animationDelay: `${i * 0.35}s` }} />
      ))}
    </g>
  )
}

export function Casa({ x, color }) {
  // luces en el borde del tejado (ambos faldones)
  const luces = Array.from({ length: 6 }, (_, i) => {
    const t = i / 5
    return [
      { cx: -2 + t * 40, cy: 90 - t * 22 },
      { cx: 78 - t * 40, cy: 90 - t * 22 },
    ]
  }).flat()
  return (
    <g transform={`translate(${x} 0)`}>
      {/* humo de la chimenea */}
      {[0, 1, 2].map((i) => (
        <circle key={i} cx="36" cy="68" r="3.5" fill="#e2e8f0" className="navidad-humo" style={{ animationDelay: `${i * 1.1}s` }} />
      ))}
      <rect x="30" y="72" width="12" height="20" fill="#7c2d12" />
      <rect x="28" y="70" width="16" height="4" fill="#fff" />
      <rect x="0" y="90" width="76" height="22" fill={color} />
      <rect x="0" y="90" width="76" height="3" fill="#000" opacity=".15" />
      <path d="M-6 90 L38 66 L82 90 Z" fill="#7f1d1d" />
      <path d="M-6 90 L38 66 L82 90 L74 90 L38 71 L2 90 Z" fill="#fff" />
      {luces.map((l, i) => (
        <circle key={i} cx={l.cx} cy={l.cy + 1} r="1.9" fill={COLORES_LUZ[i % 4]} className="navidad-bombilla-svg" style={{ animationDelay: `${(i % 4) * 0.3}s` }} />
      ))}
      <rect x="10" y="96" width="14" height="12" fill="#fde68a" className="navidad-ventana" />
      <rect x="52" y="96" width="14" height="12" fill="#fde68a" className="navidad-ventana" />
      <path d="M17 96 v12 M10 102 h14 M59 96 v12 M52 102 h14" stroke="#92400e" strokeWidth="1" />
      <rect x="31" y="98" width="14" height="14" rx="1" fill="#451a03" />
      <circle cx="42" cy="105" r="1" fill="#facc15" />
      {/* corona navideña en la puerta */}
      <circle cx="38" cy="101" r="3" fill="none" stroke="#22c55e" strokeWidth="1.6" />
    </g>
  )
}

export function PaisajeCerca() {
  return (
    <svg className="navidad-tile" viewBox="0 0 800 130" width="800" height="130" aria-hidden="true">
      <Arbol x={50} s={1.1} />
      <Arbol x={110} s={0.8} />
      <Arbol x={200} s={1.25} />
      <Arbol x={265} s={0.9} />
      <Casa x={330} color="#2563eb" />
      <Arbol x={460} s={1.2} />
      <Arbol x={520} s={0.85} />
      <Arbol x={585} s={1} />
      <Casa x={650} color="#16a34a" />
      <Arbol x={775} s={0.9} />
      <path d="M0 112 q100 -9 200 0 t200 0 t200 0 t200 0 V130 H0Z" fill="#f8fafc" />
      <rect x="0" y="118" width="800" height="12" fill="#e2e8f0" opacity=".7" />
    </svg>
  )
}

function Montanas() {
  const picos = [[70, 50], [210, 40], [380, 55], [560, 45], [730, 52]]
  return (
    <svg className="navidad-tile" viewBox="0 0 800 130" width="800" height="130" aria-hidden="true">
      <polygon points="0,100 70,50 140,82 210,40 300,88 380,55 470,92 560,45 650,84 730,52 800,100 800,130 0,130" fill="#2c4f86" opacity=".85" />
      {picos.map(([x, y]) => (
        <polygon key={x} points={`${x - 15},${y + 15} ${x},${y} ${x + 15},${y + 15} ${x + 6},${y + 11} ${x},${y + 16} ${x - 6},${y + 11}`} fill="#e8f1fb" opacity=".9" />
      ))}
    </svg>
  )
}

function Bosque() {
  return (
    <svg className="navidad-tile" viewBox="0 0 800 130" width="800" height="130" aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => {
        const x = i * 50 + 20
        const s = 0.55 + ((i * 5) % 4) * 0.1
        return (
          <g key={i} transform={`translate(${x} 114) scale(${s})`}>
            <path d="M0 -46 L-13 -22 H13 Z M0 -32 L-18 -6 H18 Z" fill="#0f3a34" />
            <path d="M0 -46 L-5 -38 L5 -38 Z" fill="#cfe3f5" opacity=".7" />
          </g>
        )
      })}
      <rect x="0" y="112" width="800" height="18" fill="#1b3b66" />
    </svg>
  )
}

function Pata({ x, delay }) {
  return (
    <rect x={x} y="38" width="3.2" height="14" rx="1.6" fill="#6b4423" className="navidad-pata" style={{ animationDelay: `${delay}s` }} />
  )
}

function Reno({ cx, retraso }) {
  return (
    <g className="navidad-reno" style={{ animationDelay: `${retraso}s` }}>
      <Pata x={cx - 13} delay={retraso} />
      <Pata x={cx - 7} delay={retraso + 0.25} />
      <Pata x={cx + 5} delay={retraso + 0.12} />
      <Pata x={cx + 11} delay={retraso + 0.37} />
      <ellipse cx={cx} cy="34" rx="17" ry="8.5" fill="#9a6a3a" />
      <ellipse cx={cx} cy="38" rx="13" ry="4" fill="#c9a574" opacity=".7" />
      <path d={`M${cx + 12} 30 L${cx + 18} 19 L${cx + 24} 22 L${cx + 17} 34 Z`} fill="#9a6a3a" />
      <ellipse cx={cx + 22} cy="22" rx="6.5" ry="5" fill="#a87843" />
      <circle cx={cx + 27} cy="23" r="2.6" fill="#ef4444" className="navidad-nariz" />
      <circle cx={cx + 21} cy="20" r="1.1" fill="#1c1917" />
      <path d={`M${cx + 18} 18 l-4 -11 m4 11 l3 -11 m-7 4 l-5 -2 M${cx + 18} 18 l7 -9 m-4 4 l5 -1`} stroke="#d6b98a" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d={`M${cx - 17} 33 q-5 -2 -4 4`} stroke="#9a6a3a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d={`M${cx + 6} 27 q3 3 0 8`} stroke="#b91c1c" strokeWidth="1.5" fill="none" />
    </g>
  )
}

export function Trineo() {
  return (
    <svg className="navidad-trineo" viewBox="0 0 190 64" width="190" height="64" aria-hidden="true">
      <defs>
        <linearGradient id="nv-trineo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ef4444" />
          <stop offset="1" stopColor="#991b1b" />
        </linearGradient>
        <linearGradient id="nv-abrigo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f43f5e" />
          <stop offset="1" stopColor="#b91c1c" />
        </linearGradient>
      </defs>
      {/* arneses */}
      <path d="M90 42 Q104 36 112 36 M90 44 Q120 40 142 36" stroke="#facc15" strokeWidth="1.3" fill="none" />
      <Reno cx={142} retraso={0} />
      <Reno cx={112} retraso={0.3} />
      {/* trineo */}
      <path d="M4 36 q0 15 15 15 h66 q14 0 14 -17 z" fill="url(#nv-trineo)" />
      <path d="M4 36 h96" stroke="#facc15" strokeWidth="2.5" />
      <path d="M0 58 h86 q16 0 13 -15" stroke="#facc15" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M12 51 v7 M70 51 v7" stroke="#facc15" strokeWidth="2" />
      {/* saco de regalos */}
      <path d="M4 36 q-2 -16 14 -20 q16 4 14 20 z" fill="#a16207" />
      <path d="M12 18 q6 -5 12 0" stroke="#78350f" strokeWidth="2" fill="none" />
      <rect x="9" y="22" width="5" height="5" fill="#ef4444" transform="rotate(-12 11 24)" />
      <rect x="22" y="24" width="5" height="5" fill="#38bdf8" transform="rotate(10 24 26)" />
      {/* Papá Noel */}
      <path d="M40 36 q-2 -16 12 -17 q14 1 12 17 z" fill="url(#nv-abrigo)" />
      <rect x="40" y="29" width="24" height="3" fill="#1c1917" />
      <rect x="49" y="28.5" width="5" height="4" rx="1" fill="#facc15" />
      <path d="M62 26 q10 3 14 9" stroke="#b91c1c" strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="77" cy="35" r="3" fill="#fde2c8" />
      <circle cx="52" cy="14" r="7" fill="#fde2c8" />
      <circle cx="55" cy="13" r="1" fill="#1c1917" />
      <circle cx="58" cy="16" r="1.8" fill="#fb7185" opacity=".7" />
      <path d="M45 15 q1 14 9 12 q8 -1 7 -10 q-4 5 -8 3 q-4 -1 -8 -5z" fill="#fff" />
      <path d="M44 11 q8 -16 17 -2 z" fill="#dc2626" />
      <rect x="44" y="9" width="17" height="3.4" rx="1.6" fill="#fff" />
      <circle cx="44" cy="6" r="3.2" fill="#fff" className="navidad-pompon" />
    </svg>
  )
}

// Escena de Inicio: Papá Noel viaja en trineo por el Polo Norte entre
// montañas y bosque nevado, pasan árboles y casas con luces y humo, y va
// dejando regalos en las chimeneas.
export function NavidadViaje() {
  return (
    <div className="navidad-escena" role="img" aria-label="Papá Noel viajando en trineo por el Polo Norte entregando regalos">
      <div className="navidad-aurora" />
      <div className="navidad-estrellas" />
      <span className="navidad-fugaz" />
      <div className="navidad-capa navidad-capa-lejos">
        <Montanas />
        <Montanas />
        <Montanas />
        <Montanas />
      </div>
      <div className="navidad-capa navidad-capa-medio">
        <Bosque />
        <Bosque />
        <Bosque />
        <Bosque />
      </div>
      <div className="navidad-capa navidad-capa-cerca">
        <PaisajeCerca />
        <PaisajeCerca />
        <PaisajeCerca />
        <PaisajeCerca />
      </div>
      <div className="navidad-titulo">
        <h3>¡Feliz Navidad y próspero Año Nuevo 2027!</h3>
        <p>Que la paz, la alegría y la esperanza iluminen cada uno de sus caminos.</p>
        <strong>Terminal de Transportes de Neiva</strong>
      </div>
      <span className="navidad-regalo" style={{ animationDelay: '3.6s' }} />
      <span className="navidad-regalo" style={{ animationDelay: '10s' }} />
      <div className="navidad-vuelo">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="navidad-chispa" style={{ animationDelay: `${i * 0.28}s`, top: `${30 + (i % 3) * 9}px` }} />
        ))}
        <Trineo />
      </div>
      <div className="navidad-nieve-escena">
        {COPOS.map((c, i) => (
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
    </div>
  )
}
