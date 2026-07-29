import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutList } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Badge, Card, ErrorMsg, Select, TablaWrap, Th, Td, EmptyState, fmtFechaHora } from '../../components/ui.jsx'

const ESTADOS = [
  { valor: '', label: 'Todos los estados' },
  { valor: 'pendiente_financiero', label: 'Pendiente Financiero' },
  { valor: 'pendiente_bodega', label: 'Pendiente Bodega' },
  { valor: 'rechazado', label: 'Rechazado' },
]
const TIPOS = [
  { valor: '', label: 'Todos los tipos' },
  { valor: 'compra', label: 'Compra' },
  { valor: 'servicio', label: 'Servicio' },
]

export default function TodosRequerimientosPage() {
  const [lista, setLista] = useState([])
  const [estado, setEstado] = useState('')
  const [tipo, setTipo] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const data = await requerimientosApi.listarTodos({ estado: estado || undefined, tipo: tipo || undefined })
      setLista(data.requerimientos)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, tipo])

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <LayoutList className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Todos los requerimientos
        </h1>
        <div className="flex gap-2">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-40">
            {TIPOS.map((o) => (
              <option key={o.valor} value={o.valor}>{o.label}</option>
            ))}
          </Select>
          <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-48">
            {ESTADOS.map((o) => (
              <option key={o.valor} value={o.valor}>{o.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay requerimientos con este filtro" />
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
                <Td>
                  <div className="flex gap-1.5">
                    <Badge valor={r.estado} />
                    {r.estado === 'pendiente_bodega' && <Badge valor={r.bodega?.estado} />}
                  </div>
                </Td>
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
