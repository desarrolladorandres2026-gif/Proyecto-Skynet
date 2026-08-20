import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutList, Download, Trash2 } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Badge, Btn, Card, CardLink, ErrorMsg, OkMsg, Select, TablaWrap, Th, Td, EmptyState, fmtFechaHora } from '../../components/ui.jsx'
import ExportarRequerimientosModal from './ExportarRequerimientosModal.jsx'
import EliminarRequerimientosModal from './EliminarRequerimientosModal.jsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'

const ESTADOS = [
  { valor: '', label: 'Todos los estados' },
  { valor: 'pendiente_financiero', label: 'Pendiente Financiero' },
  { valor: 'pendiente_bodega', label: 'Aprobado (en Bodega)' },
  { valor: 'rechazado', label: 'Rechazado' },
]
// Mismos valores que Backend/src/models/Requerimiento.js (estado raíz +
// bodega.estado) — ver mismo mapa en RequerimientoDetallePage.jsx.
const LABEL_ESTADO = {
  pendiente_financiero: 'Pendiente Financiero',
  pendiente_bodega: 'Aprobado',
  rechazado: 'Rechazado',
}
const LABEL_ESTADO_BODEGA = {
  pendiente: 'Pendiente por despachar',
  aprobada: 'Despachado',
  no_aprobada: 'No se puede despachar',
}
const TIPOS = [
  { valor: '', label: 'Todos los tipos' },
  { valor: 'compra', label: 'Compra' },
  { valor: 'servicio', label: 'Servicio' },
]

export default function TodosRequerimientosPage() {
  const { usuario } = useAuth()
  const [lista, setLista] = useState([])
  const [estado, setEstado] = useState('')
  const [tipo, setTipo] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [modalExportar, setModalExportar] = useState(false)
  const [modalEliminar, setModalEliminar] = useState(false)

  // `silencioso` evita tocar los estados de carga/error en los refrescos
  // automáticos de fondo (ver useAutoRefresh) — solo la carga inicial o un
  // cambio de filtro muestran "Cargando…" o un error visible.
  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true)
      try {
        const data = await requerimientosApi.listarTodos({ estado: estado || undefined, tipo: tipo || undefined })
        setLista(data.requerimientos)
        if (!silencioso) setError('')
      } catch (err) {
        if (!silencioso) setError(err.message)
      } finally {
        if (!silencioso) setCargando(false)
      }
    },
    [estado, tipo]
  )

  useEffect(() => {
    cargar()
  }, [cargar])

  useAutoRefresh(() => cargar(true))

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <LayoutList className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Todos los requerimientos
        </h1>
        <div className="flex flex-wrap gap-2">
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
          <Btn variante="secundario" onClick={() => setModalExportar(true)} className="flex items-center gap-1.5">
            <Download className="h-4 w-4" aria-hidden="true" /> Exportar
          </Btn>
          {/* Purgar por fecha es exclusivo de Super Admin — es mantenimiento
              de plataforma, no una acción de negocio con permiso RBAC propio
              (ver requerimientos.routes.js: soloAdmin). */}
          {usuario?.esSuperAdmin && (
            <Btn variante="peligro" onClick={() => setModalEliminar(true)} className="flex items-center gap-1.5">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Eliminar por fecha
            </Btn>
          )}
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay requerimientos con este filtro" />
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
                <p className="mb-1.5 truncate text-sm text-slate-600 dark:text-slate-300">{r.solicitante?.nombre}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge valor={r.estado} label={LABEL_ESTADO[r.estado] || r.estado} />
                  {r.estado === 'pendiente_bodega' && (
                    <Badge valor={r.bodega?.estado} label={LABEL_ESTADO_BODEGA[r.bodega?.estado] || r.bodega?.estado} />
                  )}
                </div>
              </CardLink>
            ))}
          </div>

          <TablaWrap className="hidden sm:block">
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
                      <Badge valor={r.estado} label={LABEL_ESTADO[r.estado] || r.estado} />
                      {r.estado === 'pendiente_bodega' && (
                        <Badge valor={r.bodega?.estado} label={LABEL_ESTADO_BODEGA[r.bodega?.estado] || r.bodega?.estado} />
                      )}
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
        </>
      )}

      <ExportarRequerimientosModal abierto={modalExportar} onCerrar={() => setModalExportar(false)} />
      <EliminarRequerimientosModal
        abierto={modalEliminar}
        onCerrar={() => setModalEliminar(false)}
        onEliminado={(eliminados) => {
          setOk(`Se eliminaron ${eliminados} requerimiento(s)`)
          cargar()
        }}
      />
    </div>
  )
}
