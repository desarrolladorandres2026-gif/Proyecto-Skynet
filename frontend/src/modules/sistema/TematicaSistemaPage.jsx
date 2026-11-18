import { useState } from 'react'
import { Check, Palette } from 'lucide-react'
import { tematicaApi } from '../../api/tematica.js'
import { Card, ErrorMsg, OkMsg } from '../../components/ui.jsx'
import { cn } from '../../lib/cn.js'
import { TEMATICAS_ACTIVAS } from '../../tematicas/config.js'
import { enTemporada } from '../../tematicas/seleccion.js'
import { fijarModoTematica, useTematica } from '../../tematicas/useTematica.js'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = ([mes, dia]) => `${dia} ${MESES[mes - 1]}`

// Sistema → Temática: la temática visual que ven TODOS los usuarios.
export default function TematicaSistemaPage() {
  const { tematica, modo, opciones } = useTematica()
  const [guardando, setGuardando] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  // Una preferencia que ya no existe en el registro se comporta como 'auto'.
  const modoEfectivo = modo === 'ninguna' || opciones.some((t) => t.id === modo) ? modo : 'auto'

  async function elegir(nuevo, etiqueta) {
    if (nuevo === modoEfectivo || guardando) return
    setGuardando(nuevo)
    setError('')
    setOk('')
    try {
      const { modo: guardado } = await tematicaApi.cambiar(nuevo)
      fijarModoTematica(guardado)
      setOk(`Temática del sistema: ${etiqueta}. Los demás usuarios la verán al volver a abrir o enfocar la pestaña.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(null)
    }
  }

  const tarjetas = [
    {
      id: 'auto',
      emoji: '✨',
      nombre: 'Automática',
      detalle: tematica
        ? `Según la fecha. Hoy corresponde: ${tematica.nombre}.`
        : 'Según la fecha. Hoy no hay ninguna temporada vigente.',
    },
    ...opciones.map((t) => ({
      id: t.id,
      emoji: t.emoji,
      nombre: t.nombre,
      detalle: t.temporada
        ? `Temporada: ${fmt(t.temporada.desde)} – ${fmt(t.temporada.hasta)}${enTemporada(t) ? ' (vigente ahora)' : ''}. Elegida a mano se muestra siempre.`
        : 'Se muestra siempre que esté elegida.',
    })),
    { id: 'ninguna', emoji: '🚫', nombre: 'Sin temática', detalle: 'El sistema se ve sin ninguna decoración.' },
  ]

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Palette className="h-6 w-6 text-brand-700 dark:text-brand-400" aria-hidden="true" />
        <div>
          <h1 className="panel-mono text-xl font-semibold tracking-wide text-slate-900 dark:text-white">Temática del sistema</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Decoración estacional (luces, adornos, escena de Inicio y frases) igual para todos los usuarios.
          </p>
        </div>
      </div>

      {!TEMATICAS_ACTIVAS && (
        <ErrorMsg>
          Las temáticas están desactivadas en el código (TEMATICAS_ACTIVAS = false en tematicas/config.js):
          nadie verá decoración aunque elijas una aquí.
        </ErrorMsg>
      )}
      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Temática del sistema">
        {tarjetas.map((t) => {
          const activa = t.id === modoEfectivo
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={activa}
              disabled={Boolean(guardando)}
              onClick={() => elegir(t.id, t.nombre)}
              className="text-left"
            >
              <Card className={cn('h-full transition-all', activa ? 'ring-2 ring-brand-500' : 'hover:shadow-soft-md')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl leading-none" aria-hidden="true">{t.emoji}</span>
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.nombre}</h2>
                  </div>
                  {activa && <Check className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" aria-label="Elegida" />}
                </div>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {guardando === t.id ? 'Guardando…' : t.detalle}
                </p>
              </Card>
            </button>
          )
        })}
      </div>
    </div>
  )
}
