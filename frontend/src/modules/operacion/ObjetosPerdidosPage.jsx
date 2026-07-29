import { useEffect, useState } from 'react'
import { Plus, PackageSearch, HandHeart } from 'lucide-react'
import { objetosPerdidos as api } from '../../api/operacion.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  Btn, Badge, ErrorMsg, OkMsg, Field, Input, Select, Textarea, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFechaHora,
} from '../../components/ui.jsx'

const FORM_VACIO = { descripcion: '', lugarHallazgo: '', fechaHallazgo: '' }
const ENTREGA_VACIA = { nombre: '', cedula: '', telefono: '' }

export default function ObjetosPerdidosPage() {
  const { tienePermiso } = useAuth()
  const puedeEntregar = tienePermiso('objetos_perdidos:gestionar')

  const [lista, setLista] = useState([])
  const [filtro, setFiltro] = useState('custodia')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [entregando, setEntregando] = useState(null)
  const [formEntrega, setFormEntrega] = useState(ENTREGA_VACIA)
  const [errorForm, setErrorForm] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const data = await api.listar(filtro || undefined)
      setLista(data.objetos)
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
  }, [filtro])

  async function guardar(ev) {
    ev.preventDefault()
    setErrorForm('')
    try {
      await api.registrar(form)
      setOk('Objeto registrado en custodia')
      setModal(false)
      setForm(FORM_VACIO)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    }
  }

  async function entregar(ev) {
    ev.preventDefault()
    setErrorForm('')
    try {
      await api.entregar(entregando._id, formEntrega)
      setOk('Objeto entregado a su dueño')
      setEntregando(null)
      setFormEntrega(ENTREGA_VACIA)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <PackageSearch className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" /> Objetos perdidos
        </h1>
        <div className="flex items-center gap-2">
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="w-36">
            <option value="">Todos</option>
            <option value="custodia">En custodia</option>
            <option value="entregado">Entregados</option>
          </Select>
          <Btn onClick={() => { setForm(FORM_VACIO); setErrorForm(''); setModal(true) }} className="flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Registrar hallazgo
          </Btn>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay objetos con este filtro" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Hallado</Th><Th>Descripción</Th><Th>Lugar</Th><Th>Registró</Th>
              <Th>Estado</Th><Th>Entrega</Th>
              {puedeEntregar && <Th>Acciones</Th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((o) => (
              <tr key={o._id}>
                <Td className="whitespace-nowrap">{fmtFechaHora(o.fechaHallazgo)}</Td>
                <Td className="max-w-sm">{o.descripcion}</Td>
                <Td>{o.lugarHallazgo}</Td>
                <Td>{o.registradoPor?.nombre || '—'}</Td>
                <Td><Badge valor={o.estado} /></Td>
                <Td>
                  {o.estado === 'entregado' && o.entrega?.nombre ? (
                    <div className="text-xs">
                      <p className="text-slate-700 dark:text-slate-200">{o.entrega.nombre}</p>
                      <p className="text-slate-500">CC {o.entrega.cedula} · {fmtFechaHora(o.entrega.fecha)}</p>
                    </div>
                  ) : '—'}
                </Td>
                {puedeEntregar && (
                  <Td>
                    {o.estado === 'custodia' && (
                      <Btn className="flex items-center gap-1.5 !px-2.5" onClick={() => { setEntregando(o); setFormEntrega(ENTREGA_VACIA); setErrorForm('') }}>
                        <HandHeart className="h-3.5 w-3.5" aria-hidden="true" /> Entregar
                      </Btn>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Modal abierto={modal} titulo="Registrar objeto hallado" onCerrar={() => setModal(false)}>
        <form onSubmit={guardar} className="grid gap-3">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Descripción del objeto">
            <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required />
          </Field>
          <Field label="Lugar del hallazgo">
            <Input value={form.lugarHallazgo} onChange={(e) => setForm({ ...form, lugarHallazgo: e.target.value })} required />
          </Field>
          <Field label="Fecha y hora del hallazgo">
            <Input type="datetime-local" value={form.fechaHallazgo} onChange={(e) => setForm({ ...form, fechaHallazgo: e.target.value })} required />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn type="submit">Registrar</Btn>
          </div>
        </form>
      </Modal>

      <Modal abierto={Boolean(entregando)} titulo="Entregar objeto al dueño" onCerrar={() => setEntregando(null)}>
        <form onSubmit={entregar} className="grid gap-3">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <p className="rounded-lg border border-cyan-600/25 bg-cyan-600/5 px-3 py-2 text-sm text-slate-600 dark:border-cyan-400/20 dark:bg-cyan-400/5 dark:text-slate-300">
            {entregando?.descripcion}
          </p>
          <Field label="Nombre de quien recibe">
            <Input value={formEntrega.nombre} onChange={(e) => setFormEntrega({ ...formEntrega, nombre: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cédula">
              <Input value={formEntrega.cedula} onChange={(e) => setFormEntrega({ ...formEntrega, cedula: e.target.value })} required />
            </Field>
            <Field label="Teléfono">
              <Input value={formEntrega.telefono} onChange={(e) => setFormEntrega({ ...formEntrega, telefono: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setEntregando(null)}>Cancelar</Btn>
            <Btn type="submit">Confirmar entrega</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
