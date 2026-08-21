import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, AlertCircle, AlertTriangle, CheckCircle, Info, ChevronRight } from 'lucide-react'
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
    borde: 'border-amber-200 hover:border-amber-300 dark:border-amber-500/30 dark:hover:border-amber-500/50',
    bg: 'bg-amber-50/70 dark:bg-amber-950/30',
    icono: AlertTriangle,
    colorIcono: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300',
    btn: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/20',
  },
  optimizacion: {
    borde: 'border-emerald-200 hover:border-emerald-300 dark:border-emerald-500/30 dark:hover:border-emerald-500/50',
    bg: 'bg-emerald-50/70 dark:bg-emerald-950/30',
    icono: CheckCircle,
    colorIcono: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
    btn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20',
  },
  informativo: {
    borde: 'border-cyan-200 hover:border-cyan-300 dark:border-cyan-500/30 dark:hover:border-cyan-500/50',
    bg: 'bg-cyan-50/70 dark:bg-cyan-950/30',
    icono: Info,
    colorIcono: 'text-cyan-600 dark:text-cyan-400',
    badge: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20 dark:text-cyan-300',
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
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-tr from-brand-600 to-cyan-400 text-slate-950 shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            Análisis & Recomendaciones
            <span className="panel-mono text-[10px] font-semibold bg-brand-500/10 text-brand-700 border border-brand-500/20 px-2 py-0.5 rounded-full dark:bg-brand-500/20 dark:text-brand-300 dark:border-brand-500/30">
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
                filtro === 'advertencia' ? 'bg-amber-600 text-white' : 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40'
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
                  <h3 className="text-xs font-semibold text-slate-900 group-hover:text-brand-600 dark:text-white dark:group-hover:text-cyan-200 transition-colors truncate">
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
