import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Plus, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { sig } from '../../api/sig.js'
import { catalogosApi } from '../../api/catalogos.js'
import {
  Btn, Badge, Card, ErrorMsg, Field, Input, Select, Switch, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFechaHora,
} from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'

const FORM_VACIO = { preguntaId: '', fecha: '', hora: '', dirigida: false, dependencias: [], cargos: [] }

export default function ProgramacionesPage() {
  const [programaciones, setProgramaciones] = useState([])
  const [preguntasActivas, setPreguntasActivas] = useState([])
  const [catalogos, setCatalogos] = useState({ dependencias: [], cargos: [] })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  const [porCancelar, setPorCancelar] = useState(null)
  const [cancelando, setCancelando] = useState(false)

  async function cargar() {
    setCargando(true)
    try {
      const [datosProg, datosBanco, datosCatalogos] = await Promise.all([
        sig.programacion.listarIndividual(),
        sig.banco.listar({ estado: 'activa' }),
        catalogosApi.obtener(),
      ])
      setProgramaciones(datosProg.programaciones)
      setPreguntasActivas(datosBanco.preguntas)
      setCatalogos(datosCatalogos)
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

  function abrirNueva() {
    setForm(FORM_VACIO)
    setErrorForm('')
    setModalAbierto(true)
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      await sig.programacion.crearIndividual({
        preguntaId: form.preguntaId,
        fecha: form.fecha,
        hora: form.hora || undefined,
        audiencia: form.dirigida
          ? { todos: false, dependencias: form.dependencias, cargos: form.cargos }
          : { todos: true },
      })
      toast.success('Pregunta programada')
      setModalAbierto(false)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarCancelar() {
    if (!porCancelar) return
    setCancelando(true)
    try {
      await sig.programacion.cancelarIndividual(porCancelar._id, '')
      toast.success('Programación cancelada')
      cargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCancelando(false)
      setPorCancelar(null)
    }
  }

  function alternarMulti(campo, valor) {
    setForm((f) => {
      const lista = f[campo].includes(valor) ? f[campo].filter((v) => v !== valor) : [...f[campo], valor]
      return { ...f, [campo]: lista }
    })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <CalendarClock className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Programación de preguntas
        </h1>
        <div className="flex items-center gap-3">
          <Link to="/sig/calendario" className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-400">
            Ver calendario
          </Link>
          <Link to="/sig/programacion/campanas" className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-400">
            Ver campañas
          </Link>
          <Btn className="flex items-center gap-1.5" onClick={abrirNueva}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Programar pregunta
          </Btn>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : programaciones.length === 0 ? (
        <EmptyState mensaje="No hay preguntas programadas todavía" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Pregunta</Th>
              <Th>Componente</Th>
              <Th>Publicación</Th>
              <Th>Estado</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {programaciones.map((p) => (
              <tr key={p._id}>
                <Td className="max-w-sm">{p.pregunta?.enunciado || '—'}</Td>
                <Td>{p.pregunta?.componenteSig || p.snapshotPregunta?.componenteSig}</Td>
                <Td className="whitespace-nowrap">{fmtFechaHora(p.fechaHoraPublicacion)}</Td>
                <Td><Badge valor={p.estado} label={{ programada: 'Programada', publicada: 'Publicada', cancelada: 'Cancelada' }[p.estado]} /></Td>
                <Td className="text-right">
                  {p.estado === 'programada' && (
                    <Btn variante="fantasma" className="flex items-center gap-1.5 !text-red-600 dark:!text-red-400" onClick={() => setPorCancelar(p)}>
                      <Ban className="h-4 w-4" aria-hidden="true" /> Cancelar
                    </Btn>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Modal abierto={modalAbierto} titulo="Programar pregunta" onCerrar={() => setModalAbierto(false)}>
        <form onSubmit={guardar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>

          <Field label="Pregunta">
            <Select required value={form.preguntaId} onChange={(e) => setForm({ ...form, preguntaId: e.target.value })}>
              <option value="" disabled>Selecciona una pregunta del banco…</option>
              {preguntasActivas.map((p) => (
                <option key={p._id} value={p._id}>[{p.componenteSig}] {p.enunciado.slice(0, 60)}</option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha de publicación">
              <Input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
            <Field label="Hora (opcional, usa la del sistema si se deja vacía)">
              <Input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
            <span className="text-sm text-slate-700 dark:text-slate-200">Dirigir a un área o cargo específico</span>
            <Switch checked={form.dirigida} onChange={(v) => setForm({ ...form, dirigida: v })} label="Dirigir a un área o cargo específico" />
          </div>

          {form.dirigida && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dependencias">
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  {catalogos.dependencias.map((d) => (
                    <label key={d._id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={form.dependencias.includes(d.nombre)} onChange={() => alternarMulti('dependencias', d.nombre)} />
                      {d.nombre}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Cargos">
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  {catalogos.cargos.map((c) => (
                    <label key={c._id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={form.cargos.includes(c.nombre)} onChange={() => alternarMulti('cargos', c.nombre)} />
                      {c.nombre}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalAbierto(false)}>Cancelar</Btn>
            <button type="submit" disabled={guardando} className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60">
              {guardando ? 'Programando…' : 'Programar'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        abierto={Boolean(porCancelar)}
        onCancelar={() => setPorCancelar(null)}
        onConfirmar={confirmarCancelar}
        cargando={cancelando}
        titulo="¿Cancelar esta programación?"
        descripcion="Solo se puede cancelar si todavía no se ha publicado."
        confirmarLabel="Cancelar programación"
      />
    </div>
  )
}
