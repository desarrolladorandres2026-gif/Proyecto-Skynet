import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Plus, Ban, X, Search } from 'lucide-react'
import { toast } from 'sonner'
import { sig } from '../../api/sig.js'
import { catalogosApi } from '../../api/catalogos.js'
import {
  Btn, Badge, Card, ErrorMsg, Field, Input, Switch, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFecha, fmtFechaHora,
} from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'

// `seleccionadas` es una lista de { preguntaId, hora } y no un simple array de
// ids: cada pregunta del día puede publicarse a su propia hora (una en la
// entrada de turno, otra después del almuerzo), y si se deja vacía hereda la
// hora general del formulario.
const FORM_VACIO = { fecha: '', hora: '', dirigida: false, dependencias: [], cargos: [], seleccionadas: [] }

// Mismo aspecto que <Field>, pero con un <div> en vez de un <label>. Un
// <label> se asocia con el PRIMER control enfocable que contenga, así que
// envolver con él un grupo de varias casillas (o un buscador seguido de
// casillas) hace que hacer clic en cualquier parte del grupo enfoque ese
// primer control en vez de actuar sobre lo que se tocó. <label> queda para su
// caso propio: un rótulo, un control.
function GrupoCampos({ rotulo, children }) {
  return (
    <div className="block">
      <span className="panel-mono mb-1.5 block text-[11px] tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">
        {rotulo}
      </span>
      {children}
    </div>
  )
}

export default function ProgramacionesPage() {
  const [programaciones, setProgramaciones] = useState([])
  const [preguntasActivas, setPreguntasActivas] = useState([])
  const [catalogos, setCatalogos] = useState({ dependencias: [], cargos: [] })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [busqueda, setBusqueda] = useState('')
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

  // La lista viene ordenada por fecha de publicación desde el backend; aquí se
  // parte en bloques por día para que se vea de un golpe cuántas preguntas
  // tiene cada jornada, que es justo lo que cambia al poder programar varias.
  const porDia = useMemo(() => {
    const grupos = new Map()
    for (const p of programaciones) {
      const clave = String(p.fechaProgramada).slice(0, 10)
      if (!grupos.has(clave)) grupos.set(clave, { fecha: p.fechaProgramada, items: [] })
      grupos.get(clave).items.push(p)
    }
    return [...grupos.values()]
  }, [programaciones])

  const preguntasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return preguntasActivas
    return preguntasActivas.filter(
      (p) =>
        p.enunciado.toLowerCase().includes(texto) ||
        p.componenteSig?.toLowerCase().includes(texto) ||
        p.tema?.toLowerCase().includes(texto)
    )
  }, [preguntasActivas, busqueda])

  const seleccionadasDetalle = form.seleccionadas
    .map((s) => ({ ...s, pregunta: preguntasActivas.find((p) => p._id === s.preguntaId) }))
    .filter((s) => s.pregunta)

  function abrirNueva() {
    setForm(FORM_VACIO)
    setBusqueda('')
    setErrorForm('')
    setModalAbierto(true)
  }

  function alternarPregunta(preguntaId) {
    setForm((f) => {
      const yaEsta = f.seleccionadas.some((s) => s.preguntaId === preguntaId)
      return {
        ...f,
        seleccionadas: yaEsta
          ? f.seleccionadas.filter((s) => s.preguntaId !== preguntaId)
          : [...f.seleccionadas, { preguntaId, hora: '' }],
      }
    })
  }

  function cambiarHoraDe(preguntaId, hora) {
    setForm((f) => ({
      ...f,
      seleccionadas: f.seleccionadas.map((s) => (s.preguntaId === preguntaId ? { ...s, hora } : s)),
    }))
  }

  async function guardar(e) {
    e.preventDefault()
    if (!form.seleccionadas.length) {
      setErrorForm('Elige al menos una pregunta')
      return
    }
    setGuardando(true)
    setErrorForm('')
    try {
      const { programaciones: creadas } = await sig.programacion.crearIndividual({
        preguntas: form.seleccionadas.map((s) => ({ preguntaId: s.preguntaId, hora: s.hora || undefined })),
        fecha: form.fecha,
        hora: form.hora || undefined,
        audiencia: form.dirigida
          ? { todos: false, dependencias: form.dependencias, cargos: form.cargos }
          : { todos: true },
      })
      toast.success(
        creadas.length === 1 ? 'Pregunta programada' : `${creadas.length} preguntas programadas para el mismo día`
      )
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
            <Plus className="h-4 w-4" aria-hidden="true" /> Programar preguntas
          </Btn>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : porDia.length === 0 ? (
        <EmptyState mensaje="No hay preguntas programadas todavía" />
      ) : (
        <div className="space-y-4">
          {porDia.map((dia) => (
            <div key={String(dia.fecha)}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <h2 className="panel-mono text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {fmtFecha(dia.fecha)}
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {dia.items.length} {dia.items.length === 1 ? 'pregunta' : 'preguntas'}
                </span>
              </div>
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
                  {dia.items.map((p) => (
                    <tr key={p._id}>
                      <Td className="max-w-sm">{p.pregunta?.enunciado || p.snapshotPregunta?.enunciado || '—'}</Td>
                      <Td>{p.pregunta?.componenteSig || p.snapshotPregunta?.componenteSig}</Td>
                      <Td className="whitespace-nowrap">{fmtFechaHora(p.fechaHoraPublicacion)}</Td>
                      <Td>
                        <Badge
                          valor={p.estado}
                          label={{ programada: 'Programada', publicada: 'Publicada', cancelada: 'Cancelada' }[p.estado]}
                        />
                      </Td>
                      <Td className="text-right">
                        {p.estado === 'programada' && (
                          <Btn
                            variante="fantasma"
                            className="flex items-center gap-1.5 !text-red-600 dark:!text-red-400"
                            onClick={() => setPorCancelar(p)}
                          >
                            <Ban className="h-4 w-4" aria-hidden="true" /> Cancelar
                          </Btn>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TablaWrap>
            </div>
          ))}
        </div>
      )}

      <Modal
        abierto={modalAbierto}
        titulo="Programar preguntas para un día"
        onCerrar={() => setModalAbierto(false)}
        ancho="max-w-2xl"
      >
        <form onSubmit={guardar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>

          <GrupoCampos rotulo={`Preguntas del banco (${form.seleccionadas.length} seleccionada${form.seleccionadas.length === 1 ? '' : 's'})`}>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                className="!pl-8"
                placeholder="Buscar por enunciado, componente o tema…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              {preguntasFiltradas.length === 0 ? (
                <p className="px-1 py-2 text-sm text-slate-500 dark:text-slate-400">
                  No hay preguntas activas que coincidan.
                </p>
              ) : (
                preguntasFiltradas.map((p) => (
                  <label
                    key={p._id}
                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-cyan-500/5 dark:text-slate-200"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.seleccionadas.some((s) => s.preguntaId === p._id)}
                      onChange={() => alternarPregunta(p._id)}
                    />
                    <span className="flex-1">
                      <span className="text-[11px] font-semibold tracking-wide text-cyan-700 uppercase dark:text-cyan-400">
                        {p.componenteSig}
                      </span>{' '}
                      {p.enunciado}
                    </span>
                  </label>
                ))
              )}
            </div>
          </GrupoCampos>

          {seleccionadasDetalle.length > 0 && (
            <GrupoCampos rotulo="Orden y hora de cada una (opcional)">
              <div className="space-y-1.5 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                {seleccionadasDetalle.map((s, i) => (
                  <div key={s.preguntaId} className="flex items-center gap-2">
                    <span className="panel-mono w-5 shrink-0 text-xs text-slate-400">{i + 1}.</span>
                    <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200" title={s.pregunta.enunciado}>
                      {s.pregunta.enunciado}
                    </span>
                    <Input
                      type="time"
                      className="!w-32 shrink-0"
                      value={s.hora}
                      aria-label={`Hora de publicación de: ${s.pregunta.enunciado.slice(0, 40)}`}
                      onChange={(e) => cambiarHoraDe(s.preguntaId, e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label="Quitar de la selección"
                      className="shrink-0 rounded p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      onClick={() => alternarPregunta(s.preguntaId)}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </GrupoCampos>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha de publicación">
              <Input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
            <Field label="Hora para las que no tengan una propia">
              <Input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
            <span className="text-sm text-slate-700 dark:text-slate-200">Dirigir a un área o cargo específico</span>
            <Switch checked={form.dirigida} onChange={(v) => setForm({ ...form, dirigida: v })} label="Dirigir a un área o cargo específico" />
          </div>

          {form.dirigida && (
            <div className="grid gap-4 sm:grid-cols-2">
              <GrupoCampos rotulo="Dependencias">
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  {catalogos.dependencias.map((d) => (
                    <label key={d._id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={form.dependencias.includes(d.nombre)} onChange={() => alternarMulti('dependencias', d.nombre)} />
                      {d.nombre}
                    </label>
                  ))}
                </div>
              </GrupoCampos>
              <GrupoCampos rotulo="Cargos">
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  {catalogos.cargos.map((c) => (
                    <label key={c._id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={form.cargos.includes(c.nombre)} onChange={() => alternarMulti('cargos', c.nombre)} />
                      {c.nombre}
                    </label>
                  ))}
                </div>
              </GrupoCampos>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalAbierto(false)}>Cancelar</Btn>
            <button
              type="submit"
              disabled={guardando || form.seleccionadas.length === 0}
              className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60"
            >
              {guardando
                ? 'Programando…'
                : form.seleccionadas.length > 1
                  ? `Programar ${form.seleccionadas.length} preguntas`
                  : 'Programar'}
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
