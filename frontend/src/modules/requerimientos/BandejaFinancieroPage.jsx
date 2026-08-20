import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Landmark, Download } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Btn, Card, CardLink, ErrorMsg, TablaWrap, Th, Td, EmptyState, fmtFechaHora } from '../../components/ui.jsx'
import ExportarRequerimientosModal from './ExportarRequerimientosModal.jsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'

export default function BandejaFinancieroPage() {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [modalExportar, setModalExportar] = useState(false)

  const cargar = useCallback((silencioso = false) => {
    if (!silencioso) setCargando(true)
    return requerimientosApi
      .bandejaFinanciero()
      .then((data) => {
        setLista(data.requerimientos)
        if (!silencioso) setError('')
      })
      .catch((err) => {
        if (!silencioso) setError(err.message)
      })
      .finally(() => {
        if (!silencioso) setCargando(false)
      })
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  useAutoRefresh(() => cargar(true))

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <Landmark className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Bandeja Financiero — pendientes de aprobación
        </h1>
        <Btn variante="secundario" onClick={() => setModalExportar(true)} className="flex items-center gap-1.5">
          <Download className="h-4 w-4" aria-hidden="true" /> Exportar
        </Btn>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay requerimientos pendientes de aprobación" />
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
                <p className="text-sm text-slate-600 dark:text-slate-300">{r.solicitante?.nombre}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {r.solicitante?.dependencia ? `${r.solicitante.dependencia} · ` : ''}
                  {r.areaOProceso || 'Sin área/proceso'}
                </p>
              </CardLink>
            ))}
          </div>

          <TablaWrap className="hidden sm:block">
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>Solicitante</Th>
                <Th>Área/proceso</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r._id}>
                  <Td className="whitespace-nowrap">{fmtFechaHora(r.fechaSolicitud || r.createdAt)}</Td>
                  <Td className="capitalize">{r.tipo}</Td>
                  <Td>
                    <p className="text-slate-700 dark:text-slate-200">{r.solicitante?.nombre}</p>
                    {r.solicitante?.dependencia && <p className="text-xs text-slate-500">{r.solicitante.dependencia}</p>}
                  </Td>
                  <Td>{r.areaOProceso || '—'}</Td>
                  <Td>
                    <Link to={`/requerimientos/${r._id}`} className="text-sm font-medium text-cyan-700 hover:underline dark:text-cyan-400">
                      Revisar
                    </Link>
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
