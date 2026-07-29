import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, BarChart3 } from 'lucide-react'
import { empresas as api } from '../../api/flota.js'
import {
  Btn, Badge, ErrorMsg, OkMsg, Field, Input, Select, Modal,
  TablaWrap, Th, Td, EmptyState, Card,
} from '../../components/ui.jsx'

const FORM_VACIO = { nombre: '', nit: '', representante: '', telefono: '', email: '', direccion: '', estado: 'activo' }

export default function EmpresasPage() {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [modal, setModal] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [errorForm, setErrorForm] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [stats, setStats] = useState(null)

  async function cargar() {
    setCargando(true)
    try {
      const data = await api.listar()
      setLista(data.empresas)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  function abrir(e = null) {
    setEditandoId(e?._id || null)
    setForm(e ? { ...FORM_VACIO, ...e } : FORM_VACIO)
    setErrorForm('')
    setModal(true)
  }

  async function guardar(ev) {
    ev.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      if (editandoId) await api.actualizar(editandoId, form)
      else await api.crear(form)
      setOk(editandoId ? 'Empresa actualizada' : 'Empresa creada')
      setModal(false)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(e) {
    if (!window.confirm(`¿Eliminar la empresa "${e.nombre}"?`)) return
    try {
      await api.eliminar(e._id)
      setOk('Empresa eliminada')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  async function verStats(e) {
    try {
      const data = await api.estadisticas(e._id)
      setStats(data)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">Empresas transportadoras</h1>
        <Btn onClick={() => abrir()} className="flex items-center gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" /> Nueva empresa
        </Btn>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay empresas registradas" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Nombre</Th><Th>NIT</Th><Th>Representante</Th><Th>Teléfono</Th><Th>Estado</Th><Th>Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e._id}>
                <Td className="font-medium">{e.nombre}</Td>
                <Td>{e.nit || '—'}</Td>
                <Td>{e.representante || '—'}</Td>
                <Td>{e.telefono || '—'}</Td>
                <Td><Badge valor={e.estado} /></Td>
                <Td>
                  <div className="flex gap-1.5">
                    <Btn variante="fantasma" onClick={() => verStats(e)} title="Estadísticas" className="!px-2">
                      <BarChart3 className="h-4 w-4" aria-hidden="true" />
                    </Btn>
                    <Btn variante="fantasma" onClick={() => abrir(e)} title="Editar" className="!px-2">
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Btn>
                    <Btn variante="peligro" onClick={() => eliminar(e)} title="Eliminar" className="!px-2">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Modal abierto={modal} titulo={editandoId ? 'Editar empresa' : 'Nueva empresa'} onCerrar={() => setModal(false)}>
        <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Nombre" className="sm:col-span-2">
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          </Field>
          <Field label="NIT">
            <Input value={form.nit || ''} onChange={(e) => setForm({ ...form, nit: e.target.value })} />
          </Field>
          <Field label="Representante">
            <Input value={form.representante || ''} onChange={(e) => setForm({ ...form, representante: e.target.value })} />
          </Field>
          <Field label="Teléfono">
            <Input value={form.telefono || ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Dirección">
            <Input value={form.direccion || ''} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
          </Field>
          <Field label="Estado">
            <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </Select>
          </Field>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </form>
      </Modal>

      <Modal abierto={Boolean(stats)} titulo={`Estadísticas — ${stats?.empresa?.nombre || ''}`} onCerrar={() => setStats(null)}>
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ['Vehículos', stats.estadisticas.vehiculos],
              ['Veh. activos', stats.estadisticas.vehiculosActivos],
              ['Conductores', stats.estadisticas.conductoresActivos],
              ['Despachos hoy', stats.estadisticas.despachosHoy],
              ['Despachos mes', stats.estadisticas.despachosMes],
              ['Pasajeros mes', stats.estadisticas.pasajerosMes],
            ].map(([label, valor]) => (
              <Card key={label} className="text-center">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{valor}</p>
                <p className="panel-mono text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
              </Card>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
