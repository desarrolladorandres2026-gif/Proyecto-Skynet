import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Brain, CircleCheck, CircleX, History } from 'lucide-react'
import { sig } from '../../api/sig.js'
import { Btn, Badge, Card, ErrorMsg, EmptyState, fmtFecha } from '../../components/ui.jsx'
import { cn } from '../../lib/cn.js'

const LETRAS = ['A', 'B', 'C', 'D']

// Pantalla principal del trabajador: la pregunta es el elemento único de la
// página, sin distracciones (ver sección 6 del encargo del módulo). El mismo
// componente se renderiza dentro del shell móvil "social-app" y del panel
// denso de escritorio (App.jsx no bifurca por shell, ver AppShell.jsx) — por
// eso usa las primitivas universales de components/ui.jsx, sin nada
// específico de un solo shell.
export default function PreguntaDelDiaPage() {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [seleccion, setSeleccion] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [progreso, setProgreso] = useState(null)

  async function cargar() {
    setCargando(true)
    try {
      const [pregunta, miProgreso] = await Promise.all([sig.preguntaDelDia(), sig.miProgreso()])
      setData(pregunta)
      setProgreso(miProgreso)
      setSeleccion(null)
      setResultado(null)
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

  async function responder() {
    if (seleccion === null || !data?.programacion) return
    setEnviando(true)
    setError('')
    try {
      const r = await sig.responder(data.programacion._id, seleccion)
      setResultado(r)
      const actualizado = await sig.preguntaDelDia()
      setData(actualizado)
      sig.miProgreso().then(setProgreso).catch(() => {})
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>Cargando…</Card>
      </div>
    )
  }

  if (!data?.disponible) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="mb-4 flex items-center gap-2.5">
          <Brain className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Cuestionario Programado</h1>
        </div>
        <EmptyState mensaje="No hay un Cuestionario Programado para hoy." />
      </div>
    )
  }

  const { programacion, yaRespondida, miRespuesta } = data
  // Tras responder, las opciones traen esCorrecta; antes de responder, no.
  const seCorrigioYa = yaRespondida || Boolean(resultado)
  const esCorrectaFinal = resultado ? resultado.esCorrecta : miRespuesta?.esCorrecta
  const opcionElegida = resultado ? seleccion : miRespuesta?.opcionIndice
  const retroTexto = resultado ? resultado.retroalimentacion : miRespuesta?.retroalimentacion

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <Brain className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Cuestionario Programado</h1>
        </div>
        <Link to="/sig/mi-historial" className="flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-400">
          <History className="h-3.5 w-3.5" aria-hidden="true" /> Mi historial
        </Link>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <Card className="animate-fade-in">
        <div className="mb-3 flex items-center justify-between">
          <Badge valor={programacion.componenteSig} label={programacion.componenteSig} />
          <span className="text-xs text-slate-500 dark:text-slate-400">{fmtFecha(programacion.fechaProgramada)}</span>
        </div>

        {programacion.tema && (
          <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{programacion.tema}</p>
        )}
        <p className="mb-4 text-base font-medium text-slate-900 dark:text-white">{programacion.enunciado}</p>

        <div className="space-y-2">
          {programacion.opciones.map((o, i) => {
            const esSeleccionada = seCorrigioYa ? opcionElegida === i : seleccion === i
            const mostrarComoCorrecta = seCorrigioYa && o.esCorrecta
            const mostrarComoIncorrectaElegida = seCorrigioYa && esSeleccionada && !o.esCorrecta
            return (
              <button
                key={i}
                type="button"
                disabled={seCorrigioYa}
                onClick={() => setSeleccion(i)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                  'disabled:cursor-default',
                  mostrarComoCorrecta && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
                  mostrarComoIncorrectaElegida && 'border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-300',
                  !seCorrigioYa && esSeleccionada && 'border-cyan-500/60 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300',
                  !seCorrigioYa && !esSeleccionada && 'border-slate-200 hover:border-cyan-500/40 hover:bg-cyan-500/5 dark:border-slate-700'
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

        {!seCorrigioYa && (
          <Btn className="mt-4 w-full" disabled={seleccion === null || enviando} onClick={responder}>
            {enviando ? 'Enviando…' : 'Responder'}
          </Btn>
        )}

        {seCorrigioYa && (
          <div
            className={cn(
              'mt-4 rounded-xl border px-3 py-3 text-sm',
              esCorrectaFinal
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300'
            )}
          >
            <p className="font-semibold">{esCorrectaFinal ? '✅ Respuesta correcta' : '❌ Respuesta incorrecta'}</p>
            {retroTexto && <p className="mt-1 text-sm opacity-90">{retroTexto}</p>}
          </div>
        )}
      </Card>

      {progreso && progreso.total > 0 && (
        <Card className="mt-4">
          <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Tu progreso</p>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {progreso.correctas} de {progreso.total} correctas ({progreso.porcentajeAcierto}%)
            {progreso.nivel && <> · Nivel <span style={{ color: progreso.nivel.color }} className="font-semibold">{progreso.nivel.nombre}</span></>}
          </p>
        </Card>
      )}
    </div>
  )
}
