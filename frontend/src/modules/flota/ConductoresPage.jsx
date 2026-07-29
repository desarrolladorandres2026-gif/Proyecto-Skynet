import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ShieldAlert } from 'lucide-react'
import { conductores as api, empresas as empresasApi } from '../../api/flota.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  Btn, Badge, ErrorMsg, OkMsg, Field, Input, Select, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFecha, aInputFecha,
} from '../../components/ui.jsx'

const FORM_VACIO = {
  cedula: '', nombre: '', telefono: '', empresa: '',
  licNumero: '', licCategoria: '', licVence: '', estado: 'activo',
}

export default function ConductoresPage() {
  const { usuario, tienePermiso } = useAuth()
  const puedeGestionar = tienePermiso('conductores:gestionar')
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
      setLista(data.conductores)
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

  function abrir(c = null) {
    setEditandoId(c?._id || null)
    setForm(
      c
        ? {
            cedula: c.cedula, nombre: c.nombre, telefono: c.telefono || '',
            empresa: c.empresa?._id || '',
            licNumero: c.licencia?.numero || '', licCategoria: c.licencia?.categoria || '',
            licVence: aInputFecha(c.licencia?.vence), estado: c.estado,
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
        cedula: form.cedula,
        nombre: form.nombre,
        telefono: form.telefono,
        estado: form.estado,
        licencia: { numero: form.licNumero, categoria: form.licCategoria, vence: form.licVence || null },
      }
      if (!esScoped && form.empresa) datos.empresa = form.empresa
      if (editandoId) await api.actualizar(editandoId, datos)
      else await api.crear(datos)
      setOk(editandoId ? 'Conductor actualizado' : 'Conductor creado')
      setModal(false)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(c) {
    if (!window.confirm(`¿Eliminar al conductor ${c.nombre}?`)) return
    try {
      await api.eliminar(c._id)
      setOk('Conductor eliminado')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const licVencida = (c) => c.licencia?.vence && new Date(c.licencia.vence) < new Date()

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">Conductores</h1>
        {puedeGestionar && (
          <Btn onClick={() => abrir()} className="flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo conductor
          </Btn>
        )}
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay conductores registrados" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Nombre</Th><Th>Cédula</Th><Th>Empresa</Th><Th>Teléfono</Th>
              <Th>Licencia</Th><Th>Vence</Th><Th>Estado</Th>
              {puedeGestionar && <Th>Acciones</Th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c._id}>
                <Td className="font-medium">{c.nombre}</Td>
                <Td className="panel-mono">{c.cedula}</Td>
                <Td>{c.empresa?.nombre || '—'}</Td>
                <Td>{c.telefono || '—'}</Td>
                <Td>{c.licencia?.numero ? `${c.licencia.numero} (${c.licencia.categoria || '—'})` : '—'}</Td>
                <Td className={licVencida(c) ? '!text-rose-700 dark:!text-rose-300' : ''}>
                  <span className="flex items-center gap-1">
                    {licVencida(c) && <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                    {fmtFecha(c.licencia?.vence)}
                  </span>
                </Td>
                <Td><Badge valor={c.estado} /></Td>
                {puedeGestionar && (
                  <Td>
                    <div className="flex gap-1.5">
                      <Btn variante="fantasma" onClick={() => abrir(c)} title="Editar" className="!px-2">
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Btn>
                      <Btn variante="peligro" onClick={() => eliminar(c)} title="Eliminar" className="!px-2">
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

      <Modal abierto={modal} titulo={editandoId ? 'Editar conductor' : 'Nuevo conductor'} onCerrar={() => setModal(false)}>
        <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Cédula">
            <Input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} required />
          </Field>
          <Field label="Nombre">
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
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
          <Field label="Teléfono">
            <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </Field>
          <Field label="Licencia No.">
            <Input value={form.licNumero} onChange={(e) => setForm({ ...form, licNumero: e.target.value })} />
          </Field>
          <Field label="Categoría">
            <Input value={form.licCategoria} onChange={(e) => setForm({ ...form, licCategoria: e.target.value })} placeholder="C2" />
          </Field>
          <Field label="Licencia vence">
            <Input type="date" value={form.licVence} onChange={(e) => setForm({ ...form, licVence: e.target.value })} />
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
    </div>
  )
}
