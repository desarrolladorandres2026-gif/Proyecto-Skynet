// Tarjeta de métrica del dashboard insignia: ícono + número animado + label
// + insignia de tendencia opcional (ver TrendBadge — solo aparece con dato
// real). El conteo animado respeta prefers-reduced-motion (salta directo al
// valor final en vez de correr el requestAnimationFrame).
import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn.js'
import { Card } from '../ui.jsx'

const TONO_ICONO = {
  brand: 'bg-brand-500/15 text-brand-600 dark:text-brand-300 border border-brand-500/25',
}

const TONO_NUMERO = {
  brand: 'text-slate-900 dark:text-white',
}

const TONO_LINEA = {
  brand: 'bg-brand-500/40 group-hover:bg-brand-400',
}

function useConteoAnimado(valor, duracionMs = 700) {
  const [mostrado, setMostrado] = useState(0)

  useEffect(() => {
    if (typeof valor !== 'number') return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMostrado(valor)
      return undefined
    }
    let frame
    const inicio = performance.now()
    function tick(t) {
      const progreso = Math.min((t - inicio) / duracionMs, 1)
      const suavizado = 1 - (1 - progreso) ** 3
      setMostrado(Math.round(valor * suavizado))
      if (progreso < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [valor, duracionMs])

  return mostrado
}

export function StatCard({ icon: Icon, label, valor, tono = 'brand', trend, className = '' }) {
  const mostrado = useConteoAnimado(valor)
  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--panel-card-border-hover)] hover:shadow-soft-md',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn('inline-flex rounded-xl p-2.5 transition-transform group-hover:scale-105', TONO_ICONO[tono] ?? TONO_ICONO.brand)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        {trend}
      </div>
      <p
        className={cn('font-display mt-3 font-bold tabular-nums tracking-tight', TONO_NUMERO[tono] ?? TONO_NUMERO.brand)}
        style={{ fontSize: 'clamp(1.5rem, 1.35rem + 0.6vw, 2.25rem)' }}
      >
        {mostrado}
      </p>
      <p
        className="panel-mono mt-1 tracking-[0.12em] text-slate-500 uppercase dark:text-slate-400 leading-tight"
        style={{ fontSize: 'clamp(11px, 10px + 0.1vw, 12px)' }}
      >
        {label}
      </p>

      {/* Línea sutil de acento inferior */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-200 dark:bg-slate-800/40">
        <div className={cn('h-full w-1/3 transition-all duration-300 group-hover:w-full', TONO_LINEA[tono] ?? TONO_LINEA.brand)} />
      </div>
    </Card>
  )
}

