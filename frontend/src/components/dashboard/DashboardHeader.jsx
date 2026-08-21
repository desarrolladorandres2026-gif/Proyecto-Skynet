import { ShieldCheck, AlertTriangle, CheckCircle2, RotateCcw, SlidersHorizontal, RefreshCw } from 'lucide-react'
import { AccesoRapidoDenso } from './AccesoRapidoDenso.jsx'
import { cn } from '../../lib/cn.js'

function saludo() {
  const hora = new Date().getHours()
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function getSaludColor(salud = 100) {
  if (salud >= 90) return { texto: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'Operación Estable', icono: CheckCircle2 }
  if (salud >= 75) return { texto: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-500/10 border-amber-500/30', label: 'Atención Requerida', icono: AlertTriangle }
  return { texto: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-500/10 border-rose-500/30', label: 'Crítico / Alertas', icono: AlertTriangle }
}

export function DashboardHeader({
  usuario,
  salud = 95,
  accesos = [],
  personalizando,
  setPersonalizando,
  onRestablecer,
  onRefrescar,
  cargando = false,
}) {
  const saludInfo = getSaludColor(salud)
  const SaludIcon = saludInfo.icono
  const hoyStr = new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date())

  return (
    <div className="relative overflow-hidden rounded-xl border border-brand-500/20 bg-gradient-to-br from-brand-50/70 via-white to-slate-50 p-3.5 shadow-soft-md backdrop-blur-md dark:border-brand-400/20 dark:from-brand-950/40 dark:via-slate-900/60 dark:to-slate-950/80">
      {/* Luz ambiental sutil */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-brand-500/10 blur-3xl" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Lado izquierdo: Saludo e identidad */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1
                className="font-bold tracking-tight text-slate-900 dark:text-white"
                style={{ fontSize: 'var(--ui-title-size)' }}
              >
                {saludo()}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 via-cyan-600 to-slate-900 dark:from-brand-300 dark:via-cyan-200 dark:to-white">{usuario?.nombre?.trim().split(/\s+/)[0] || usuario?.nombre}</span>
              </h1>
              <span className="panel-mono inline-flex items-center gap-1 rounded-md bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-400/30 dark:bg-brand-500/15 dark:text-brand-300">
                <ShieldCheck className="h-3 w-3" />
                {usuario?.rol?.nombre || 'Panel Principal'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Centro de Mando Operativo · <span className="capitalize">{hoyStr}</span>
            </p>
          </div>
        </div>

        {/* Lado derecho: Medidor de Salud + Controles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Badge de Salud Operativa */}
          <div className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-1 backdrop-blur-sm', saludInfo.bg)}>
            <div className="relative flex h-7 w-7 items-center justify-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-200 dark:text-slate-700/60"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={cn('transition-all duration-1000 ease-out', saludInfo.texto)}
                  strokeDasharray={`${salud}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="panel-mono absolute text-[10px] font-bold text-slate-900 dark:text-white">{salud}%</span>
            </div>
            <div className="hidden xs:block">
              <p className="panel-mono text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Salud</p>
              <p className={cn('flex items-center gap-1 text-[11px] font-semibold leading-none', saludInfo.texto)}>
                <SaludIcon className="h-3 w-3" />
                {saludInfo.label}
              </p>
            </div>
          </div>

          {/* Atajos rápidos en línea si existen */}
          {accesos.length > 0 && (
            <div className="hidden md:flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-2">
              {accesos.slice(0, 3).map((a) => (
                <AccesoRapidoDenso key={a.to} icon={a.icon} label={a.label} to={a.to} />
              ))}
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex items-center gap-1.5">
            {onRefrescar && (
              <button
                type="button"
                onClick={onRefrescar}
                disabled={cargando}
                title="Actualizar datos"
                aria-label="Actualizar datos del panel"
                className="panel-btn-secundario inline-flex h-8 w-8 items-center justify-center rounded-lg p-0 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-all disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', cargando && 'animate-spin')} />
              </button>
            )}

            {personalizando && onRestablecer && (
              <button
                type="button"
                onClick={onRestablecer}
                className="panel-btn-fantasma inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
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
                  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
                  personalizando ? 'panel-btn-primario' : 'panel-btn-secundario'
                )}
              >
                <SlidersHorizontal className="h-3 w-3" />
                {personalizando ? 'Listo' : 'Personalizar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
