import { useEffect, useState } from 'react'
import { Plus, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { novedades as api } from '../../api/operacion.js'
import { vehiculos as vehiculosApi, conductores as conductoresApi } from '../../api/flota.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  Btn, Badge, ErrorMsg, OkMsg, Field, Input, Select, Textarea, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFechaHora,
} from '../../components/ui.jsx'

const FORM_VACIO = { tipo: 'operativa', descripcion: '', ubicacion: '', gravedad: 'baja', vehiculo: '', conductor: '' }

export default function NovedadesPage() {
  const { tienePermiso } = useAuth()
  const puedeIncidente = tienePermiso('novedades:registrar_incidente')
  const puedeCerrar = puedeIncidente || tienePermiso('novedades:consultar_historial')

  const [lista, setLista] = useState([])
  const [filtroEstado, setFiltroEstado] = useState('abierta')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [catalogos, setCatalogos] = useState({ vehiculos: [], conductores: [] })
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [errorForm, setErrorForm] = useState('')

  const [cerrando, setCerrando] = useState(null)
  const [observacionCierre, setObservacionCierre] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const data = await api.listar(filtroEstado ? { estado: filtroEstado } : {})
      setLista(data.novedades)
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
  }, [filtroEstado])

  useEffect(() => {
    Promise.all([
      vehiculosApi.listar().catch(() => ({ vehiculos: [] })),
      conductoresApi.listar().catch(() => ({ conductores: [] })),
    ]).then(([v, c]) => setCatalogos({ vehiculos: v.vehiculos, conductores: c.conductores }))
  }, [])

  async function guardar(ev) {
    ev.preventDefault()
    setErrorForm('')
    try {
      const datos = { ...form }
      if (!datos.vehiculo) delete datos.vehiculo
      if (!datos.conductor) delete datos.conductor
      await api.crear(datos)
      setOk('Novedad registrada')
      setModal(false)
      setForm(FORM_VACIO)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    }
  }

  async function cerrar(ev) {
    ev.preventDefault()
    try {
      await api.cerrar(cerrando._id, observacionCierre)
      setOk('Novedad cerrada')
      setCerrando(null)
      setObservacionCierre('')
      cargar()
    } catch (err) {
      setError(err.message)
      setCerrando(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <AlertTriangle className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" /> Novedades e incidentes
        </h1>
        <div className="flex items-center gap-2">
          <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="w-36">
            <option value="">Todas</option>
            <option value="abierta">Abiertas</option>
            <option value="cerrada">Cerradas</option>
          </Select>
          <Btn onClick={() => { setForm(FORM_VACIO); setErrorForm(''); setModal(true) }} className="flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Registrar
          </Btn>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay novedades con este filtro" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Fecha</Th><Th>Tipo</Th><Th>Gravedad</Th><Th>Descripción</Th>
              <Th>Ubicación</Th><Th>Reportó</Th><Th>Estado</Th>
              {puedeCerrar && <Th>Acciones</Th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((n) => (
              <tr key={n._id}>
                <Td className="whitespace-nowrap">{fmtFechaHora(n.createdAt)}</Td>
                <Td><Badge valor={n.tipo} /></Td>
                <Td><Badge valor={n.gravedad} /></Td>
                <Td className="max-w-sm">
                  {n.descripcion}
                  {(n.vehiculo || n.conductor) && (
                    <p className="mt-1 text-xs text-slate-500">
                      {n.vehiculo?.placa && `Vehículo: ${n.vehiculo.placa}`}
                      {n.vehiculo?.placa && n.conductor?.nombre && ' · '}
                      {n.conductor?.nombre && `Conductor: ${n.conductor.nombre}`}
                    </p>
                  )}
                </Td>
                <Td>{n.ubicacion || '—'}</Td>
                <Td>{n.reportadoPor?.nombre || '—'}</Td>
                <Td><Badge valor={n.estado} /></Td>
                {puedeCerrar && (
                  <Td>
                    {n.estado === 'abierta' && (
                      <Btn className="flex items-center gap-1.5 !px-2.5" onClick={() => { setCerrando(n); setObservacionCierre('') }}>
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Cerrar
                      </Btn>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Modal abierto={modal} titulo="Registrar novedad" onCerrar={() => setModal(false)}>
        <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Tipo">
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="operativa">Operativa</option>
              {puedeIncidente && <option value="incidente">Incidente de seguridad</option>}
            </Select>
          </Field>
          <Field label="Gravedad">
            <Select value={form.gravedad} onChange={(e) => setForm({ ...form, gravedad: e.target.value })}>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </Select>
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required />
          </Field>
          <Field label="Ubicación">
            <Input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} placeholder="Plataforma 3, sala de espera…" />
          </Field>
          <Field label="Vehículo (opcional)">
            <Select value={form.vehiculo} onChange={(e) => setForm({ ...form, vehiculo: e.target.value })}>
              <option value="">Ninguno</option>
              {catalogos.vehiculos.map((v) => (
                <option key={v._id} value={v._id}>{v.placa}</option>
              ))}
            </Select>
          </Field>
          <Field label="Conductor (opcional)">
            <Select value={form.conductor} onChange={(e) => setForm({ ...form, conductor: e.target.value })}>
              <option value="">Ninguno</option>
              {catalogos.conductores.map((c) => (
                <option key={c._id} value={c._id}>{c.nombre}</option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn type="submit">Registrar</Btn>
          </div>
        </form>
      </Modal>

      <Modal abierto={Boolean(cerrando)} titulo="Cerrar novedad" onCerrar={() => setCerrando(null)}>
        <form onSubmit={cerrar} className="grid gap-3">
          <Field label="Observación de cierre">
            <Textarea value={observacionCierre} onChange={(e) => setObservacionCierre(e.target.value)} placeholder="Cómo se resolvió…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setCerrando(null)}>Cancelar</Btn>
            <Btn type="submit">Cerrar novedad</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
