import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Landmark } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Card, ErrorMsg, TablaWrap, Th, Td, EmptyState, fmtFechaHora } from '../../components/ui.jsx'

export default function BandejaFinancieroPage() {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    requerimientosApi
      .bandejaFinanciero()
      .then((data) => setLista(data.requerimientos))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="panel-mono mb-4 flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
        <Landmark className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        Bandeja Financiero — pendientes de aprobación
      </h1>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay requerimientos pendientes de aprobación" />
      ) : (
        <TablaWrap>
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
      )}
    </div>
  )
}
