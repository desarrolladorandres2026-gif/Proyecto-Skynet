// Overlay de controles que aparece sobre cada StatCard en modo "Personalizar"
// (ver usePersonalizacionDashboard.js). Botones nativos en vez de
// drag-and-drop: en una grilla (no una lista) el drag de framer-motion
// Reorder solo mide bien un eje, así que el resultado visual no coincide con
// la intención del usuario — mover a izquierda/derecha por clic es más
// predecible y no agrega una librería nueva.
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { cn } from '../../lib/cn.js'

export function ControlesTarjeta({ oculta, puedeMoverIzquierda, puedeMoverDerecha, onMoverIzquierda, onMoverDerecha, onAlternarOculta }) {
  return (
    <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-1 rounded-t-xl bg-slate-900/70 p-1.5 backdrop-blur-sm dark:bg-black/60">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onMoverIzquierda}
          disabled={!puedeMoverIzquierda}
          className="rounded-md p-1 text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Mover antes"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onMoverDerecha}
          disabled={!puedeMoverDerecha}
          className="rounded-md p-1 text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Mover después"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        onClick={onAlternarOculta}
        className={cn('rounded-md p-1 text-white/80 hover:bg-white/15 hover:text-white', oculta && 'text-amber-300')}
        aria-label={oculta ? 'Mostrar tarjeta' : 'Ocultar tarjeta'}
        title={oculta ? 'Mostrar tarjeta' : 'Ocultar tarjeta'}
      >
        {oculta ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
    </div>
  )
}
