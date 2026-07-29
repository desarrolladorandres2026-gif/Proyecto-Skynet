import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ShieldAlert } from 'lucide-react'
import { vehiculos as api, empresas as empresasApi } from '../../api/flota.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  Btn, Badge, ErrorMsg, OkMsg, Field, Input, Select, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFecha, aInputFecha,
} from '../../components/ui.jsx'

const FORM_VACIO = {
  placa: '', tipo: 'bus', marca: '', modelo: '', capacidad: '',
  empresa: '', soatVence: '', tecnomecanicaVence: '', estado: 'activo',
}

function docVencido(fecha) {
  return fecha && new Date(fecha) < new Date()
}

export default function VehiculosPage() {
  const { usuario, tienePermiso } = useAuth()
  const puedeGestionar = tienePermiso('vehiculos:gestionar')
  // El rol Empresa Transportadora está scoped: el backend fuerza su empresa,
  // así que no necesita (ni puede usar) el selector de empresa.
  const esScoped = usuario?.rol?.ambito === 'empresa'

  const [lista, setLista] = useState([])
  const [listaEmpresas, setListaEmpresas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [modal, setModal] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [errorForm, setErrorForm] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    setCargando(true)
    try {
      const data = await api.listar()
      setLista(data.vehiculos)
      if (puedeGestionar && !esScoped) {
        const e = await empresasApi.listar()
        setListaEmpresas(e.empresas)
      }
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
  }, [])

  function abrir(v = null) {
    setEditandoId(v?._id || null)
    setForm(
      v
        ? {
            placa: v.placa, tipo: v.tipo, marca: v.marca || '', modelo: v.modelo || '',
            capacidad: v.capacidad, empresa: v.empresa?._id || '',
            soatVence: aInputFecha(v.soatVence), tecnomecanicaVence: aInputFecha(v.tecnomecanicaVence),
            estado: v.estado,
          }
        : FORM_VACIO
    )
    setErrorForm('')
    setModal(true)
  }

  async function guardar(ev) {
    ev.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      const datos = {
        ...form,
        modelo: form.modelo ? Number(form.modelo) : undefined,
        capacidad: Number(form.capacidad),
        soatVence: form.soatVence || null,
        tecnomecanicaVence: form.tecnomecanicaVence || null,
      }
      if (esScoped || !datos.empresa) delete datos.empresa
      if (editandoId) await api.actualizar(editandoId, datos)
      else await api.crear(datos)
      setOk(editandoId ? 'Vehículo actualizado' : 'Vehículo creado')
      setModal(false)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(v) {
    if (!window.confirm(`¿Eliminar el vehículo ${v.placa}?`)) return
    try {
      await api.eliminar(v._id)
      setOk('Vehículo eliminado')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">Vehículos</h1>
        {puedeGestionar && (
          <Btn onClick={() => abrir()} className="flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo vehículo
          </Btn>
        )}
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay vehículos registrados" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Placa</Th><Th>Empresa</Th><Th>Tipo</Th><Th>Capacidad</Th>
              <Th>SOAT</Th><Th>Tecnomecánica</Th><Th>Estado</Th>
              {puedeGestionar && <Th>Acciones</Th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((v) => (
              <tr key={v._id}>
                <Td className="panel-mono font-semibold !text-slate-800 dark:!text-slate-100">{v.placa}</Td>
                <Td>{v.empresa?.nombre || '—'}</Td>
                <Td className="capitalize">{v.tipo}</Td>
                <Td>{v.capacidad}</Td>
                <Td className={docVencido(v.soatVence) ? '!text-rose-700 dark:!text-rose-300' : ''}>
                  <span className="flex items-center gap-1">
                    {docVencido(v.soatVence) && <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                    {fmtFecha(v.soatVence)}
                  </span>
                </Td>
                <Td className={docVencido(v.tecnomecanicaVence) ? '!text-rose-700 dark:!text-rose-300' : ''}>
                  <span className="flex items-center gap-1">
                    {docVencido(v.tecnomecanicaVence) && <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                    {fmtFecha(v.tecnomecanicaVence)}
                  </span>
                </Td>
                <Td><Badge valor={v.estado} /></Td>
                {puedeGestionar && (
                  <Td>
                    <div className="flex gap-1.5">
                      <Btn variante="fantasma" onClick={() => abrir(v)} title="Editar" className="!px-2">
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Btn>
                      <Btn variante="peligro" onClick={() => eliminar(v)} title="Eliminar" className="!px-2">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Btn>
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Modal abierto={modal} titulo={editandoId ? 'Editar vehículo' : 'Nuevo vehículo'} onCerrar={() => setModal(false)}>
        <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Placa">
            <Input value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })} required />
          </Field>
          <Field label="Tipo">
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {['bus', 'buseta', 'microbus', 'taxi', 'van'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          {!esScoped && (
            <Field label="Empresa">
              <Select value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} required={!editandoId}>
                <option value="">Selecciona…</option>
                {listaEmpresas.map((e) => (
                  <option key={e._id} value={e._id}>{e.nombre}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Marca">
            <Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
          </Field>
          <Field label="Modelo (año)">
            <Input type="number" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
          </Field>
          <Field label="Capacidad">
            <Input type="number" min="1" value={form.capacidad} onChange={(e) => setForm({ ...form, capacidad: e.target.value })} required />
          </Field>
          <Field label="SOAT vence">
            <Input type="date" value={form.soatVence} onChange={(e) => setForm({ ...form, soatVence: e.target.value })} />
          </Field>
          <Field label="Tecnomecánica vence">
            <Input type="date" value={form.tecnomecanicaVence} onChange={(e) => setForm({ ...form, tecnomecanicaVence: e.target.value })} />
          </Field>
          <Field label="Estado">
            <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              <option value="activo">Activo</option>
              <option value="mantenimiento">Mantenimiento</option>
              <option value="inactivo">Inactivo</option>
            </Select>
          </Field>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
