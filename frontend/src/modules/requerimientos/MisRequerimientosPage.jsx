import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Btn, Badge, Card, ErrorMsg, TablaWrap, Th, Td, EmptyState, fmtFechaHora } from '../../components/ui.jsx'

function estadoVisible(r) {
  if (r.estado === 'pendiente_bodega' && r.bodega?.estado && r.bodega.estado !== 'pendiente') return r.bodega.estado
  return r.estado
}

export default function MisRequerimientosPage() {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    requerimientosApi
      .mios()
      .then((data) => setLista(data.requerimientos))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

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
        <TablaWrap>
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
                <Td><Badge valor={estadoVisible(r)} /></Td>
                <Td>
                  <Link to={`/requerimientos/${r._id}`} className="text-sm font-medium text-cyan-700 hover:underline dark:text-cyan-400">
                    Ver detalle
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
