import { useEffect, useState } from 'react'
import { CalendarCheck } from 'lucide-react'
import { ausencias as ausenciasApi } from '../../api/ausencias.js'
import { Badge, Card, ErrorMsg, Field, Input, EmptyState, fmtFecha } from '../../components/ui.jsx'

function aISO(fecha) {
  return fecha.toISOString().slice(0, 10)
}

function rangoPorDefecto() {
  const hoy = new Date()
  const dentroDeTresMeses = new Date(hoy.getFullYear(), hoy.getMonth() + 3, hoy.getDate())
  return { desde: aISO(hoy), hasta: aISO(dentroDeTresMeses) }
}

// Agrupa por mes de inicio para que el listado se lea como una agenda y no
// como una tabla plana: lo que importa al planear es "en agosto no está X".
function agruparPorMes(lista) {
  const grupos = new Map()
  for (const a of lista) {
    const fecha = new Date(a.fechaInicio)
    const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
    const etiqueta = fecha.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
    if (!grupos.has(clave)) grupos.set(clave, { etiqueta, items: [] })
    grupos.get(clave).items.push(a)
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, valor]) => valor)
}

function estaEnCurso(a) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return new Date(a.fechaInicio) <= hoy && new Date(a.fechaFin) >= hoy
}

export default function CalendarioAusenciasPage() {
  const [rango, setRango] = useState(rangoPorDefecto)
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    setCargando(true)
    ausenciasApi
      .calendario(rango)
      .then((datos) => {
        // Evita que una respuesta lenta de un rango anterior pise a la del
        // rango que el usuario está viendo ahora.
        if (vigente) {
          setLista(datos.ausencias)
          setError('')
        }
      })
      .catch((err) => vigente && setError(err.message))
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [rango])

  const grupos = agruparPorMes(lista)

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="panel-mono mb-4 flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
        <CalendarCheck className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        Calendario de ausencias
      </h1>

      <ErrorMsg>{error}</ErrorMsg>

      <Card className="mb-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Desde">
            <Input type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
          </Field>
        </div>
        <p className="panel-mono mt-3 text-[11px] tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Solo ausencias aprobadas
        </p>
      </Card>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="Nadie tiene ausencias aprobadas en este rango" />
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <section key={grupo.etiqueta}>
              <h2 className="panel-mono mb-2 text-[11px] tracking-[0.1em] text-cyan-700/80 uppercase dark:text-cyan-400/80">
                {grupo.etiqueta}
              </h2>
              <div className="space-y-2">
                {grupo.items.map((a) => (
                  <Card key={a._id} className={estaEnCurso(a) ? 'ring-1 ring-cyan-500/40' : ''}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {a.solicitante?.nombre || a.solicitante?.nombre_usuario}
                          {estaEnCurso(a) && (
                            <span className="panel-mono ml-2 text-[11px] tracking-wide text-cyan-700 uppercase dark:text-cyan-400">
                              fuera hoy
                            </span>
                          )}
                        </p>
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
                        <span className="panel-mono text-xs text-slate-500 dark:text-slate-400">
                          {a.diasHabiles} d
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
