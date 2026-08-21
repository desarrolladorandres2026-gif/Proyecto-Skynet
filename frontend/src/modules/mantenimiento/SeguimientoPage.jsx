import { seguimientoApi } from '../../api/mantenimiento.js'
import { Card, ErrorMsg, EmptyState, fmtFechaHora, Badge } from '../../components/ui.jsx'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'

// Seguimiento en Tiempo Real (CMMS Fase 3.1): coordinación, no vigilancia —
// "última actividad" viene de eventos que el propio técnico ya registró, no
// de un mecanismo nuevo de presencia continua (ver diseño aprobado).
export default function SeguimientoPage() {
  const { data: tecnicos, error, recargarSilencioso } = useDatosConCache(
    'mantenimiento:seguimientoTecnicos',
    () => seguimientoApi.tecnicos().then((d) => d.tecnicos),
    { ttlMs: 30_000 },
  )

  useAutoRefresh(recargarSilencioso, { intervalMs: 30_000 })

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Seguimiento en tiempo real</h1>
      <ErrorMsg>{error}</ErrorMsg>
      {!tecnicos ? (
        <Card>Cargando…</Card>
      ) : tecnicos.length === 0 ? (
        <EmptyState mensaje="No hay técnicos con permiso de ejecución registrados" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tecnicos.map((t) => (
            <Card key={t.tecnico._id}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold text-white">{t.tecnico.nombre}</h2>
                <Badge valor={t.disponible ? 'activo' : 'ocupada'} />
              </div>
              {t.ordenActual ? (
                <dl className="space-y-1 text-sm">
                  <div><dt className="text-slate-400 inline">Equipo: </dt><dd className="inline text-slate-200">{t.ordenActual.equipo}</dd></div>
                  <div><dt className="text-slate-400 inline">Estado: </dt><dd className="inline"><Badge valor={t.ordenActual.estado} /></dd></div>
                  {t.ordenActual.motivo_espera && (
                    <div><dt className="text-slate-400 inline">Esperando: </dt><dd className="inline text-amber-300">{t.ordenActual.motivo_espera}</dd></div>
                  )}
                  {t.ordenesActivas > 1 && <p className="text-xs text-slate-500">+{t.ordenesActivas - 1} orden(es) más</p>}
                </dl>
              ) : (
                <p className="text-sm text-slate-400">Sin órdenes activas.</p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Última actividad: {t.ultimaActividadEn ? fmtFechaHora(t.ultimaActividadEn) : 'sin registro'}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
