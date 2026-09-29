import { createPortal } from 'react-dom'
import { useSlotsBarraSuperior } from '../../layout/slotsBarraSuperior.js'
import { ShieldCheck, RotateCcw, SlidersHorizontal, RefreshCw } from 'lucide-react'
import { AccesoRapidoDenso } from './AccesoRapidoDenso.jsx'
import { cn } from '../../lib/cn.js'
import bannerTerminal from '../../assets/banner-terminal.png'
import { AvatarUsuario } from '../AvatarUsuario.jsx'

function saludo() {
  const hora = new Date().getHours()
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function DashboardHeader({
  usuario,
  accesos = [],
  personalizando,
  setPersonalizando,
  onRestablecer,
  onRefrescar,
  cargando = false,
}) {
  const { acciones: destinoAcciones, saludo: destinoSaludo } = useSlotsBarraSuperior()

  const hoyStr = new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date())

  const saludoNodo = (
    <div className="flex flex-wrap items-center gap-3 self-start px-1 py-1.5">
      <AvatarUsuario usuario={usuario} className="h-11 w-11 shadow-sm border-2 border-brand-500/30 shrink-0" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1
            className="whitespace-nowrap font-bold tracking-tight text-slate-900"
            style={{ fontSize: 'var(--ui-title-size)' }}
          >
            {saludo()}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 via-brand-600 to-slate-900">{usuario?.nombre?.trim().split(/\s+/)[0] || usuario?.nombre}</span>
          </h1>
          <span className="panel-mono inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-brand-700">
            <ShieldCheck className="h-3 w-3" />
            {usuario?.rol?.nombre || 'Panel Principal'}
          </span>
        </div>
        <p className="subtitulo whitespace-nowrap text-[11px] text-slate-500">
          Centro de Mando Operativo · <span className="capitalize">{hoyStr}</span>
        </p>
      </div>
    </div>
  )

  const botones = (
          <div className="flex items-center gap-1.5">
            {onRefrescar && (
              <button
                type="button"
                onClick={onRefrescar}
                disabled={cargando}
                title="Actualizar datos"
                aria-label="Actualizar datos del panel"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-linea)] bg-white p-0 text-[#333] transition hover:border-[var(--color-primario)] disabled:opacity-50"
              >
                <RefreshCw className={cn('h-4 w-4', cargando && 'animate-spin')} />
              </button>
            )}

            {personalizando && onRestablecer && (
              <button
                type="button"
                onClick={onRestablecer}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--color-linea)] bg-white px-4 text-sm font-medium text-[#333] transition hover:border-[var(--color-primario)]"
              >
                <RotateCcw className="h-3 w-3" />
                Restablecer
              </button>
            )}

            {setPersonalizando && (
              <button
                type="button"
                onClick={() => setPersonalizando((p) => !p)}
                className={cn(
                  'inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition',
                  personalizando
                    ? 'border-[var(--color-primario)] bg-[var(--color-primario)] text-white'
                    : 'border-[var(--color-linea)] bg-white text-[#333] hover:border-[var(--color-primario)]'
                )}
              >
                <SlidersHorizontal className="h-3 w-3" />
                {personalizando ? 'Listo' : 'Personalizar'}
              </button>
            )}
          </div>
  )

  return (
    <>
      {destinoSaludo ? createPortal(saludoNodo, destinoSaludo) : <div className="pb-3">{saludoNodo}</div>}
      {destinoAcciones && createPortal(botones, destinoAcciones)}
    </>
  )
}
