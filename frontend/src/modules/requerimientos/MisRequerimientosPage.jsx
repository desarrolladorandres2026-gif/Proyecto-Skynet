import { Link } from 'react-router-dom'
import { FileText, Plus } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Btn, Badge, Card, CardLink, ErrorMsg, TablaWrap, Th, Td, EmptyState, fmtFechaHora } from '../../components/ui.jsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'

function estadoVisible(r) {
  if (r.estado === 'pendiente_bodega' && r.bodega?.estado && r.bodega.estado !== 'pendiente') return r.bodega.estado
  return r.estado
}

// Mismos valores que Backend/src/models/Requerimiento.js (estado raíz +
// bodega.estado) — ver mismo mapa en RequerimientoDetallePage.jsx.
const LABEL_ESTADO = {
  pendiente_financiero: 'Pendiente Financiero',
  pendiente_bodega: 'Aprobado',
  rechazado: 'Rechazado',
  aprobada: 'Despachado',
  no_aprobada: 'No se puede despachar',
}

export default function MisRequerimientosPage() {
  // Compartido: volver de /requerimientos/:id o de otro módulo ya no repite
  // la petición ni muestra "Cargando…" mientras la caché siga vigente.
  const { data, cargando, error, recargarSilencioso } = useDatosConCache(
    'requerimientos:mios',
    () => requerimientosApi.mios().then((data) => data.requerimientos),
    { ttlMs: 30_000 },
  )
  const lista = data || []

  useAutoRefresh(recargarSilencioso)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <FileText className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Mis requerimientos
        </h1>
        <Link to="/requerimientos/nuevo">
          <Btn className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo requerimiento
          </Btn>
        </Link>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="Todavía no has creado ningún requerimiento" />
      ) : (
        <>
          <div className="grid gap-2.5 sm:hidden">
            {lista.map((r) => (
              <CardLink key={r._id} to={`/requerimientos/${r._id}`}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800 capitalize dark:text-slate-100">
                    Requerimiento de {r.tipo}
                  </span>
                  <span className="panel-mono shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                    {fmtFechaHora(r.fechaSolicitud || r.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm text-slate-600 dark:text-slate-300">{r.areaOProceso || 'Sin área/proceso'}</p>
                  <Badge valor={estadoVisible(r)} label={LABEL_ESTADO[estadoVisible(r)] || estadoVisible(r)} />
                </div>
              </CardLink>
            ))}
          </div>

          <TablaWrap className="hidden sm:block">
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>Área/proceso</Th>
                <Th>Estado</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r._id}>
                  <Td className="whitespace-nowrap">{fmtFechaHora(r.fechaSolicitud || r.createdAt)}</Td>
                  <Td className="capitalize">{r.tipo}</Td>
                  <Td>{r.areaOProceso || '—'}</Td>
                  <Td><Badge valor={estadoVisible(r)} label={LABEL_ESTADO[estadoVisible(r)] || estadoVisible(r)} /></Td>
                  <Td>
                    <Link to={`/requerimientos/${r._id}`} className="text-sm font-medium text-cyan-700 hover:underline dark:text-cyan-400">
                      Ver detalle
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TablaWrap>
        </>
      )}
    </div>
  )
}
