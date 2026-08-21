import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Brain, CircleCheck, CircleX, History } from 'lucide-react'
import { sig } from '../../api/sig.js'
import { Btn, Badge, Card, ErrorMsg, EmptyState, fmtFecha } from '../../components/ui.jsx'
import { cn } from '../../lib/cn.js'

const LETRAS = ['A', 'B', 'C', 'D']

// Una tarjeta por pregunta publicada hoy. La corrección NO se guarda en estado
// local: al responder, la página recarga el día entero y el backend devuelve
// `yaRespondida` + `miRespuesta` (con su retroalimentación) ya resueltos. Así
// la tarjeta se pinta igual si acabas de responder o si vuelves a entrar
// mañana, sin dos caminos distintos que mantener sincronizados.
function TarjetaPregunta({ pregunta, indice, total, seleccion, onSeleccionar, onResponder, enviando }) {
  const { yaRespondida, miRespuesta } = pregunta
  const opcionElegida = miRespuesta?.opcionIndice

  return (
    <Card className="animate-fade-in">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {total > 1 && (
            <span className="panel-mono rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {indice + 1}/{total}
            </span>
          )}
          <Badge valor={pregunta.componenteSig} label={pregunta.componenteSig} />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">{fmtFecha(pregunta.fechaProgramada)}</span>
      </div>

      {pregunta.tema && (
        <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {pregunta.tema}
        </p>
      )}
      <p className="mb-4 text-base font-medium text-slate-900 dark:text-white">{pregunta.enunciado}</p>

      <div className="space-y-2">
        {pregunta.opciones.map((o, i) => {
          const esSeleccionada = yaRespondida ? opcionElegida === i : seleccion === i
          const mostrarComoCorrecta = yaRespondida && o.esCorrecta
          const mostrarComoIncorrectaElegida = yaRespondida && esSeleccionada && !o.esCorrecta
          return (
            <button
              key={i}
              type="button"
              disabled={yaRespondida}
              onClick={() => onSeleccionar(i)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                'disabled:cursor-default',
                mostrarComoCorrecta && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
                mostrarComoIncorrectaElegida && 'border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-300',
                !yaRespondida && esSeleccionada && 'border-cyan-500/60 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300',
                !yaRespondida && !esSeleccionada && 'border-slate-200 hover:border-cyan-500/40 hover:bg-cyan-500/5 dark:border-slate-700'
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {LETRAS[i]}
              </span>
              <span className="flex-1">{o.texto}</span>
              {mostrarComoCorrecta && <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
              {mostrarComoIncorrectaElegida && <CircleX className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      {!yaRespondida && (
        <Btn className="mt-4 w-full" disabled={seleccion === undefined || enviando} onClick={onResponder}>
          {enviando ? 'Enviando…' : 'Responder'}
        </Btn>
      )}

      {yaRespondida && (
        <div
          className={cn(
            'mt-4 rounded-xl border px-3 py-3 text-sm',
            miRespuesta?.esCorrecta
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300'
          )}
        >
          <p className="font-semibold">{miRespuesta?.esCorrecta ? '✅ Respuesta correcta' : '❌ Respuesta incorrecta'}</p>
          {miRespuesta?.retroalimentacion && <p className="mt-1 text-sm opacity-90">{miRespuesta.retroalimentacion}</p>}
        </div>
      )}
    </Card>
  )
}

// Pantalla principal del trabajador (ver sección 6 del encargo del módulo). El
// mismo componente se renderiza dentro del shell móvil "social-app" y del
// panel denso de escritorio (App.jsx no bifurca por shell, ver AppShell.jsx) —
// por eso usa las primitivas universales de components/ui.jsx, sin nada
// específico de un solo shell.
export default function PreguntaDelDiaPage() {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  // Selección pendiente por programación: { [programacionId]: indiceOpcion }.
  const [seleccion, setSeleccion] = useState({})
  const [enviandoId, setEnviandoId] = useState(null)
  const [progreso, setProgreso] = useState(null)

  async function cargar() {
    setCargando(true)
    try {
      const [dia, miProgreso] = await Promise.all([sig.preguntaDelDia(), sig.miProgreso()])
      setData(dia)
      setProgreso(miProgreso)
      setSeleccion({})
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

  async function responder(programacionId) {
    const indice = seleccion[programacionId]
    if (indice === undefined) return
    setEnviandoId(programacionId)
    setError('')
    try {
      await sig.responder(programacionId, indice)
      // Se recarga el día completo en vez de parchear la tarjeta en memoria:
      // el backend es la única fuente de la corrección y de la
      // retroalimentación, y así también se refleja cualquier otra pregunta
      // que se haya publicado mientras la pantalla estaba abierta.
      setData(await sig.preguntaDelDia())
      sig.miProgreso().then(setProgreso).catch(() => {})
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviandoId(null)
    }
  }

  if (cargando) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>Cargando…</Card>
      </div>
    )
  }

  const encabezado = (
    <div className="mb-4 flex items-center justify-between gap-2.5">
      <div className="flex items-center gap-2.5">
        <Brain className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Cuestionario Programado</h1>
      </div>
      <Link
        to="/sig/mi-historial"
        className="flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-400"
      >
        <History className="h-3.5 w-3.5" aria-hidden="true" /> Mi historial
      </Link>
    </div>
  )

  if (!data?.disponible) {
    return (
      <div className="mx-auto max-w-lg">
        {encabezado}
        <EmptyState mensaje="No hay un Cuestionario Programado para hoy." />
      </div>
    )
  }

  // `preguntas` es la forma actual del endpoint. El respaldo a la forma
  // singular cubre la ventana de despliegue en que este frontend ya está
  // servido pero el backend todavía no: sin él, la pantalla saldría vacía.
  const preguntas = data.preguntas?.length
    ? data.preguntas
    : data.programacion
      ? [{ ...data.programacion, yaRespondida: data.yaRespondida, miRespuesta: data.miRespuesta }]
      : []

  const pendientes = preguntas.filter((p) => !p.yaRespondida).length
  const respondidas = preguntas.length - pendientes

  return (
    <div className="mx-auto max-w-lg">
      {encabezado}

      <ErrorMsg>{error}</ErrorMsg>

      {preguntas.length > 1 && (
        <Card className="mb-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {pendientes === 0
                ? '¡Listo! Respondiste todas las preguntas de hoy'
                : `Tienes ${pendientes} pregunta${pendientes === 1 ? '' : 's'} por responder hoy`}
            </span>
            <span className="panel-mono text-xs text-slate-500 dark:text-slate-400">
              {respondidas}/{preguntas.length}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            role="progressbar"
            aria-valuenow={respondidas}
            aria-valuemin={0}
            aria-valuemax={preguntas.length}
            aria-label="Preguntas respondidas hoy"
          >
            <div
              className="h-full rounded-full bg-cyan-600 transition-all dark:bg-cyan-500"
              style={{ width: `${(respondidas / preguntas.length) * 100}%` }}
            />
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {preguntas.map((pregunta, i) => (
          <TarjetaPregunta
            key={pregunta._id}
            pregunta={pregunta}
            indice={i}
            total={preguntas.length}
            seleccion={seleccion[pregunta._id]}
            enviando={enviandoId === pregunta._id}
            onSeleccionar={(indice) => setSeleccion((s) => ({ ...s, [pregunta._id]: indice }))}
            onResponder={() => responder(pregunta._id)}
          />
        ))}
      </div>

      {progreso && progreso.total > 0 && (
        <Card className="mt-4">
          <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Tu progreso</p>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {progreso.correctas} de {progreso.total} correctas ({progreso.porcentajeAcierto}%)
            {progreso.nivel && (
              <> · Nivel <span style={{ color: progreso.nivel.color }} className="font-semibold">{progreso.nivel.nombre}</span></>
            )}
          </p>
        </Card>
      )}
    </div>
  )
}
