import { useEffect, useState } from 'react'
import { Modal, Field, Input, Select, Textarea, Btn, ErrorMsg } from '../../components/ui.jsx'

const OPCIONES_VACIAS = [
  { texto: '', esCorrecta: true },
  { texto: '', esCorrecta: false },
  { texto: '', esCorrecta: false },
  { texto: '', esCorrecta: false },
]

const FORM_VACIO = {
  enunciado: '',
  componenteSig: '',
  tema: '',
  opciones: OPCIONES_VACIAS,
  retroalimentacion: { correcta: '', incorrecta: '' },
  etiquetas: '',
}

function aFormulario(pregunta) {
  if (!pregunta) return FORM_VACIO
  return {
    enunciado: pregunta.enunciado,
    componenteSig: pregunta.componenteSig,
    tema: pregunta.tema,
    opciones: pregunta.opciones.map((o) => ({ texto: o.texto, esCorrecta: o.esCorrecta })),
    retroalimentacion: {
      correcta: pregunta.retroalimentacion?.correcta || '',
      incorrecta: pregunta.retroalimentacion?.incorrecta || '',
    },
    etiquetas: (pregunta.etiquetas || []).join(', '),
  }
}

// Crear/editar una pregunta del banco. Las 4 opciones son de ancho fijo (A,
// B, C, D) con radio buttons para marcar cuál es la correcta — selección
// única, no checkbox.
export default function FormularioPreguntaModal({ abierto, pregunta, componentes, temasSugeridos = [], onCerrar, onGuardar }) {
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (abierto) {
      setForm(aFormulario(pregunta))
      setError('')
    }
  }, [abierto, pregunta])

  function cambiarOpcionTexto(i, texto) {
    setForm((f) => ({ ...f, opciones: f.opciones.map((o, idx) => (idx === i ? { ...o, texto } : o)) }))
  }

  function marcarCorrecta(i) {
    setForm((f) => ({ ...f, opciones: f.opciones.map((o, idx) => ({ ...o, esCorrecta: idx === i })) }))
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const datos = {
        enunciado: form.enunciado,
        componenteSig: form.componenteSig,
        tema: form.tema,
        opciones: form.opciones,
        retroalimentacion: form.retroalimentacion,
        etiquetas: form.etiquetas.split(',').map((t) => t.trim()).filter(Boolean),
      }
      await onGuardar(datos)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const letras = ['A', 'B', 'C', 'D']

  return (
    <Modal abierto={abierto} titulo={pregunta ? 'Editar pregunta' : 'Nueva pregunta'} onCerrar={onCerrar} ancho="max-w-2xl">
      <form onSubmit={guardar} className="space-y-4">
        <ErrorMsg>{error}</ErrorMsg>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Componente SIG">
            <Select
              required
              value={form.componenteSig}
              onChange={(e) => setForm({ ...form, componenteSig: e.target.value })}
            >
              <option value="" disabled>Selecciona un componente…</option>
              {componentes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tema">
            <Input
              required
              list="sig-temas-sugeridos"
              placeholder="ej: Uso de EPP en alturas"
              value={form.tema}
              onChange={(e) => setForm({ ...form, tema: e.target.value })}
            />
            <datalist id="sig-temas-sugeridos">
              {temasSugeridos.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
        </div>

        <Field label="Enunciado">
          <Textarea
            required
            rows={2}
            value={form.enunciado}
            onChange={(e) => setForm({ ...form, enunciado: e.target.value })}
          />
        </Field>

        <div className="space-y-2.5">
          <span className="panel-mono block text-[11px] tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">
            Opciones (marca la correcta)
          </span>
          {form.opciones.map((o, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <button
                type="button"
                role="radio"
                aria-checked={o.esCorrecta}
                aria-label={`Marcar opción ${letras[i]} como correcta`}
                onClick={() => marcarCorrecta(i)}
                className={
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ' +
                  (o.esCorrecta
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600')
                }
              >
                {letras[i]}
              </button>
              <Input
                required
                placeholder={`Texto de la opción ${letras[i]}`}
                value={o.texto}
                onChange={(e) => cambiarOpcionTexto(i, e.target.value)}
                className="flex-1"
              />
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Retroalimentación si acierta (opcional)">
            <Textarea
              rows={2}
              value={form.retroalimentacion.correcta}
              onChange={(e) => setForm({ ...form, retroalimentacion: { ...form.retroalimentacion, correcta: e.target.value } })}
            />
          </Field>
          <Field label="Retroalimentación si falla (opcional)">
            <Textarea
              rows={2}
              value={form.retroalimentacion.incorrecta}
              onChange={(e) => setForm({ ...form, retroalimentacion: { ...form.retroalimentacion, incorrecta: e.target.value } })}
            />
          </Field>
        </div>

        <Field label="Etiquetas separadas por coma (opcional)">
          <Input
            placeholder="ej: epp, alturas, señalización"
            value={form.etiquetas}
            onChange={(e) => setForm({ ...form, etiquetas: e.target.value })}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Btn variante="secundario" onClick={onCerrar}>Cancelar</Btn>
          <button type="submit" disabled={guardando} className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
