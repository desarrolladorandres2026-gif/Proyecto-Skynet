import { useState } from 'react'
import {
  LayoutGrid, Eye, EyeOff, ArrowUp, ArrowDown,
  RotateCcw, Sparkles, Activity, Layers, Check,
} from 'lucide-react'
import { Modal, Btn, Switch } from '../ui.jsx'
import { cn } from '../../lib/cn.js'

const OPCIONES_ANCHO = [
  { clave: 'compacto', label: 'Compacto (40%)', cols: 'lg:col-span-5' },
  { clave: 'medio', label: 'Medio (50%)', cols: 'lg:col-span-6' },
  { clave: 'expandido', label: 'Expandido (60%)', cols: 'lg:col-span-7' },
  { clave: 'completo', label: 'Ancho Total (100%)', cols: 'lg:col-span-12' },
]

export function ModalPersonalizacionDashboard({
  abierto,
  onCerrar,
  secciones = [],
  estiloKpi = 'ribbon',
  tarjetasOrdenadas = [],
  esTarjetaOculta,
  alternarSeccion,
  moverSeccion,
  cambiarAnchoSeccion,
  cambiarEstiloKpi,
  alternarTarjeta,
  moverTarjeta,
  onRestablecer,
}) {
  const [tab, setTab] = useState('secciones') // 'secciones' | 'kpis'

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Personalización del Panel de Control"
      ancho="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Selector de Pestañas */}
        <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 dark:bg-slate-950/60 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab('secciones')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all',
              tab === 'secciones'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Secciones y Tamaños
          </button>
          <button
            type="button"
            onClick={() => setTab('kpis')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all',
              tab === 'kpis'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            <Activity className="h-3.5 w-3.5" />
            KPIs y Métricas
          </button>
        </div>

        {/* PESTAÑA 1: SECCIONES Y TAMAÑOS */}
        {tab === 'secciones' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ajusta qué bloques ver, su tamaño en pantalla y su orden de aparición:
            </p>

            <div className="space-y-2.5">
              {secciones.map((sec, idx) => (
                <div
                  key={sec.id}
                  className={cn(
                    'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3 transition-all',
                    sec.visible
                      ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60'
                      : 'border-slate-200/60 bg-slate-50/50 opacity-60 dark:border-slate-800/40 dark:bg-slate-950/30'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={sec.visible}
                      onChange={() => alternarSeccion(sec.id)}
                      label={`Mostrar ${sec.label}`}
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{sec.label}</p>
                      <p className="panel-mono text-[10px] text-slate-500 dark:text-slate-400">
                        {sec.visible ? 'Visible en el panel' : 'Oculto'}
                      </p>
                    </div>
                  </div>

                  {sec.visible && (
                    <div className="flex items-center gap-2">
                      {/* Selector de Ancho */}
                      <select
                        value={sec.ancho || 'completo'}
                        onChange={(e) => cambiarAnchoSeccion(sec.id, e.target.value)}
                        className="panel-input rounded-lg px-2.5 py-1 text-xs"
                      >
                        {OPCIONES_ANCHO.map((op) => (
                          <option key={op.clave} value={op.clave}>
                            {op.label}
                          </option>
                        ))}
                      </select>

                      {/* Botones de Reordenar */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moverSeccion(sec.id, -1)}
                          title="Subir"
                          className="rounded-md bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-30 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === secciones.length - 1}
                          onClick={() => moverSeccion(sec.id, 1)}
                          title="Bajar"
                          className="rounded-md bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-30 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PESTAÑA 2: KPIS Y MÉTRICAS */}
        {tab === 'kpis' && (
          <div className="space-y-4">
            {/* Selector de Estilo de Visualización */}
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Estilo de Visualización de KPIs:
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => cambiarEstiloKpi('ribbon')}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border p-3 text-left transition-all',
                    estiloKpi === 'ribbon'
                      ? 'border-brand-500 bg-brand-50/80 text-brand-900 dark:bg-brand-950/30 dark:text-white'
                      : 'border-slate-200 bg-slate-50/80 text-slate-600 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-500/20 text-brand-700 dark:text-brand-300">
                    <Sparkles className="h-3 w-3" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">Cinta Horizontal</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Ultra-compacta y moderna</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => cambiarEstiloKpi('grid')}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border p-3 text-left transition-all',
                    estiloKpi === 'grid'
                      ? 'border-brand-500 bg-brand-50/80 text-brand-900 dark:bg-brand-950/30 dark:text-white'
                      : 'border-slate-200 bg-slate-50/80 text-slate-600 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-500/20 text-brand-700 dark:text-brand-300">
                    <LayoutGrid className="h-3 w-3" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">Cuadrícula de Tarjetas</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Tarjetas individuales</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Lista de Métricas Individuales */}
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Métricas activas y visibilidad:
              </p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {tarjetasOrdenadas.map((t, idx) => {
                  const oculta = esTarjetaOculta(t.clave)
                  const Icono = t.icon
                  return (
                    <div
                      key={t.clave}
                      className={cn(
                        'flex items-center justify-between rounded-lg border p-2 text-xs transition-colors',
                        oculta
                          ? 'border-slate-200/60 bg-slate-50/40 opacity-50 dark:border-slate-800/40 dark:bg-slate-950/30'
                          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icono className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                        <span className="font-medium text-slate-900 dark:text-white">{t.label}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => alternarTarjeta(t.clave)}
                          className="rounded-md bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white"
                          title={oculta ? 'Mostrar métrica' : 'Ocultar métrica'}
                        >
                          {oculta ? <EyeOff className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> : <Eye className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />}
                        </button>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moverTarjeta(t.clave, -1)}
                          className="rounded-md bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-30 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === tarjetasOrdenadas.length - 1}
                          onClick={() => moverTarjeta(t.clave, 1)}
                          className="rounded-md bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-30 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer del Modal */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onRestablecer}
            className="panel-btn-fantasma inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restablecer por defecto
          </button>

          <Btn variante="primario" onClick={onCerrar}>
            <Check className="h-4 w-4 mr-1" />
            Aplicar y Cerrar
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
