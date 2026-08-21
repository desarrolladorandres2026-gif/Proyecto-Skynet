import {
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'
import { Activity, PieChart as PieIcon, TrendingUp } from 'lucide-react'
import { cn } from '../../lib/cn.js'

const COLORES_PIE = {
  pendiente: '#f59e0b',
  asignado: '#8b5cf6',
  en_proceso: '#06b6d4',
  en_espera: '#ec4899',
  resuelto: '#10b981',
}

const NOMBRES_ESTADO = {
  pendiente: 'Pendientes',
  asignado: 'Asignados',
  en_proceso: 'En proceso',
  en_espera: 'En espera',
  resuelto: 'Resueltos',
}

const TOOLTIP_STYLE = {
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '8px',
  color: '#f8fafc',
  fontSize: '12px',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
}

export function GraficasOperativas({
  flujoSemanal = [],
  analitica = {},
  className = '',
}) {
  const safeAnalitica = analitica || {}
  const safeFlujoSemanal = Array.isArray(flujoSemanal) ? flujoSemanal : []

  // 1. Datos para Donut de distribución de daños
  const datosDanos = Object.entries(safeAnalitica.distribucionDanos || {})
    .filter(([_, valor]) => valor > 0)
    .map(([clave, valor]) => ({
      name: NOMBRES_ESTADO[clave] || clave,
      clave,
      value: valor,
      color: COLORES_PIE[clave] || '#64748b',
    }))

  // 2. Datos para Pipeline de Requerimientos
  const reqFlujo = safeAnalitica.flujoRequerimientos || {}
  const totalDanosGrafica = datosDanos.reduce((acc, curr) => acc + curr.value, 0)

  return (
    <div className={cn('grid gap-3.5 md:grid-cols-2', className)}>
      {/* 1. Flujo Semanal (Área) */}
      <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white/95 p-3.5 shadow-soft-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/70">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400">
              <Activity className="h-3.5 w-3.5" />
            </span>
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">Flujo Operativo Semanal</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Reportados vs. Resueltos (7 días)</p>
            </div>
          </div>
          <span className="panel-mono text-[11px] font-semibold text-brand-700 dark:text-brand-300 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Tendencia
          </span>
        </div>

        <div className="w-full" style={{ height: 'var(--ui-chart-height)' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={safeFlujoSemanal} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCreados" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorResueltos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
              <XAxis dataKey="dia" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingBottom: '4px' }}
              />
              <Area
                type="monotone"
                dataKey="creados"
                name="Reportados"
                stroke="#f59e0b"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCreados)"
              />
              <Area
                type="monotone"
                dataKey="resueltos"
                name="Resueltos"
                stroke="#06b6d4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorResueltos)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Distribución de Estados & Embudo de Requerimientos */}
      <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white/95 p-4 shadow-soft-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/70">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <PieIcon className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Distribución & Trámites</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Incidentes y flujo de requerimientos</p>
            </div>
          </div>
          <span className="panel-mono text-xs font-semibold text-cyan-700 dark:text-cyan-300">
            {totalDanosGrafica} activos
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 items-center" style={{ height: 'var(--ui-chart-height)' }}>
          {/* Donut Chart */}
          <div className="h-full w-full relative flex items-center justify-center">
            {datosDanos.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={datosDanos}
                    innerRadius={46}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {datosDanos.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-500">Sin incidentes</p>
            )}

            {datosDanos.length > 0 && (
              <div className="pointer-events-none absolute text-center">
                <p className="text-base font-bold text-slate-900 dark:text-white tabular-nums">{totalDanosGrafica}</p>
                <p className="panel-mono text-[9px] uppercase text-slate-500 dark:text-slate-400">Total</p>
              </div>
            )}
          </div>

          {/* Micro barras de Requerimientos & Leyenda */}
          <div className="space-y-2">
            <div className="space-y-1">
              {datosDanos.slice(0, 3).map((d) => (
                <div key={d.clave} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 truncate max-w-[90px]">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white tabular-nums">{d.value}</span>
                </div>
              ))}
            </div>

            {/* Micro barras de Requerimientos */}
            <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-1 text-center">
                <p className="text-[9px] text-amber-800 dark:text-amber-300 font-medium">Financiero</p>
                <p className="text-xs font-bold text-amber-900 dark:text-amber-200">{reqFlujo.financiero || 0}</p>
              </div>
              <div className="rounded-md bg-cyan-500/10 border border-cyan-500/20 p-1 text-center">
                <p className="text-[9px] text-cyan-800 dark:text-cyan-300 font-medium">Bodega</p>
                <p className="text-xs font-bold text-cyan-900 dark:text-cyan-200">{reqFlujo.bodega || 0}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
