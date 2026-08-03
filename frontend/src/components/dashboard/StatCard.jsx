// Tarjeta de métrica del dashboard insignia: ícono + número animado + label
// + insignia de tendencia opcional (ver TrendBadge — solo aparece con dato
// real). El conteo animado respeta prefers-reduced-motion (salta directo al
// valor final en vez de correr el requestAnimationFrame).
import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn.js'
import { Card } from '../ui.jsx'

const TONO_ICONO = {
  brand: 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
}

const TONO_NUMERO = {
  brand: 'text-slate-900 dark:text-white',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  amber: 'text-amber-700 dark:text-amber-300',
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
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--panel-card-border-hover)] hover:shadow-soft-md',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn('inline-flex rounded-lg p-2', TONO_ICONO[tono] ?? TONO_ICONO.brand)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        {trend}
      </div>
      <p className={cn('font-display mt-3 text-3xl font-bold tabular-nums', TONO_NUMERO[tono] ?? TONO_NUMERO.brand)}>
        {mostrado}
      </p>
      <p className="panel-mono mt-1 text-[11px] tracking-[0.12em] text-slate-500 uppercase dark:text-slate-400">{label}</p>
    </Card>
  )
}
