import { useMemo, useState } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { sig } from '../../api/sig.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Badge, Card, ErrorMsg, EmptyState } from '../../components/ui.jsx'

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const PUNTO_COLORES = {
  programada: 'bg-brand-500',
  publicada: 'bg-emerald-500',
  cancelada: 'bg-slate-400',
}

const ESTADO_LABEL = { programada: 'Programada', publicada: 'Publicada', cancelada: 'Cancelada' }

function aISO(fecha) {
  return fecha.toISOString().slice(0, 10)
}

// Lunes = 0 ... Domingo = 6.
function offsetLunes(fecha) {
  return (fecha.getDay() + 6) % 7
}

function construirGrilla(mesActual) {
  const primerDiaMes = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1)
  const inicioGrilla = new Date(primerDiaMes)
  inicioGrilla.setDate(inicioGrilla.getDate() - offsetLunes(primerDiaMes))
  const dias = []
  for (let i = 0; i < 42; i++) {
    const dia = new Date(inicioGrilla)
    dia.setDate(dia.getDate() + i)
    dias.push(dia)
  }
  return dias
}

// Vista calendario de la programación (sección 39 del encargo): muestra
// TANTO individuales como de campaña (ver listarProgramacionesCalendario en
// el backend), a diferencia de la bandeja "Programación" que solo lista
// individuales.
export default function CalendarioSigPage() {
  const hoy = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const [mesActual, setMesActual] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const [diaSeleccionado, setDiaSeleccionado] = useState(aISO(hoy))

  const grilla = useMemo(() => construirGrilla(mesActual), [mesActual])
  const desde = aISO(grilla[0])
  const hasta = aISO(grilla[grilla.length - 1])

  // Clave por rango visible: volver a un mes ya visto en esta sesión lo
  // muestra de inmediato (el hook ya protege contra que una respuesta lenta
  // de un mes anterior pise el mes al que el usuario ya navegó).
  const { data, cargando, error } = useDatosConCache(
    `sig:calendario:${desde}:${hasta}`,
    () => sig.programacion.calendario({ desde, hasta }).then((d) => d.programaciones),
    { ttlMs: 60_000 },
  )
  const lista = data || []

  const porDia = useMemo(() => {
    const mapa = new Map()
    for (const dia of grilla) mapa.set(aISO(dia), [])
    for (const p of lista) {
      const iso = new Date(p.fechaProgramada).toISOString().slice(0, 10)
      if (mapa.has(iso)) mapa.get(iso).push(p)
    }
    return mapa
  }, [grilla, lista])

  const detalleDia = porDia.get(diaSeleccionado) || []
  const mesLabel = mesActual.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

  function cambiarMes(delta) {
    setMesActual((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }

  function irAHoy() {
    setMesActual(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
    setDiaSeleccionado(aISO(hoy))
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="panel-mono mb-4 flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
        <CalendarRange className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        Calendario de programación SIG
      </h1>

      <ErrorMsg>{error}</ErrorMsg>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => cambiarMes(-1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-500/10 dark:text-slate-400" aria-label="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => cambiarMes(1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-500/10 dark:text-slate-400" aria-label="Mes siguiente">
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="panel-mono ml-1 text-sm font-semibold text-slate-900 capitalize dark:text-white">{mesLabel}</span>
          </div>
          <button
            type="button"
            onClick={irAHoy}
            className="panel-mono rounded-lg px-2.5 py-1 text-[11px] tracking-wide text-cyan-700 uppercase ring-1 ring-inset ring-cyan-700/30 hover:bg-cyan-500/10 dark:text-cyan-400 dark:ring-cyan-400/30"
          >
            Hoy
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="panel-mono px-1 py-1 text-center text-[10px] tracking-wide text-slate-500 uppercase dark:text-slate-400">{d}</div>
          ))}
          {grilla.map((dia) => {
            const iso = aISO(dia)
            const esDelMes = dia.getMonth() === mesActual.getMonth()
            const esHoy = iso === aISO(hoy)
            const esSeleccionado = iso === diaSeleccionado
            const items = porDia.get(iso) || []
            const visibles = items.slice(0, 3)
            const restantes = items.length - visibles.length
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setDiaSeleccionado(iso)}
                className={`flex min-h-[74px] flex-col items-start rounded-lg p-1.5 text-left ring-1 ring-inset transition-colors ${
                  esSeleccionado ? 'ring-2 ring-cyan-600 dark:ring-cyan-400' : 'ring-slate-500/10 hover:ring-slate-500/25'
                } ${esDelMes ? '' : 'opacity-40'}`}
              >
                <span className={`panel-mono text-[11px] ${esHoy ? 'rounded-full bg-cyan-600 px-1.5 py-0.5 text-white dark:bg-cyan-500' : 'text-slate-600 dark:text-slate-300'}`}>
                  {dia.getDate()}
                </span>
                <div className="mt-1 flex w-full flex-col gap-0.5">
                  {visibles.map((p) => (
                    <span key={p._id} className="flex items-center gap-1 truncate text-[10px] text-slate-600 dark:text-slate-300">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_COLORES[p.estado] || 'bg-slate-400'}`} />
                      <span className="truncate">{p.pregunta?.componenteSig || p.snapshotPregunta?.componenteSig}</span>
                    </span>
                  ))}
                  {restantes > 0 && <span className="panel-mono text-[10px] text-slate-400">+{restantes} más</span>}
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {Object.entries(ESTADO_LABEL).map(([valor, label]) => (
            <span key={valor} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className={`h-2 w-2 rounded-full ${PUNTO_COLORES[valor]}`} />
              {label}
            </span>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="panel-mono mb-3 text-[11px] tracking-[0.1em] text-cyan-700/80 uppercase dark:text-cyan-400/80">
          {new Date(diaSeleccionado + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
        {cargando ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
        ) : detalleDia.length === 0 ? (
          <EmptyState mensaje="No hay preguntas programadas este día" />
        ) : (
          <div className="space-y-2">
            {detalleDia.map((p) => (
              <div key={p._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-500/5 px-3 py-2">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {p.pregunta?.enunciado || p.snapshotPregunta?.enunciado || '—'}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {p.pregunta?.componenteSig || p.snapshotPregunta?.componenteSig}
                    {p.campana?.nombre ? ` · Campaña: ${p.campana.nombre}` : ' · Individual'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge valor={p.estado} label={ESTADO_LABEL[p.estado]} />
                  <span className="text-sm whitespace-nowrap text-slate-600 dark:text-slate-300">
                    {new Date(p.fechaHoraPublicacion).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
