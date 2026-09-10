import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Megaphone } from 'lucide-react'
import { avisosTerminal } from '../../api/avisosTerminal.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Badge, EmptyState, ErrorMsg, TablaWrap, Th, Td, fmtFechaHora } from '../../components/ui.jsx'
import { SkeletonTable } from '../../components/Skeleton.jsx'

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  enviado: 'Enviado',
  entregado: 'Recibido',
  reproducido: 'Reproducido',
  fallido: 'Fallido',
}
const ESTADO_COLOR = {
  pendiente: 'pendiente',
  enviado: 'programado',
  entregado: 'programado',
  reproducido: 'activo',
  fallido: 'error',
}

export default function AvisoTerminalDetallePage() {
  const { id } = useParams()
  const { data, cargando, error } = useDatosConCache(`avisosTerminal:detalle:${id}`, () => avisosTerminal.detalle(id), {
    ttlMs: 15_000,
  })

  return (
    <div>
      <Link to="/avisos-terminal/transmitir" className="mb-3 inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline dark:text-brand-300">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver a Avisos Terminal de Neiva
      </Link>

      <div className="mb-1 flex items-center gap-2.5">
        <Megaphone className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Detalle del aviso</h1>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando && <SkeletonTable filas={6} />}

      {data && (
        <>
          <div className="panel-card mb-5 rounded-xl p-[var(--ui-card-padding)]">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-semibold">El Terminal de Transportes de Neiva informa que:</span> {data.aviso.texto}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span>Transmitido por <strong>{data.aviso.creadoPor?.nombre}</strong></span>
              <span>{fmtFechaHora(data.aviso.createdAt)}</span>
              <span>
                Destinatarios: <Badge valor={data.aviso.destinatarios?.tipo} label={data.aviso.destinatarios?.etiqueta || data.aviso.destinatarios?.tipo} />
              </span>
            </div>
          </div>

          {data.entregas.length === 0 ? (
            <EmptyState mensaje="Sin destinatarios registrados" />
          ) : (
            <TablaWrap>
              <thead>
                <tr>
                  <Th>Destinatario</Th>
                  <Th>Dependencia</Th>
                  <Th>Estado</Th>
                  <Th>Enviado</Th>
                  <Th>Recibido</Th>
                  <Th>Reproducido</Th>
                </tr>
              </thead>
              <tbody>
                {data.entregas.map((e) => (
                  <tr key={e._id}>
                    <Td>{e.usuario?.nombre || '(usuario eliminado)'}</Td>
                    <Td>{e.usuario?.dependencia || '—'}</Td>
                    <Td><Badge valor={ESTADO_COLOR[e.estado]} label={ESTADO_LABEL[e.estado]} /></Td>
                    <Td>{fmtFechaHora(e.enviadoEn)}</Td>
                    <Td>{fmtFechaHora(e.entregadoEn)}</Td>
                    <Td>{fmtFechaHora(e.reproducidoEn)}</Td>
                  </tr>
                ))}
              </tbody>
            </TablaWrap>
          )}
        </>
      )}
    </div>
  )
}
