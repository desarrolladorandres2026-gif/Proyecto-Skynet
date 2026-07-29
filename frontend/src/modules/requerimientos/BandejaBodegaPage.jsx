import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Warehouse, Printer } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Badge, Btn, Card, ErrorMsg, TablaWrap, Th, Td, EmptyState, fmtFechaHora } from '../../components/ui.jsx'
import { generarPdfRequerimiento } from '../../pdf/requerimientoPdf.js'

export default function BandejaBodegaPage() {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    requerimientosApi
      .bandejaBodega()
      .then((data) => setLista(data.requerimientos))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="panel-mono mb-4 flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
        <Warehouse className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        Bandeja Bodega — aprobados por Financiero
      </h1>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay requerimientos aprobados por Financiero" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Tipo</Th>
              <Th>Solicitante</Th>
              <Th>Estado</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r._id}>
                <Td className="whitespace-nowrap">{fmtFechaHora(r.fechaSolicitud || r.createdAt)}</Td>
                <Td className="capitalize">{r.tipo}</Td>
                <Td>{r.solicitante?.nombre}</Td>
                <Td><Badge valor={r.bodega?.estado} /></Td>
                <Td>
                  <div className="flex items-center justify-end gap-2">
                    <Btn variante="fantasma" onClick={() => generarPdfRequerimiento(r)} className="flex items-center gap-1.5 !px-2.5" title="Generar PDF">
                      <Printer className="h-3.5 w-3.5" aria-hidden="true" /> PDF
                    </Btn>
                    <Link to={`/requerimientos/${r._id}`} className="text-sm font-medium text-cyan-700 hover:underline dark:text-cyan-400">
                      Gestionar
                    </Link>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}
    </div>
  )
}
