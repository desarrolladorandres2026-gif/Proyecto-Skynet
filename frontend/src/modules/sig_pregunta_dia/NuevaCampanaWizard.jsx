import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Rocket, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { sig } from '../../api/sig.js'
import { catalogosApi } from '../../api/catalogos.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import {
  Btn, Card, ErrorMsg, Field, Input, Select, Textarea, Switch,
  TablaWrap, Th, Td, EmptyState,
} from '../../components/ui.jsx'
import RecurrenciaSelector from '../../components/sig/RecurrenciaSelector.jsx'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

function parsearFechas(texto) {
  return (texto || '')
    .split(/[\n,]/)
    .map((f) => f.trim())
    .filter((f) => FECHA_RE.test(f))
}

const FORM_INICIAL = {
  nombre: '',
  descripcion: '',
  preguntasSeleccionadas: [],
  fechaInicio: '',
  fechaFin: '',
  horaPublicacion: '',
  recurrencia: { tipo: 'diaria', diasSemana: [], fechasPersonalizadasTexto: '' },
  fechasExcluidasTexto: '',
  modoAsignacion: 'secuencial',
  dirigida: false,
  dependencias: [],
  cargos: [],
}

// Formulario de una sola pantalla (no varios pasos) con vista previa antes
// de confirmar (sección 49 del encargo): elegir N preguntas + una
// recurrencia genera automáticamente toda la agenda, sin programar cada
// fecha a mano.
export default function NuevaCampanaWizard() {
  const navigate = useNavigate()
  const [form, setForm] = useState(FORM_INICIAL)
  const [error, setError] = useState('')

  const [previsualizando, setPrevisualizando] = useState(false)
  const [previsualizacion, setPrevisualizacion] = useState(null)
  const [programando, setProgramando] = useState(false)

  const { data } = useDatosConCache(
    'sig:nuevaCampana:preguntasYCatalogos',
    () => Promise.all([sig.banco.listar({ estado: 'activa' }), catalogosApi.obtener()])
      .then(([b, c]) => ({ preguntasActivas: b.preguntas, catalogos: c })),
    { ttlMs: 5 * 60_000 },
  )
  const preguntasActivas = data?.preguntasActivas || []
  const catalogos = data?.catalogos || { dependencias: [], cargos: [] }

  function alternarPregunta(id) {
    setForm((f) => ({
      ...f,
      preguntasSeleccionadas: f.preguntasSeleccionadas.includes(id)
        ? f.preguntasSeleccionadas.filter((p) => p !== id)
        : [...f.preguntasSeleccionadas, id],
    }))
    setPrevisualizacion(null)
  }

  function alternarMulti(campo, valor) {
    setForm((f) => {
      const lista = f[campo].includes(valor) ? f[campo].filter((v) => v !== valor) : [...f[campo], valor]
      return { ...f, [campo]: lista }
    })
  }

  function payloadBase() {
    return {
      preguntas: form.preguntasSeleccionadas,
      recurrencia: {
        tipo: form.recurrencia.tipo,
        diasSemana: form.recurrencia.diasSemana,
        fechasPersonalizadas: parsearFechas(form.recurrencia.fechasPersonalizadasTexto),
      },
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      fechasExcluidas: parsearFechas(form.fechasExcluidasTexto),
      horaPublicacion: form.horaPublicacion || undefined,
      modoAsignacion: form.modoAsignacion,
    }
  }

  async function previsualizar() {
    setPrevisualizando(true)
    setError('')
    try {
      const { previsualizacion: filas } = await sig.programacion.previsualizarCampana(payloadBase())
      setPrevisualizacion(filas)
    } catch (err) {
      setError(err.message)
      setPrevisualizacion(null)
    } finally {
      setPrevisualizando(false)
    }
  }

  function cambiarPreguntaFila(i, preguntaId) {
    setPrevisualizacion((filas) =>
      filas.map((f, idx) => {
        if (idx !== i) return f
        const pregunta = preguntasActivas.find((p) => p._id === preguntaId)
        return { ...f, preguntaId, enunciado: pregunta?.enunciado, componenteSig: pregunta?.componenteSig }
      })
    )
  }

  async function confirmarCampana() {
    if (!form.nombre.trim()) {
      setError('El nombre de la campaña es obligatorio')
      return
    }
    if (!previsualizacion?.length) {
      setError('Genera la vista previa antes de confirmar')
      return
    }

    setProgramando(true)
    setError('')
    try {
      const payload = {
        ...payloadBase(),
        nombre: form.nombre,
        descripcion: form.descripcion,
        audiencia: form.dirigida ? { todos: false, dependencias: form.dependencias, cargos: form.cargos } : { todos: true },
        asignacionManual: form.modoAsignacion === 'manual'
          ? previsualizacion.map((f) => ({ fecha: f.fecha, hora: f.hora, preguntaId: f.preguntaId }))
          : undefined,
      }
      const { campana } = await sig.programacion.crearCampana(payload)
      toast.success(`Campaña creada: ${campana.totalProgramaciones} preguntas programadas`)
      navigate('/sig/programacion/campanas')
    } catch (err) {
      setError(err.message)
    } finally {
      setProgramando(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-2.5">
        <Rocket className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">Nueva campaña SIG</h1>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <Card className="mb-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre de la campaña">
            <Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Field>
          <Field label="Descripción (opcional)">
            <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Field>
        </div>

        <Field label={`Preguntas del banco (${form.preguntasSeleccionadas.length} seleccionadas)`}>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            {preguntasActivas.map((p) => (
              <label key={p._id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.preguntasSeleccionadas.includes(p._id)}
                  onChange={() => alternarPregunta(p._id)}
                />
                <span>[{p.componenteSig}] {p.enunciado}</span>
              </label>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Fecha inicial">
            <Input type="date" required value={form.fechaInicio} onChange={(e) => { setForm({ ...form, fechaInicio: e.target.value }); setPrevisualizacion(null) }} />
          </Field>
          <Field label="Fecha final">
            <Input type="date" required min={form.fechaInicio || undefined} value={form.fechaFin} onChange={(e) => { setForm({ ...form, fechaFin: e.target.value }); setPrevisualizacion(null) }} />
          </Field>
          <Field label="Hora de publicación">
            <Input type="time" value={form.horaPublicacion} onChange={(e) => setForm({ ...form, horaPublicacion: e.target.value })} />
          </Field>
        </div>

        <RecurrenciaSelector
          recurrencia={form.recurrencia}
          onChange={(r) => { setForm({ ...form, recurrencia: r }); setPrevisualizacion(null) }}
        />

        <Field label="Fechas a excluir (opcional, una por línea: feriados, mantenimiento, etc.)">
          <Textarea
            rows={2}
            value={form.fechasExcluidasTexto}
            onChange={(e) => { setForm({ ...form, fechasExcluidasTexto: e.target.value }); setPrevisualizacion(null) }}
          />
        </Field>

        <Field label="Orden de las preguntas">
          <Select value={form.modoAsignacion} onChange={(e) => { setForm({ ...form, modoAsignacion: e.target.value }); setPrevisualizacion(null) }}>
            <option value="secuencial">Automático (respeta el orden en que se seleccionaron)</option>
            <option value="aleatoria">Aleatorio (sin repetir en fechas consecutivas)</option>
            <option value="manual">Manual (elijo la pregunta de cada fecha en la vista previa)</option>
          </Select>
        </Field>

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

        <Btn
          variante="secundario"
          className="flex items-center gap-1.5"
          disabled={previsualizando || !form.preguntasSeleccionadas.length || !form.fechaInicio || !form.fechaFin}
          onClick={previsualizar}
        >
          <Eye className="h-4 w-4" aria-hidden="true" /> {previsualizando ? 'Calculando…' : 'Vista previa'}
        </Btn>
      </Card>

      {previsualizacion && (
        <Card className="mb-4">
          <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-200">
            {previsualizacion.length} publicaciones se van a programar
          </p>
          {previsualizacion.length === 0 ? (
            <EmptyState mensaje="Esa combinación de frecuencia y fechas no genera ninguna publicación" />
          ) : (
            <TablaWrap>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Hora</Th>
                  <Th>Pregunta</Th>
                </tr>
              </thead>
              <tbody>
                {previsualizacion.map((f, i) => (
                  <tr key={`${f.fecha}-${i}`}>
                    <Td className="whitespace-nowrap">{f.fecha}</Td>
                    <Td className="whitespace-nowrap">{f.hora}</Td>
                    <Td>
                      {form.modoAsignacion === 'manual' ? (
                        <Select value={f.preguntaId} onChange={(e) => cambiarPreguntaFila(i, e.target.value)} className="!py-1 text-xs">
                          {preguntasActivas
                            .filter((p) => form.preguntasSeleccionadas.includes(p._id))
                            .map((p) => (
                              <option key={p._id} value={p._id}>[{p.componenteSig}] {p.enunciado.slice(0, 50)}</option>
                            ))}
                        </Select>
                      ) : (
                        `[${f.componenteSig}] ${f.enunciado}`
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TablaWrap>
          )}
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Btn variante="secundario" onClick={() => navigate('/sig/programacion/campanas')}>Cancelar</Btn>
        <Btn disabled={programando || !previsualizacion?.length} onClick={confirmarCampana}>
          {programando ? 'Programando…' : 'Programar campaña'}
        </Btn>
      </div>
    </div>
  )
}
