import { Wrench, CheckCircle2, Clock, CalendarClock, ShieldCheck } from 'lucide-react'
import logoTerminal from '../assets/logo_terminal.png'
import { usePlataforma, useCuentaRegresiva, formatearRestante, formatearFechaHora } from './PlataformaContext.jsx'
// El tema HUD se reutiliza tal cual del login: esta pantalla OCUPA SU LUGAR,
// así que compartir el fondo, la rejilla y la tarjeta hace que se lea como el
// mismo producto en otro estado, y no como una página de error de otro sitio.
import '../auth/login.css'
import './mantenimiento.css'

function Dato({ icono: Icono, etiqueta, valor }) {
  return (
    <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1 xs:gap-3 border-b border-amber-500/15 py-2 last:border-b-0">
      <span className="skynet-mono flex items-center gap-2 text-[11px] tracking-[0.15em] text-amber-200/60 uppercase shrink-0">
        <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {etiqueta}
      </span>
      <span className="skynet-mono text-left xs:text-right text-xs text-white break-words">{valor}</span>
    </div>
  )
}

// Porcentaje transcurrido de la ventana. Devuelve null cuando no se puede
// calcular (mantenimiento sin hora de fin): en ese caso la barra pasa a modo
// indeterminado en vez de inventar un progreso.
function porcentajeVentana(estado, ahoraMs) {
  if (!estado?.scheduledStart || !estado?.scheduledEnd) return null
  const inicio = new Date(estado.scheduledStart).getTime()
  const fin = new Date(estado.scheduledEnd).getTime()
  if (fin <= inicio) return null
  return Math.min(100, Math.max(0, ((ahoraMs - inicio) / (fin - inicio)) * 100))
}

export default function PantallaMantenimiento({ modo = 'mantenimiento', onContinuar }) {
  const { estado, ahoraServidor } = usePlataforma()
  const restante = useCuentaRegresiva(estado?.scheduledEnd)
  const disponible = modo === 'disponible'
  const progreso = porcentajeVentana(estado, ahoraServidor())

  return (
    <div className="skynet-login relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-8">
      {/* Mismo fondo táctico del login */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="skynet-grid absolute inset-0" />
        <div className="skynet-scanline absolute inset-x-0 h-40" />
        <div className="skynet-glow absolute left-1/2 top-1/2" />
      </div>

      <main
        className="skynet-card relative w-full max-w-lg p-6 sm:p-8"
        // aria-live: un lector de pantalla anuncia el cambio a "ya está
        // disponible" sin que la persona tenga que volver a recorrer la
        // página buscando si algo cambió.
        aria-live="polite"
      >
        <span className="skynet-bracket skynet-bracket--tl" aria-hidden="true" />
        <span className="skynet-bracket skynet-bracket--tr" aria-hidden="true" />
        <span className="skynet-bracket skynet-bracket--bl" aria-hidden="true" />
        <span className="skynet-bracket skynet-bracket--br" aria-hidden="true" />

        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={logoTerminal}
            alt="Terminal de Transporte de Neiva"
            className="mb-4 h-14 w-auto opacity-90"
          />
          <p className="skynet-mono mb-2 text-[11px] tracking-[0.35em] text-amber-400/70 uppercase">
            {disponible ? 'Sistema · restablecido' : 'Sistema · mantenimiento'}
          </p>
          <h1 className="skynet-title text-2xl text-white sm:text-3xl">SKYNET</h1>
        </div>

        {/* Emblema animado: engranaje en mantenimiento, check al volver */}
        <div className="mant-emblema mb-6">
          {!disponible && (
            <>
              <span className="mant-anillo" aria-hidden="true" />
              <span className="mant-anillo mant-anillo--interior" aria-hidden="true" />
            </>
          )}
          <span
            className="mant-nucleo"
            style={disponible ? { color: '#34d399', background: 'radial-gradient(circle at 50% 35%, rgba(52,211,153,.22), rgba(6,78,59,.12))' } : undefined}
            aria-hidden="true"
          >
            {disponible ? <CheckCircle2 className="h-7 w-7" /> : <Wrench className="h-6 w-6" />}
          </span>
        </div>

        {disponible ? (
          <div className="text-center">
            <h2 className="mb-2 text-xl font-semibold text-white">Skynet ya está disponible</h2>
            <p className="mb-6 text-sm leading-relaxed text-slate-300">
              El mantenimiento ha finalizado correctamente. La plataforma ya se encuentra disponible
              y puedes volver a ingresar.
            </p>
            <button
              type="button"
              onClick={onContinuar}
              className="skynet-mono w-full rounded border border-emerald-400/40 bg-emerald-500/15 py-3 text-sm font-semibold tracking-[0.2em] text-emerald-300 uppercase transition-colors hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            >
              Entrar a Skynet
            </button>
          </div>
        ) : (
          <>
            <h2 className="mb-3 text-center text-xl font-semibold text-white sm:text-2xl">
              Skynet está en mantenimiento
            </h2>

            {estado?.message && (
              <p className="mb-5 text-center text-sm leading-relaxed text-slate-300">{estado.message}</p>
            )}

            {/* Cuenta regresiva: solo si hay hora de fin. Sin ella, prometer un
                tiempo restante sería inventar. */}
            {restante !== null && restante !== undefined ? (
              <div className="mb-5 text-center">
                <p className="skynet-mono mb-1 text-[10px] tracking-[0.3em] text-amber-200/60 uppercase">
                  Tiempo estimado restante
                </p>
                <p className="mant-contador text-4xl sm:text-5xl">{formatearRestante(restante)}</p>
              </div>
            ) : (
              <p className="skynet-mono mb-5 text-center text-[11px] tracking-[0.2em] text-amber-200/60 uppercase">
                Sin hora de finalización estimada
              </p>
            )}

            <div className="mant-barra mb-6" role="presentation">
              <div
                className={`mant-barra-relleno ${progreso === null ? 'mant-barra-indeterminada' : ''}`}
                style={progreso === null ? undefined : { width: `${progreso}%` }}
              />
            </div>

            <div className="mb-5 rounded border border-amber-500/25 bg-amber-950/25 px-4 py-2">
              <Dato icono={ShieldCheck} etiqueta="Estado" valor="EN MANTENIMIENTO" />
              <Dato icono={Clock} etiqueta="Inicio" valor={formatearFechaHora(estado?.scheduledStart)} />
              <Dato
                icono={CalendarClock}
                etiqueta="Fin estimado"
                valor={estado?.scheduledEnd ? formatearFechaHora(estado.scheduledEnd) : 'Por definir'}
              />
              {estado?.reason && <Dato icono={Wrench} etiqueta="Motivo" valor={estado.reason} />}
            </div>

            <p className="text-center text-sm leading-relaxed text-slate-400">
              No necesitas realizar ninguna acción. Te notificaremos cuando la plataforma vuelva a
              estar disponible.
            </p>

            <p className="skynet-mono mt-4 text-center text-[10px] tracking-[0.2em] text-slate-600 uppercase">
              Esta pantalla se actualiza sola
            </p>
          </>
        )}
      </main>
    </div>
  )
}
