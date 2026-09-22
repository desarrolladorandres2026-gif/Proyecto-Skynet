import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutList, Download, Trash2 } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Badge, Btn, Card, CardLink, ErrorMsg, OkMsg, Select, TablaWrap, Th, Td, EmptyState, fmtFechaHora } from '../../components/ui.jsx'
import ExportarRequerimientosModal from './ExportarRequerimientosModal.jsx'
import EliminarRequerimientosModal from './EliminarRequerimientosModal.jsx'
import EliminarRequerimientoModal from './EliminarRequerimientoModal.jsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'

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
  const [estado, setEstado] = useState('')
  const [tipo, setTipo] = useState('')
  const [ok, setOk] = useState('')
  const [modalExportar, setModalExportar] = useState(false)
  const [modalEliminar, setModalEliminar] = useState(false)
  const [aEliminar, setAEliminar] = useState(null)

  // Una entrada de caché por combinación de filtro: volver a "Todos" (sin
  // haber cambiado filtro) muestra la lista de inmediato en vez de "Cargando…".
  const { data, cargando, error, recargar, recargarSilencioso } = useDatosConCache(
    `requerimientos:todos:${estado}:${tipo}`,
    () => requerimientosApi.listarTodos({ estado: estado || undefined, tipo: tipo || undefined }).then((data) => data.requerimientos),
    { ttlMs: 30_000 },
  )
  const lista = data || []

  useAutoRefresh(recargarSilencioso)

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <LayoutList className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden="true" />
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
            {lista.map((r) =>
              // Super Admin tiene una segunda acción (Eliminar) además de
              // navegar al detalle: un <button> no puede anidarse dentro del
              // <a> que genera CardLink (HTML inválido), así que arma su
              // propio Card con fila de acciones — mismo patrón que
              // BandejaBodegaPage.jsx. El resto de roles sigue usando
              // CardLink tal cual, sin cambios.
              usuario?.esSuperAdmin ? (
                <Card key={r._id} className="space-y-2">
                  <Link to={`/requerimientos/${r._id}`} className="block">
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
                  </Link>
                  <div className="flex justify-end pt-1">
                    <Btn variante="peligro" onClick={() => setAEliminar(r)} className="flex items-center gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Eliminar
                    </Btn>
                  </div>
                </Card>
              ) : (
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
              )
            )}
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
                    <div className="flex items-center gap-3">
                      <Link to={`/requerimientos/${r._id}`} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
                        Ver detalle
                      </Link>
                      {usuario?.esSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setAEliminar(r)}
                          className="flex items-center gap-1 text-sm font-medium text-red-700 hover:underline dark:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Eliminar
                        </button>
                      )}
                    </div>
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
          recargar()
        }}
      />
      <EliminarRequerimientoModal
        abierto={!!aEliminar}
        requerimiento={aEliminar}
        onCerrar={() => setAEliminar(null)}
        onEliminado={() => {
          setOk('Requerimiento eliminado')
          recargar()
        }}
      />
    </div>
  )
}
