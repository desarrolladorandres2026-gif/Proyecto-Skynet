import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Warehouse, Printer, Download, PackageCheck, ArrowLeft } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Badge, Btn, Card, ErrorMsg, TablaWrap, Th, Td, EmptyState, fmtFechaHora } from '../../components/ui.jsx'
import ExportarRequerimientosModal from './ExportarRequerimientosModal.jsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'

// Mismos valores que Backend/src/models/Requerimiento.js (bodega.estado) y
// RequerimientoDetallePage.jsx — mantenidos en sync manualmente porque son
// solo 3 y no vale la pena un módulo compartido para esto.
const LABEL_ESTADO_BODEGA = {
  pendiente: 'Pendiente por despachar',
  aprobada: 'Despachado',
  no_aprobada: 'No se puede despachar',
}
import { generarPdfRequerimiento } from '../../pdf/requerimientoPdf.js'

export default function BandejaBodegaPage() {
  const [modalExportar, setModalExportar] = useState(false)
  const [verDespachados, setVerDespachados] = useState(false)

  const { data, cargando, error, recargarSilencioso } = useDatosConCache(
    `requerimientos:bandejaBodega:${verDespachados ? 'despachados' : 'pendientes'}`,
    () => requerimientosApi.bandejaBodega({ despachados: verDespachados }).then((data) => data.requerimientos),
    { ttlMs: 30_000 },
  )
  const lista = data || []

  useAutoRefresh(recargarSilencioso)

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide !text-black dark:!text-white">
          <Warehouse className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden="true" />
          {verDespachados ? 'Requerimientos despachados' : 'Bandeja Bodega — aprobados por Financiero'}
        </h1>
        <div className="flex items-center gap-2">
          <Btn variante="secundario" onClick={() => setVerDespachados((v) => !v)} className="flex items-center gap-1.5">
            {verDespachados ? (
              <><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a la bandeja</>
            ) : (
              <><PackageCheck className="h-4 w-4" aria-hidden="true" /> Requerimientos despachados</>
            )}
          </Btn>
          <Btn variante="secundario" onClick={() => setModalExportar(true)} className="flex items-center gap-1.5">
            <Download className="h-4 w-4" aria-hidden="true" /> Exportar
          </Btn>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje={verDespachados ? 'No hay requerimientos despachados' : 'No hay requerimientos pendientes por despachar'} />
      ) : (
        <>
          <div className="grid gap-2.5 sm:hidden">
            {lista.map((r) => (
              <Card key={r._id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800 capitalize dark:text-slate-100">
                    Requerimiento de {r.tipo}
                  </span>
                  <Badge valor={r.bodega?.estado} label={LABEL_ESTADO_BODEGA[r.bodega?.estado] || r.bodega?.estado} />
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">{r.solicitante?.nombre}</p>
                <p className="panel-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {fmtFechaHora(r.fechaSolicitud || r.createdAt)}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Btn variante="secundario" onClick={() => generarPdfRequerimiento(r)} className="flex flex-1 items-center justify-center gap-1.5">
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" /> PDF
                  </Btn>
                  <Link to={`/requerimientos/${r._id}`} className="flex-1">
                    <Btn className="w-full">Gestionar</Btn>
                  </Link>
                </div>
              </Card>
            ))}
          </div>

          <TablaWrap cuadricula className="hidden sm:block">
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>Solicitante</Th>
                <Th>Estado</Th>
                <Th>Acción</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r._id}>
                  <Td className="whitespace-nowrap">{fmtFechaHora(r.fechaSolicitud || r.createdAt)}</Td>
                  <Td className="capitalize">{r.tipo}</Td>
                  <Td>{r.solicitante?.nombre}</Td>
                  <Td><Badge valor={r.bodega?.estado} label={LABEL_ESTADO_BODEGA[r.bodega?.estado] || r.bodega?.estado} /></Td>
                  <Td>
                    <div className="flex items-center justify-end gap-2">
                      <Btn variante="fantasma" onClick={() => generarPdfRequerimiento(r)} className="flex items-center gap-1.5 !px-2.5" title="Generar PDF">
                        <Printer className="h-3.5 w-3.5" aria-hidden="true" /> PDF
                      </Btn>
                      <Link to={`/requerimientos/${r._id}`} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
                        Gestionar
                      </Link>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TablaWrap>
        </>
      )}

      <ExportarRequerimientosModal abierto={modalExportar} onCerrar={() => setModalExportar(false)} />
    </div>
  )
}
