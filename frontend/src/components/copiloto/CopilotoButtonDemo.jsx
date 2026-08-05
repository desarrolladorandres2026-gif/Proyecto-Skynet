import React, { useState } from 'react'
import { CopilotoAnimatedIcon } from './CopilotoAnimatedIcon'
import { CopilotoButton } from './CopilotoButton'
import { CopilotoChatCard } from './CopilotoChatCard'
import { Sun, Moon, Sparkles, Play, RotateCw, Layers } from 'lucide-react'

/**
 * CopilotoButtonDemo - Panel de Demostración interactivo para probar el botón animado del Copiloto.
 * Permite previsualizar:
 * 1. Fondos claros y oscuros (Light vs Dark mode).
 * 2. Diferentes tamaños y velocidades de rotación.
 * 3. La tarjeta de chat IA cibernética combinada con el botón.
 */
export function CopilotoButtonDemo() {
  const [isDark, setIsDark] = useState(true)
  const [speed, setSpeed] = useState('normal')
  const [isOpen, setIsOpen] = useState(false)
  const [size, setSize] = useState(70)
  const [bgStyle, setBgStyle] = useState('dark-glass') // 'dark-glass' | 'light-slate' | 'gradient' | 'transparent'
  const [mensajes, setMensajes] = useState([
    { rol: 'model', texto: '¡Hola! Soy Skynet, con estética cibernética. ¿En qué puedo asistirte hoy?' },
    { rol: 'user', texto: '¿Puedes mostrarme el resumen de requerimientos?' },
    { rol: 'model', texto: 'Con gusto. Tienes 3 requerimientos activos y 1 reporte de mantenimiento pendiente de aprobación.' }
  ])
  const [entrada, setEntrada] = useState('')
  const [cargando, setCargando] = useState(false)

  const handleEnviar = (e) => {
    e?.preventDefault?.()
    if (!entrada.trim()) return
    const txt = entrada.trim()
    setMensajes((prev) => [...prev, { rol: 'user', texto: txt }])
    setEntrada('')
    setCargando(true)

    setTimeout(() => {
      setMensajes((prev) => [
        ...prev,
        { rol: 'model', texto: `Procesé tu consulta "${txt}". Todos los sistemas operan a máxima capacidad.` }
      ])
      setCargando(false)
    }, 1200)
  }

  return (
    <div className={`p-6 rounded-3xl transition-colors duration-500 border ${isDark ? 'dark bg-slate-950 text-white border-slate-800' : 'bg-slate-50 text-slate-900 border-slate-200'} max-w-4xl mx-auto shadow-2xl`}>
      {/* Encabezado */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold tracking-tight">Sistema de Chat Skynet</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Tarjeta de chat cibernética en perfecta sintonía con el botón vectorial animado.
          </p>
        </div>

        {/* Toggle de Modo Claro / Oscuro */}
        <button
          onClick={() => setIsDark(!isDark)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-cyan-400 dark:hover:border-cyan-400 shadow-sm"
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" /> Modo Claro
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-cyan-400" /> Modo Oscuro
            </>
          )}
        </button>
      </header>

      {/* Selector de Controles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
        {/* Control de Velocidad */}
        <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-2">
            <RotateCw className="w-3.5 h-3.5" /> Velocidad de Giro
          </label>
          <div className="flex gap-2">
            {['slow', 'normal', 'fast'].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  speed === s
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {s === 'slow' ? 'Lento' : s === 'normal' ? 'Normal' : 'Rápido'}
              </button>
            ))}
          </div>
        </div>

        {/* Control de Fondo de Previsualización */}
        <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-2">
            <Layers className="w-3.5 h-3.5" /> Fondo de Prueba
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: 'dark-glass', label: 'Vidrio Oscuro' },
              { id: 'light-slate', label: 'Superficie Clara' },
              { id: 'gradient', label: 'Gradiente Neon' },
              { id: 'grid', label: 'Rejilla / Grid' },
            ].map((bg) => (
              <button
                key={bg.id}
                onClick={() => setBgStyle(bg.id)}
                className={`py-1 px-2 rounded-lg text-xs font-medium transition-all ${
                  bgStyle === bg.id
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {bg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Control de Tamaño */}
        <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between mb-2">
            <span>Tamaño del Botón</span>
            <span className="text-cyan-500 font-bold">{size}px</span>
          </label>
          <input
            type="range"
            min="44"
            max="120"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-full accent-cyan-500 cursor-pointer"
          />
        </div>
      </div>

      {/* ÁREA DE PREVISUALIZACIÓN EN VIVO DE LA TARJETA Y EL BOTÓN */}
      <div
        className={`relative min-h-[480px] rounded-2xl p-8 flex flex-col items-center justify-end overflow-hidden transition-all duration-500 border ${
          bgStyle === 'dark-glass'
            ? 'bg-slate-900/90 border-cyan-500/20 backdrop-blur-xl'
            : bgStyle === 'light-slate'
            ? 'bg-slate-100 border-slate-300'
            : bgStyle === 'gradient'
            ? 'bg-gradient-to-br from-indigo-900 via-slate-900 to-cyan-950 border-cyan-500/30'
            : 'bg-[radial-gradient(#0891b2_1px,transparent_1px)] [background-size:16px_16px] bg-slate-950 border-cyan-500/20'
        }`}
      >
        <div className="absolute top-4 left-4 z-20">
          <span className="text-xs font-mono uppercase tracking-widest text-slate-400 dark:text-cyan-400/80 bg-slate-800/40 px-3 py-1 rounded-full border border-cyan-500/20">
            Demostración Interactiva — Haz clic en el botón para abrir/cerrar la tarjeta
          </span>
        </div>

        {/* Tarjeta de Chat IA Cibernética */}
        <CopilotoChatCard
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          mensajes={mensajes}
          entrada={entrada}
          setEntrada={setEntrada}
          onEnviar={handleEnviar}
          cargando={cargando}
          onLimpiarHistorial={() => setMensajes([])}
        />

        {/* Botón Flotante Animado */}
        <div className="mt-2">
          <CopilotoButton
            isOpen={isOpen}
            onClick={() => setIsOpen(!isOpen)}
            badgeText="Skynet • Arrastra para mover"
            size={size}
          />
        </div>
      </div>

      {/* Desglose de Tamaños & Iconos aislados */}
      <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
          <Play className="w-4 h-4 text-cyan-400" /> Iconos vectoriales aislados en varios tamaños
        </h3>
        <div className="flex flex-wrap items-center justify-around gap-6 p-6 rounded-2xl bg-slate-100 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
          <div className="flex flex-col items-center gap-2">
            <CopilotoAnimatedIcon size={40} speed={speed} />
            <span className="text-[10px] font-mono text-slate-400">40px</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <CopilotoAnimatedIcon size={56} speed={speed} />
            <span className="text-[10px] font-mono text-slate-400">56px</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <CopilotoAnimatedIcon size={70} speed={speed} />
            <span className="text-[10px] font-mono text-slate-400">70px (Predeterminado)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <CopilotoAnimatedIcon size={96} speed={speed} />
            <span className="text-[10px] font-mono text-slate-400">96px</span>
          </div>
        </div>
      </div>
    </div>
  )
}
