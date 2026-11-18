import { useTematica } from '../useTematica.js'
import '../base.css'

// Copos/confeti de la escena genérica: posiciones deterministas para que no
// cambien entre renders. Cada 5º es "de primer plano" (más grande y borroso).
const PARTICULAS = Array.from({ length: 24 }, (_, i) => ({
  x: (i * 37 + 11) % 100,
  d: 7 + ((i * 13) % 6),
  r: (i * 3) % 9,
  v: ((i % 5) - 2) * 9,
  cerca: i % 5 === 0,
}))

// Escena configurable por datos: fondo, título, partículas que caen y un
// desfile de emojis que avanza por abajo.
function EscenaGenerica({ config, etiqueta }) {
  const { fondo, titulo, subtitulo, firma, colorTitulo, particulas = [], desfile = [] } = config
  return (
    <div className="tem-escena" role="img" aria-label={etiqueta} style={{ background: fondo }}>
      {particulas.length > 0 && (
        <div className="tem-particulas">
          {PARTICULAS.map((p, i) => (
            <span
              key={i}
              className={p.cerca ? 'cerca' : undefined}
              style={{
                left: `${p.x}%`,
                animationDuration: `${p.d}s`,
                animationDelay: `-${p.r}s`,
                '--vaiven': `${p.v}px`,
              }}
            >
              {particulas[i % particulas.length]}
            </span>
          ))}
        </div>
      )}
      {desfile.length > 0 && (
        <div className="tem-desfile">
          {/* dos copias idénticas: el bucle (-50%) no tiene salto visible */}
          {[0, 1].map((copia) => (
            <div key={copia} className="tem-desfile-fila">
              {desfile.map((emoji, i) => <span key={i}>{emoji}</span>)}
            </div>
          ))}
        </div>
      )}
      <div className="tem-titulo" style={{ color: colorTitulo }}>
        <h3>{titulo}</h3>
        {subtitulo && <p>{subtitulo}</p>}
        {firma && <strong>{firma}</strong>}
      </div>
    </div>
  )
}

// Escena de Inicio (escritorio; con `movil`, versión compacta del teléfono). Una temática aporta un componente `Escena` propio (como
// Navidad) o una config `escena` que usa la escena genérica. Sin ninguna de las
// dos —o sin temática— no ocupa espacio.
export default function TematicaEscena({ movil = false }) {
  const { tematica } = useTematica()
  if (!tematica) return null
  const { Escena, escena, escenaEtiqueta = `Escena de ${tematica.nombre}` } = tematica
  if (!Escena && !escena) return null

  // Un `Escena` propio se encarga de su propio role/aria-label.
  // movil: bloque de alto fijo (teléfono); si no, llena el hueco del Inicio de
  // escritorio y se oculta en contenedores angostos.
  return (
    <div className={movil ? 'tem-movil-escena' : 'tem-hueco hidden @2xl:block'}>
      {Escena ? (
        <div className="tem-escena-propia">
          <Escena />
        </div>
      ) : (
        <EscenaGenerica config={escena} etiqueta={escenaEtiqueta} />
      )}
    </div>
  )
}
