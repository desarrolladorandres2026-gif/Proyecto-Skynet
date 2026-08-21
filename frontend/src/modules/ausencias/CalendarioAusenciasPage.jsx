import { useMemo, useState } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { ausencias as ausenciasApi } from '../../api/ausencias.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Badge, Card, ErrorMsg, EmptyState, fmtFecha } from '../../components/ui.jsx'
import { TIPOS_AUSENCIA } from '../../config/ausenciasConstants.js'

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Puntea con los mismos tonos que Badge usa para 'tipo', para que el punto
// en la celda del día y la etiqueta del detalle se lean como el mismo dato.
const PUNTO_COLORES = {
  vacaciones: 'bg-brand-500',
  permiso_remunerado: 'bg-violet-500',
  permiso_no_remunerado: 'bg-teal-500',
  incapacidad: 'bg-orange-500',
}

function aISO(fecha) {
  return fecha.toISOString().slice(0, 10)
}

function iniciales(nombre) {
  if (!nombre) return '?'
  const partes = nombre.trim().split(/\s+/)
  return (partes[0]?.[0] || '') + (partes[1]?.[0] || '')
}

// Lunes = 0 ... Domingo = 6, para armar la grilla con semana laboral local.
function offsetLunes(fecha) {
  return (fecha.getDay() + 6) % 7
}

// Grilla de 6 semanas (42 días) que rodea el mes visible, incluyendo colas
// del mes anterior/siguiente para que no queden celdas vacías.
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

function estaEnRango(ausencia, diaISO) {
  return aISO(new Date(ausencia.fechaInicio)) <= diaISO && diaISO <= aISO(new Date(ausencia.fechaFin))
}

function nombreDe(a) {
  return a.solicitante?.nombre || a.solicitante?.nombre_usuario || 'Sin nombre'
}

export default function CalendarioAusenciasPage() {
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

  // Clave por rango visible: volver a un mes ya visto en esta sesión (ej.
  // "Hoy" tras mirar otro mes) muestra el calendario de inmediato. El propio
  // hook ya protege contra que una respuesta lenta de un mes anterior pise el
  // mes al que el usuario ya navegó (ver claveVigenteRef en useDatosConCache).
  const { data, cargando, error } = useDatosConCache(
    `ausencias:calendario:${desde}:${hasta}`,
    () => ausenciasApi.calendario({ desde, hasta }).then((d) => d.ausencias),
    { ttlMs: 60_000 },
  )
  const lista = data || []

  const porDia = useMemo(() => {
    const mapa = new Map()
    for (const dia of grilla) {
      const iso = aISO(dia)
      mapa.set(
        iso,
        lista.filter((a) => estaEnRango(a, iso)),
      )
    }
    return mapa
  }, [grilla, lista])

  const fueraHoy = porDia.get(aISO(hoy)) || []

  const vuelvenEstaSemana = useMemo(() => {
    const limite = new Date(hoy)
    limite.setDate(limite.getDate() + 7)
    return lista
      .filter((a) => {
        const regreso = new Date(a.fechaFin)
        regreso.setDate(regreso.getDate() + 1)
        return regreso > hoy && regreso <= limite
      })
      .sort((a, b) => new Date(a.fechaFin) - new Date(b.fechaFin))
  }, [lista, hoy])

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
    <div className="mx-auto max-w-6xl">
      <h1 className="panel-mono mb-4 flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
        <CalendarCheck className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        Calendario de ausencias
      </h1>

      <ErrorMsg>{error}</ErrorMsg>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => cambiarMes(-1)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-500/10 dark:text-slate-400"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => cambiarMes(1)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-500/10 dark:text-slate-400"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="panel-mono ml-1 text-sm font-semibold text-slate-900 capitalize dark:text-white">
                {mesLabel}
              </span>
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
              <div key={d} className="panel-mono px-1 py-1 text-center text-[10px] tracking-wide text-slate-500 uppercase dark:text-slate-400">
                {d}
              </div>
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
                    esSeleccionado
                      ? 'ring-2 ring-cyan-600 dark:ring-cyan-400'
                      : 'ring-slate-500/10 hover:ring-slate-500/25'
                  } ${esDelMes ? '' : 'opacity-40'}`}
                >
                  <span
                    className={`panel-mono text-[11px] ${
                      esHoy
                        ? 'rounded-full bg-cyan-600 px-1.5 py-0.5 text-white dark:bg-cyan-500'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {dia.getDate()}
                  </span>
                  <div className="mt-1 flex w-full flex-col gap-0.5">
                    {visibles.map((a) => (
                      <span key={a._id} className="flex items-center gap-1 truncate text-[10px] text-slate-600 dark:text-slate-300">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_COLORES[a.tipo] || 'bg-slate-400'}`} />
                        <span className="truncate">{nombreDe(a)}</span>
                      </span>
                    ))}
                    {restantes > 0 && (
                      <span className="panel-mono text-[10px] text-slate-400">+{restantes} más</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {TIPOS_AUSENCIA.map((t) => (
              <span key={t.value} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <span className={`h-2 w-2 rounded-full ${PUNTO_COLORES[t.value] || 'bg-slate-400'}`} />
                {t.label}
              </span>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="panel-mono mb-2 text-[11px] tracking-[0.1em] text-cyan-700/80 uppercase dark:text-cyan-400/80">
              Fuera hoy ({fueraHoy.length})
            </h2>
            {fueraHoy.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Todo el equipo está disponible.</p>
            ) : (
              <ul className="space-y-2">
                {fueraHoy.map((a) => (
                  <li key={a._id} className="flex items-center gap-2">
                    <span className="panel-mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-500/10 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {iniciales(nombreDe(a))}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-900 dark:text-white">{nombreDe(a)}</p>
                      <p className="panel-mono text-[10px] text-slate-500 dark:text-slate-400">
                        vuelve {fmtFecha(new Date(new Date(a.fechaFin).getTime() + 86400000))}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="panel-mono mb-2 text-[11px] tracking-[0.1em] text-cyan-700/80 uppercase dark:text-cyan-400/80">
              Vuelven esta semana ({vuelvenEstaSemana.length})
            </h2>
            {vuelvenEstaSemana.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nadie regresa en los próximos 7 días.</p>
            ) : (
              <ul className="space-y-2">
                {vuelvenEstaSemana.map((a) => (
                  <li key={a._id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-slate-900 dark:text-white">{nombreDe(a)}</span>
                    <span className="panel-mono shrink-0 text-[10px] text-slate-500 dark:text-slate-400">
                      {fmtFecha(new Date(new Date(a.fechaFin).getTime() + 86400000))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <h2 className="panel-mono mb-3 text-[11px] tracking-[0.1em] text-cyan-700/80 uppercase dark:text-cyan-400/80">
          {new Date(diaSeleccionado + 'T00:00:00').toLocaleDateString('es-CO', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </h2>
        {cargando ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
        ) : detalleDia.length === 0 ? (
          <EmptyState mensaje="Nadie tiene ausencias aprobadas este día" />
        ) : (
          <div className="space-y-2">
            {detalleDia.map((a) => (
              <div key={a._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-500/5 px-3 py-2">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{nombreDe(a)}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {a.cargoSolicitante || a.solicitante?.cargo || '—'}
                    {a.dependenciaSolicitante ? ` · ${a.dependenciaSolicitante}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge valor={a.tipo} />
                  <span className="text-sm whitespace-nowrap text-slate-600 dark:text-slate-300">
                    {fmtFecha(a.fechaInicio)} → {fmtFecha(a.fechaFin)}
                    {a.horaInicio && ` · ${a.horaInicio}–${a.horaFin}`}
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
