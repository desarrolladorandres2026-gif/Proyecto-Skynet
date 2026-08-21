import { useState } from 'react'
import { History, CircleCheck, CircleX } from 'lucide-react'
import { sig } from '../../api/sig.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Card, ErrorMsg, EmptyState, Pager, fmtFecha } from '../../components/ui.jsx'
import { ListRow, SectionHeader } from '../../components/mobileUi.jsx'

// "Mi progreso" (resumen) + "Mi historial" (lista) en una sola pantalla,
// mismo criterio que MisAusenciasPage.jsx: no vale la pena una página aparte
// solo para el resumen.
export default function MiHistorialSigPage() {
  const [page, setPage] = useState(1)

  const { data, cargando, error } = useDatosConCache(
    `sig:miHistorial:${page}`,
    () => Promise.all([sig.miProgreso(), sig.miHistorial({ page, limit: 20 })])
      .then(([p, h]) => ({ progreso: p, historial: h })),
    { ttlMs: 60_000 },
  )
  const progreso = data?.progreso || null
  const historial = data?.historial || null

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center gap-2.5">
        <History className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Mi progreso SIG</h1>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando && !progreso ? (
        <Card>Cargando…</Card>
      ) : (
        <>
          {progreso && (
            <Card className="mb-4">
              <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{progreso.total}</p>
                  <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Preguntas</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{progreso.correctas}</p>
                  <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Correctas</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{progreso.incorrectas}</p>
                  <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Incorrectas</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{progreso.porcentajeAcierto}%</p>
                  <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Acierto</p>
                </div>
              </div>

              {progreso.nivel && (
                <p className="mt-3 text-center text-sm text-slate-600 dark:text-slate-300">
                  Nivel: <span style={{ color: progreso.nivel.color }} className="font-semibold">{progreso.nivel.nombre}</span>
                  {progreso.racha > 1 && <span className="ml-2 text-slate-500 dark:text-slate-400">· Racha de {progreso.racha} días</span>}
                </p>
              )}

              {progreso.porComponente?.length > 0 && (
                <div className="mt-4 space-y-1.5 border-t border-slate-200 pt-3 dark:border-slate-700">
                  {progreso.porComponente.map((c) => (
                    <div key={c.componenteSig} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300">{c.componenteSig}</span>
                      <span className="font-medium text-slate-700 dark:text-slate-200">{c.correctas}/{c.total} ({c.porcentaje}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <SectionHeader>Historial</SectionHeader>
          {!historial?.respuestas?.length ? (
            <EmptyState mensaje="Todavía no has respondido ningún Cuestionario Programado" />
          ) : (
            <div className="space-y-1.5">
              {historial.respuestas.map((r) => (
                <ListRow
                  key={r._id}
                  leading={
                    r.esCorrecta ? (
                      <CircleCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    ) : (
                      <CircleX className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                    )
                  }
                  title={r.programacion?.snapshotPregunta?.enunciado || 'Pregunta eliminada'}
                  subtitle={`${r.componenteSigSnapshot} · ${fmtFecha(r.fechaProgramada)}`}
                />
              ))}
            </div>
          )}

          <Pager page={historial?.page} pages={historial?.pages} onPage={setPage} />
        </>
      )}
    </div>
  )
}
