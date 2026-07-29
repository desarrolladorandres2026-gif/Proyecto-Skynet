import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, ShieldCheck, Ban, Save, Printer } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Input, Select, Textarea, Modal,
  TablaWrap, Th, Td, fmtFecha, fmtFechaHora, aInputFecha,
} from '../../components/ui.jsx'
import ReautenticacionModal from '../../components/ReautenticacionModal.jsx'
import { generarPdfRequerimiento } from '../../pdf/requerimientoPdf.js'
import FormularioCompra from './FormularioCompra.jsx'

const ESTADOS_BODEGA = [
  { valor: 'pendiente', label: 'Pendiente' },
  { valor: 'aprobada', label: 'Aprobada' },
  { valor: 'no_aprobada', label: 'No aprobada' },
]

const CAMPOS_SERVICIO = [
  ['Descripción del tipo de servicio', 'descripcionTipoServicio'],
  ['Competencia (educación, formación y experiencia)', 'competencia'],
  ['Labores a desarrollar', 'laboresADesarrollar'],
  ['Requisitos SST-A', 'requisitosSST'],
]

export default function RequerimientoDetallePage() {
  const { id } = useParams()
  const { tienePermiso } = useAuth()

  const [req, setReq] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  // Edición de Financiero (pre-cargada desde `req` al llegar la respuesta).
  const [areaOProceso, setAreaOProceso] = useState('')
  const [items, setItems] = useState([])
  const [detalle, setDetalle] = useState(null)
  const [analisisTecnico, setAnalisisTecnico] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [modalFirma, setModalFirma] = useState(false)
  const [modalRechazo, setModalRechazo] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const { requerimiento } = await requerimientosApi.detalle(id)
      setReq(requerimiento)
      setAreaOProceso(requerimiento.areaOProceso || '')
      setItems((requerimiento.itemsCompra || []).map((it) => ({ ...it, fechaSolicitud: aInputFecha(it.fechaSolicitud) })))
      setDetalle(requerimiento.detalleServicio || { descripcionTipoServicio: '', competencia: '', laboresADesarrollar: '', requisitosSST: '' })
      setAnalisisTecnico(requerimiento.financiero?.analisisTecnico || '')
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
  }, [id])

  if (cargando) return <Card>Cargando…</Card>
  if (error && !req) return <ErrorMsg>{error}</ErrorMsg>
  if (!req) return null

  const esFinanciero = tienePermiso('requerimientos:aprobar_financiero')
  const esBodega = tienePermiso('requerimientos:gestionar_bodega')
  const puedeEditarFinanciero = esFinanciero && req.estado === 'pendiente_financiero'
  const puedeGestionarBodega = esBodega && req.estado === 'pendiente_bodega'
  const mostrarColumnaRecibido = req.tipo === 'compra' && req.bodega?.estado === 'aprobada'
  const puedeControlRecibido = esBodega && mostrarColumnaRecibido

  function cambiosFinanciero(extra = {}) {
    const base = { areaOProceso, analisisTecnico, ...extra }
    if (req.tipo === 'compra') base.itemsCompra = items
    else base.detalleServicio = detalle
    return base
  }

  async function guardarEdicion() {
    setGuardando(true)
    setError('')
    setOk('')
    try {
      const { requerimiento } = await requerimientosApi.editarFinanciero(id, cambiosFinanciero())
      setReq(requerimiento)
      setOk('Cambios guardados')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function aprobar(password) {
    const { requerimiento } = await requerimientosApi.aprobarFinanciero(id, cambiosFinanciero({ password }))
    setReq(requerimiento)
    setOk('Requerimiento aprobado y firmado')
  }

  async function rechazar() {
    setGuardando(true)
    setError('')
    try {
      const { requerimiento } = await requerimientosApi.rechazarFinanciero(id, motivoRechazo)
      setReq(requerimiento)
      setModalRechazo(false)
      setOk('Requerimiento rechazado')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstadoBodega(estado) {
    setError('')
    setOk('')
    try {
      const { requerimiento } = await requerimientosApi.marcarEstadoBodega(id, estado)
      setReq(requerimiento)
      setOk(`Requerimiento marcado como "${estado}"`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function marcarRecibido(itemId, recibido) {
    setError('')
    try {
      const { requerimiento } = await requerimientosApi.marcarControlRecibido(id, itemId, recibido)
      setReq(requerimiento)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <FileText className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Requerimiento de {req.tipo}
        </h1>
        <div className="flex items-center gap-2">
          <Badge valor={req.estado} />
          {req.estado === 'pendiente_bodega' && <Badge valor={req.bodega?.estado} />}
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="panel-mono text-[11px] uppercase tracking-[0.1em] text-cyan-700/80 dark:text-cyan-400/80">Solicitante</p>
            <p className="text-sm text-slate-800 dark:text-slate-100">{req.solicitante?.nombre}</p>
          </div>
          <div>
            <p className="panel-mono text-[11px] uppercase tracking-[0.1em] text-cyan-700/80 dark:text-cyan-400/80">Cargo</p>
            <p className="text-sm text-slate-800 dark:text-slate-100">{req.cargoSolicitante}</p>
          </div>
          <div>
            <p className="panel-mono text-[11px] uppercase tracking-[0.1em] text-cyan-700/80 dark:text-cyan-400/80">Fecha</p>
            <p className="text-sm text-slate-800 dark:text-slate-100">{fmtFechaHora(req.fechaSolicitud)}</p>
          </div>
        </div>

        {puedeEditarFinanciero ? (
          <Field label="Área o proceso">
            <Input value={areaOProceso} onChange={(e) => setAreaOProceso(e.target.value)} />
          </Field>
        ) : (
          req.areaOProceso && (
            <div>
              <p className="panel-mono text-[11px] uppercase tracking-[0.1em] text-cyan-700/80 dark:text-cyan-400/80">Área o proceso</p>
              <p className="text-sm text-slate-800 dark:text-slate-100">{req.areaOProceso}</p>
            </div>
          )
        )}
      </Card>

      {req.tipo === 'compra' ? (
        <Card>
          <p className="panel-mono mb-2 text-[11px] uppercase tracking-[0.1em] text-cyan-700/80 dark:text-cyan-400/80">
            Productos solicitados
          </p>
          {puedeEditarFinanciero ? (
            <FormularioCompra items={items} onChange={setItems} />
          ) : (
            <TablaWrap>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Descripción</Th>
                  <Th>Cantidad</Th>
                  <Th>Destino</Th>
                  {mostrarColumnaRecibido && <Th>Control de recibido</Th>}
                </tr>
              </thead>
              <tbody>
                {(req.itemsCompra || []).map((it, i) => (
                  <tr key={it._id || i}>
                    <Td className="whitespace-nowrap">{fmtFecha(it.fechaSolicitud)}</Td>
                    <Td>{it.descripcionProducto}</Td>
                    <Td>{it.cantidad}</Td>
                    <Td>{it.destino || '—'}</Td>
                    {mostrarColumnaRecibido && (
                      <Td>
                        {puedeControlRecibido ? (
                          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                            <input
                              type="checkbox"
                              checked={Boolean(it.controlRecibido?.recibido)}
                              onChange={(e) => marcarRecibido(it._id, e.target.checked)}
                            />
                            {it.controlRecibido?.recibido ? `Recibido ${fmtFecha(it.controlRecibido.fecha)}` : 'Marcar recibido'}
                          </label>
                        ) : it.controlRecibido?.recibido ? (
                          `Recibido ${fmtFecha(it.controlRecibido.fecha)}`
                        ) : (
                          'Pendiente'
                        )}
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </TablaWrap>
          )}
        </Card>
      ) : (
        <Card className="space-y-3">
          {CAMPOS_SERVICIO.map(([label, campo]) => (
            <div key={campo}>
              {puedeEditarFinanciero ? (
                <Field label={label}>
                  <Textarea value={detalle?.[campo] || ''} onChange={(e) => setDetalle((d) => ({ ...d, [campo]: e.target.value }))} />
                </Field>
              ) : (
                <>
                  <p className="panel-mono text-[11px] uppercase tracking-[0.1em] text-cyan-700/80 dark:text-cyan-400/80">{label}</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{req.detalleServicio?.[campo] || '—'}</p>
                </>
              )}
            </div>
          ))}
        </Card>
      )}

      <Card className="space-y-3">
        <p className="panel-mono text-[11px] uppercase tracking-[0.1em] text-cyan-700/80 dark:text-cyan-400/80">Financiero</p>

        {puedeEditarFinanciero ? (
          <Field label="Análisis técnico del requerimiento (opcional)">
            <Textarea value={analisisTecnico} onChange={(e) => setAnalisisTecnico(e.target.value)} />
          </Field>
        ) : (
          req.financiero?.analisisTecnico && (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Análisis técnico</p>
              <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{req.financiero.analisisTecnico}</p>
            </div>
          )
        )}

        {req.financiero?.fechaDecision && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {req.estado === 'rechazado' ? 'Rechazado' : 'Aprobado'} por <strong>{req.financiero.nombreAprobador}</strong>
            {req.financiero.cargoAprobador ? ` (${req.financiero.cargoAprobador})` : ''} el {fmtFechaHora(req.financiero.fechaDecision)}
          </p>
        )}
        {req.estado === 'rechazado' && req.financiero?.motivoRechazo && <ErrorMsg>{req.financiero.motivoRechazo}</ErrorMsg>}

        {req.financiero?.historialEdiciones?.length > 0 && (
          <details className="text-sm text-slate-600 dark:text-slate-300">
            <summary className="cursor-pointer select-none font-medium">
              Historial de ediciones de Financiero ({req.financiero.historialEdiciones.length})
            </summary>
            <ul className="mt-2 space-y-1 pl-4 text-xs">
              {req.financiero.historialEdiciones.map((h) => (
                <li key={h._id}>
                  {h.nombreEditor} — {fmtFechaHora(h.fecha)}
                  {h.comentario ? `: ${h.comentario}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}

        {puedeEditarFinanciero && (
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={guardarEdicion} disabled={guardando} className="flex items-center gap-1.5">
              <Save className="h-4 w-4" aria-hidden="true" /> Guardar cambios
            </Btn>
            <Btn variante="peligro" onClick={() => setModalRechazo(true)} className="flex items-center gap-1.5">
              <Ban className="h-4 w-4" aria-hidden="true" /> Rechazar
            </Btn>
            <Btn onClick={() => setModalFirma(true)} className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Aprobar y firmar
            </Btn>
          </div>
        )}
      </Card>

      {(req.estado === 'pendiente_bodega' || req.bodega?.fecha) && (
        <Card className="space-y-3">
          <p className="panel-mono text-[11px] uppercase tracking-[0.1em] text-cyan-700/80 dark:text-cyan-400/80">Bodega</p>
          {puedeGestionarBodega ? (
            <Field label="Estado">
              <Select value={req.bodega?.estado || 'pendiente'} onChange={(e) => cambiarEstadoBodega(e.target.value)}>
                {ESTADOS_BODEGA.map((o) => (
                  <option key={o.valor} value={o.valor}>{o.label}</option>
                ))}
              </Select>
            </Field>
          ) : (
            req.bodega?.nombreRevisor && (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Revisado por <strong>{req.bodega.nombreRevisor}</strong> el {fmtFechaHora(req.bodega.fecha)}
              </p>
            )
          )}
        </Card>
      )}

      <div className="flex justify-end">
        <Btn variante="secundario" onClick={() => generarPdfRequerimiento(req)} className="flex items-center gap-1.5">
          <Printer className="h-4 w-4" aria-hidden="true" /> Generar PDF
        </Btn>
      </div>

      <ReautenticacionModal
        abierto={modalFirma}
        titulo="Firmar aprobación"
        descripcion="Reingresa tu contraseña para confirmar la aprobación de este requerimiento como Financiero."
        onConfirmar={aprobar}
        onCerrar={() => setModalFirma(false)}
      />

      <Modal abierto={modalRechazo} titulo="Rechazar requerimiento" onCerrar={() => setModalRechazo(false)}>
        <div className="space-y-4">
          <Field label="Motivo del rechazo">
            <Textarea required value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} />
          </Field>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            El rechazo es definitivo: si el solicitante quiere insistir, debe crear un requerimiento nuevo.
          </p>
          <div className="flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setModalRechazo(false)}>Cancelar</Btn>
            <Btn variante="peligro" onClick={rechazar} disabled={guardando || !motivoRechazo.trim()}>
              Confirmar rechazo
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
