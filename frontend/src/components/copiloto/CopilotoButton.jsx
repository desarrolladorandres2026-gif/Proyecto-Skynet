import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CopilotoAnimatedIcon } from './CopilotoAnimatedIcon.jsx'
import { X, Move } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * CopilotoButton - Botón Flotante con Ícono Vectorial Animado Skynet (CopilotoAnimatedIcon)
 *
 * Características:
 * - Ícono vectorial ultra-HD idéntico al del encabezado del chat de Skynet IA.
 * - Reacciona visualmente al estado del Asistente de Voz (IDLE, LISTENING, PROCESSING, SPEAKING, ERROR).
 * - Clic para alternar apertura del Modo Chat.
 */
export function CopilotoButton({
  isOpen = false,
  onClick,
  state = 'IDLE', // 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR'
  rmsRef = null,
  badgeText = 'Skynet • Arrastra para mover',
  showTooltip = true,
  size = 70,
  className = '',
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [ripple, setRipple] = useState(false)
  const btnRef = useRef(null)

  const handleTap = () => {
    setRipple(true)
    setTimeout(() => setRipple(false), 600)
    let originPos = null
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      originPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }
    if (onClick) onClick(originPos)
  }

  // Texto contextual dinámico según estado de voz
  const textoBadge =
    state === 'LISTENING'
      ? 'Skynet escuchando…'
      : state === 'PROCESSING'
      ? 'Skynet pensando…'
      : state === 'SPEAKING'
      ? 'Skynet hablando…'
      : state === 'ERROR'
      ? 'Error en Skynet'
      : badgeText

  return (
    <div className={cn('relative inline-flex items-center justify-center group select-none', className)}>
      {/* Tooltip informativo al pasar el cursor */}
      {showTooltip && !isOpen && (
        <div
          className={cn(
            'absolute right-full mr-3 px-3 py-1.5 rounded-xl whitespace-nowrap text-xs font-semibold tracking-wide shadow-xl backdrop-blur-md transition-all duration-300 pointer-events-none z-50 flex items-center gap-1.5',
            state === 'SPEAKING' || state === 'PROCESSING' || state === 'LISTENING'
              ? 'opacity-100 translate-x-0 scale-100 dark:bg-slate-950/95 dark:text-cyan-300 dark:border-cyan-400/50'
              : 'dark:bg-slate-950/90 dark:text-cyan-300 dark:border dark:border-cyan-500/40 dark:shadow-[0_0_22px_rgba(6,182,212,0.3)] bg-slate-900/90 text-sky-100 border border-sky-400/30 shadow-sky-900/25',
            isHovered ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-2 scale-95'
          )}
        >
          <Move className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>{textoBadge}</span>
          <span className="flex h-2 w-2 relative">
            <span
              className={cn(
                'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                state === 'ERROR' ? 'bg-red-400' : state === 'SPEAKING' ? 'bg-cyan-300' : 'bg-cyan-400'
              )}
            ></span>
            <span
              className={cn(
                'relative inline-flex rounded-full h-2 w-2',
                state === 'ERROR' ? 'bg-red-500' : 'bg-cyan-500'
              )}
            ></span>
          </span>
        </div>
      )}

      {/* Efecto de Onda de Clic (Ripple Effect) */}
      {ripple && (
        <span
          className="absolute inset-0 rounded-full border-2 border-cyan-400 dark:border-cyan-300 pointer-events-none animate-[copilot-ripple_0.6s_ease-out_forwards]"
          style={{ width: size, height: size }}
        />
      )}

      {/* Botón Flotante Principal con Ícono Animado Skynet */}
      <motion.button
        ref={btnRef}
        type="button"
        onTap={handleTap}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={isOpen ? 'Cerrar chat de Skynet' : 'Abrir chat de Skynet'}
        className={cn(
          'relative flex items-center justify-center rounded-full p-2 transition-all duration-300 backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 cursor-grab active:cursor-grabbing',
          'bg-transparent hover:bg-cyan-500/15 dark:hover:bg-cyan-400/20',
          'dark:drop-shadow-[0_0_20px_rgba(34,211,238,0.6)] drop-shadow-[0_0_15px_rgba(2,132,199,0.45)]',
          'hover:drop-shadow-[0_0_35px_rgba(34,211,238,0.95)] hover:scale-105 active:scale-95',
          isOpen && 'rotate-90'
        )}
        style={{ width: size, height: size }}
      >
        {isOpen ? (
          <div className="relative flex items-center justify-center w-full h-full text-slate-800 dark:text-cyan-300 transition-transform duration-300">
            <div className="absolute inset-2 rounded-full bg-cyan-500/20 dark:bg-cyan-400/25 animate-pulse" />
            <X className="w-8 h-8 relative z-10 stroke-[2.5]" />
          </div>
        ) : (
          <CopilotoAnimatedIcon size={size - 10} isOpen={isOpen} state={state} speed={state !== 'IDLE' ? 'fast' : 'normal'} />
        )}

        {!isOpen && state === 'IDLE' && (
          <span className="absolute top-0 right-0 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-400 dark:bg-cyan-300 border-2 border-white dark:border-slate-900"></span>
          </span>
        )}
      </motion.button>
    </div>
  )
}
