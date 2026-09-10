import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, AlertTriangle, CheckCircle, Info, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn.js'

const ESTILOS_TIPO = {
  critico: {
    borde: 'border-rose-200 hover:border-rose-300 dark:border-rose-500/30 dark:hover:border-rose-500/50',
    bg: 'bg-rose-50/70 dark:bg-rose-950/30',
    icono: AlertCircle,
    colorIcono: 'text-rose-600 dark:text-rose-400',
    badge: 'bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300',
    btn: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/20',
  },
  advertencia: {
    borde: 'border-warn-200 hover:border-warn-300 dark:border-warn-500/30 dark:hover:border-warn-500/50',
    bg: 'bg-warn-50/70 dark:bg-warn-950/30',
    icono: AlertTriangle,
    colorIcono: 'text-warn-600 dark:text-warn-400',
    badge: 'bg-warn-500/10 text-warn-700 border-warn-500/20 dark:text-warn-300',
    btn: 'bg-warn-600 hover:bg-warn-500 text-white shadow-warn-900/20',
  },
  optimizacion: {
    borde: 'border-accent-200 hover:border-accent-300 dark:border-accent-500/30 dark:hover:border-accent-500/50',
    bg: 'bg-accent-50/70 dark:bg-accent-950/30',
    icono: CheckCircle,
    colorIcono: 'text-accent-600 dark:text-accent-400',
    badge: 'bg-accent-500/10 text-accent-700 border-accent-500/20 dark:text-accent-300',
    btn: 'bg-accent-600 hover:bg-accent-500 text-white shadow-accent-900/20',
  },
  informativo: {
    borde: 'border-brand-200 hover:border-brand-300 dark:border-brand-500/30 dark:hover:border-brand-500/50',
    bg: 'bg-brand-50/70 dark:bg-brand-950/30',
    icono: Info,
    colorIcono: 'text-brand-600 dark:text-brand-400',
    badge: 'bg-brand-500/10 text-brand-700 border-brand-500/20 dark:text-brand-300',
    btn: 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-900/20',
  },
}

export function AnalisisRecomendaciones({ recomendaciones = [], className = '' }) {
  const [filtro, setFiltro] = useState('todos')

  if (!recomendaciones || recomendaciones.length === 0) return null

  const filtradas = filtro === 'todos'
    ? recomendaciones
    : recomendaciones.filter((r) => r.tipo === filtro)

  const conteoCritico = recomendaciones.filter((r) => r.tipo === 'critico').length
  const conteoAdvertencia = recomendaciones.filter((r) => r.tipo === 'advertencia').length

  return (
    <div className={cn('flex flex-col rounded-xl border border-slate-200 bg-white/95 p-4 shadow-soft-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/70 w-full', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            Análisis & Recomendaciones
            <span className="panel-mono text-[10px] font-semibold text-brand-700 dark:text-brand-300">
              {recomendaciones.length}
            </span>
          </h2>
        </div>

        {/* Filtros rápidos */}
        <div className="flex flex-wrap gap-1 text-xs">
          <button
            type="button"
            onClick={() => setFiltro('todos')}
            className={cn(
              'rounded-md px-2 py-0.5 font-medium transition-all',
              filtro === 'todos' ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            Todos ({recomendaciones.length})
          </button>
          {conteoCritico > 0 && (
            <button
              type="button"
              onClick={() => setFiltro('critico')}
              className={cn(
                'rounded-md px-2 py-0.5 font-medium transition-all flex items-center gap-1',
                filtro === 'critico' ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 dark:bg-rose-400 animate-pulse" />
              Críticos ({conteoCritico})
            </button>
          )}
          {conteoAdvertencia > 0 && (
            <button
              type="button"
              onClick={() => setFiltro('advertencia')}
              className={cn(
                'rounded-md px-2 py-0.5 font-medium transition-all',
                filtro === 'advertencia' ? 'bg-warn-600 text-white' : 'text-warn-600 hover:bg-warn-50 dark:text-warn-400 dark:hover:bg-warn-950/40'
              )}
            >
              Advertencias ({conteoAdvertencia})
            </button>
          )}
        </div>
      </div>

      {/* Lista con scroll si excede */}
      <div className="mt-3 space-y-2.5 overflow-y-auto max-h-[480px] pr-1 scrollbar-thin">
        {filtradas.map((item) => {
          const estilo = ESTILOS_TIPO[item.tipo] || ESTILOS_TIPO.informativo
          const Icono = estilo.icono

          return (
            <div
              key={item.id}
              className={cn(
                'group flex items-start justify-between gap-3 rounded-lg border p-2.5 transition-all duration-150 hover:shadow-soft-xs',
                estilo.borde,
                estilo.bg
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Icono className={cn('h-3.5 w-3.5 shrink-0', estilo.colorIcono)} />
                  <span className={cn('panel-mono text-[9px] font-semibold uppercase px-1.5 py-0.2 rounded border', estilo.badge)}>
                    {item.impacto ? `Impacto ${item.impacto}` : item.tipo}
                  </span>
                  <h3 className="text-xs font-semibold text-slate-900 group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-200 transition-colors truncate">
                    {item.titulo}
                  </h3>
                </div>
                <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
                  {item.descripcion}
                </p>
              </div>

              {item.accion && item.to && (
                <div className="shrink-0 pt-0.5">
                  <Link
                    to={item.to}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold shadow-xs transition-all',
                      estilo.btn
                    )}
                  >
                    {item.accion}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
