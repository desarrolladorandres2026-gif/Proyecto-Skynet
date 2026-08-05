import React from 'react'
import { cn } from '../../lib/cn'

/**
 * CopilotoAnimatedIcon - Ícono animado giratorio vectorial Ultra HD / Retina Crisp
 *
 * Mejoras de Definición y Calidad Visual:
 * - ViewBox de Alta Resolución (400x400) para máxima nitidez en pantallas 4K/Retina.
 * - `shapeRendering="geometricPrecision"` para bordes nítidos sin desenfoque indeseado.
 * - Renderizado en 2 pases (Capa Neón de Fondo + Capa Vectorial Nítida en Primer Plano).
 * - Rotación multi-capa por GPU (hardware accelerated) a 60/120 fps.
 * - Nodos con brillo blanco y gradientes vectoriales de alta definición.
 */
export function CopilotoAnimatedIcon({
  className = '',
  size = 70,
  isOpen = false,
  interactive = true,
  showPulseRing = true,
  speed = 'normal', // 'slow' | 'normal' | 'fast'
}) {
  const speedMult = speed === 'slow' ? 1.5 : speed === 'fast' ? 0.6 : 1

  return (
    <div
      className={cn(
        'relative flex items-center justify-center select-none transition-all duration-300',
        interactive && 'group hover:scale-105 active:scale-95 cursor-pointer',
        className
      )}
      style={{ width: size, height: size }}
    >
      {/* Anillo de aura pulsante exterior (Glow Aura) */}
      {showPulseRing && (
        <div
          className={cn(
            'absolute inset-0 rounded-full transition-all duration-500 pointer-events-none',
            'dark:bg-cyan-400/25 dark:shadow-[0_0_30px_rgba(34,211,238,0.5)]',
            'bg-sky-500/20 shadow-[0_0_24px_rgba(2,132,199,0.35)]',
            'animate-[copilot-aura_3s_ease-in-out_infinite]',
            isOpen && 'dark:bg-cyan-400/40 dark:shadow-[0_0_40px_rgba(34,211,238,0.75)] bg-sky-600/35 shadow-[0_0_32px_rgba(2,132,199,0.55)]'
          )}
        />
      )}

      {/* SVG Principal Transparente Ultra-HD (400x400 ViewBox) */}
      <svg
        viewBox="0 0 400 400"
        className="w-full h-full relative z-10 overflow-visible transform-gpu"
        style={{ background: 'transparent' }}
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
      >
        <defs>
          {/* Resplandor Neón posterior (Background Glow Pass) */}
          <filter id="copilotGlowHD" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Gradientes Ultra-HD Modo Oscuro (Cian Neón / Turquesa Eléctrico) */}
          <linearGradient id="hdGradDark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="40%" stopColor="#22d3ee" />
            <stop offset="80%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>

          {/* Gradientes Ultra-HD Modo Claro (Azul Océano Profundo / Zafiro Nítido) */}
          <linearGradient id="hdGradLight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0284c7" />
            <stop offset="50%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>

          {/* Gradiente Radial para Nodos (Esferas de Red) */}
          <radialGradient id="hdNodeDark" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#67e8f9" />
            <stop offset="85%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#083344" />
          </radialGradient>

          <radialGradient id="hdNodeLight" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#38bdf8" />
            <stop offset="85%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#0c4a6e" />
          </radialGradient>
        </defs>

        {/* ============================================================ */}
        {/* CAPA 1: ANILLO Y ESFERA EXTERIOR (Rotación Horaria 400x400)  */}
        {/* ============================================================ */}
        <g
          className={cn(
            'origin-center transition-transform duration-700 transform-gpu',
            isOpen ? 'animate-[copilot-spin_12s_linear_infinite]' : 'animate-[copilot-spin_22s_linear_infinite]',
            'group-hover:[animation-duration:8s]'
          )}
          style={{
            animationDuration: `${(isOpen ? 12 : 22) * speedMult}s`,
            willChange: 'transform',
          }}
        >
          {/* Pase de Resplandor Neón Trasero */}
          <circle
            cx="200"
            cy="200"
            r="176"
            fill="none"
            className="stroke-cyan-400/40 dark:stroke-cyan-300/60"
            strokeWidth="8"
            style={{ filter: 'url(#copilotGlowHD)' }}
          />

          {/* Círculo Principal Nítido en Primer Plano */}
          <circle
            cx="200"
            cy="200"
            r="176"
            fill="none"
            className="stroke-[url(#hdGradLight)] dark:stroke-[url(#hdGradDark)]"
            strokeWidth="5"
          />

          {/* Arcos de Longitud y Latitud de la Esfera */}
          <ellipse
            cx="200"
            cy="200"
            rx="176"
            ry="92"
            fill="none"
            className="stroke-[url(#hdGradLight)] dark:stroke-[url(#hdGradDark)]"
            strokeWidth="3"
            strokeOpacity="0.8"
          />
          <ellipse
            cx="200"
            cy="200"
            rx="92"
            ry="176"
            fill="none"
            className="stroke-[url(#hdGradLight)] dark:stroke-[url(#hdGradDark)]"
            strokeWidth="3"
            strokeOpacity="0.8"
          />

          {/* Arcos Diagonales Entrecruzados con Trazo Punteado Nítido */}
          <ellipse
            cx="200"
            cy="200"
            rx="176"
            ry="124"
            fill="none"
            transform="rotate(45 200 200)"
            className="stroke-[url(#hdGradLight)] dark:stroke-[url(#hdGradDark)]"
            strokeWidth="2.5"
            strokeDasharray="12 6 4 6"
            strokeOpacity="0.7"
          />
          <ellipse
            cx="200"
            cy="200"
            rx="176"
            ry="124"
            fill="none"
            transform="rotate(-45 200 200)"
            className="stroke-[url(#hdGradLight)] dark:stroke-[url(#hdGradDark)]"
            strokeWidth="2.5"
            strokeDasharray="12 6 4 6"
            strokeOpacity="0.7"
          />

          {/* Nodos Exteriores de Alta Definición (12 Nodos Perimetrales) */}
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => {
            const rad = (angle * Math.PI) / 180
            const x = 200 + 176 * Math.cos(rad)
            const y = 200 + 176 * Math.sin(rad)
            const esPrincipal = i % 3 === 0
            return (
              <g key={`outer-node-hd-${i}`}>
                {/* Resplandor del nodo */}
                <circle cx={x} cy={y} r={esPrincipal ? 11 : 7} className="fill-cyan-400/30 dark:fill-cyan-300/40" />
                {/* Esfera nítida */}
                <circle
                  cx={x}
                  cy={y}
                  r={esPrincipal ? 8.5 : 5.5}
                  className="fill-[url(#hdNodeLight)] dark:fill-[url(#hdNodeDark)] stroke-slate-900 dark:stroke-slate-950"
                  strokeWidth="1.5"
                />
                {/* Brillo central blanco */}
                <circle cx={x - 1.5} cy={y - 1.5} r={esPrincipal ? 2.5 : 1.5} fill="#ffffff" />
              </g>
            )
          })}
        </g>

        {/* ============================================================ */}
        {/* CAPA 2: MARCO ROMBO / CUADRADO INTERMEDIO (Rotación Antihoraria) */}
        {/* ============================================================ */}
        <g
          className={cn(
            'origin-center transition-transform duration-700 transform-gpu',
            isOpen ? 'animate-[copilot-spin-reverse_9s_linear_infinite]' : 'animate-[copilot-spin-reverse_16s_linear_infinite]',
            'group-hover:[animation-duration:6s]'
          )}
          style={{
            animationDuration: `${(isOpen ? 9 : 16) * speedMult}s`,
            willChange: 'transform',
          }}
        >
          {/* Resplandor neón del marco */}
          <polygon
            points="200,64 336,200 200,336 64,200"
            fill="none"
            className="stroke-cyan-400/50 dark:stroke-cyan-300/60"
            strokeWidth="7"
            style={{ filter: 'url(#copilotGlowHD)' }}
          />

          {/* Rombo exterior Nítido */}
          <polygon
            points="200,64 336,200 200,336 64,200"
            fill="none"
            className="stroke-[url(#hdGradLight)] dark:stroke-[url(#hdGradDark)]"
            strokeWidth="4"
          />

          {/* Sub-marco rombo interno */}
          <polygon
            points="200,88 312,200 200,312 88,200"
            fill="none"
            className="stroke-sky-500/60 dark:stroke-cyan-300/70"
            strokeWidth="2.5"
            strokeDasharray="8 4"
          />

          {/* Nodos Vértices del Rombo */}
          {[
            { x: 200, y: 64 },
            { x: 336, y: 200 },
            { x: 200, y: 336 },
            { x: 64, y: 200 },
          ].map((pt, i) => (
            <g key={`vertex-node-${i}`}>
              <circle cx={pt.x} cy={pt.y} r="12" className="fill-cyan-400/30 dark:fill-cyan-300/40" />
              <circle
                cx={pt.x}
                cy={pt.y}
                r="9"
                className="fill-[url(#hdNodeLight)] dark:fill-[url(#hdNodeDark)] stroke-slate-900 dark:stroke-slate-950"
                strokeWidth="2"
              />
              <circle cx={pt.x - 2} cy={pt.y - 2} r="2.5" fill="#ffffff" />
            </g>
          ))}
        </g>

        {/* ============================================================ */}
        {/* CAPA 3: RED NÚCLEO CIBERNÉTICA (Rotación Horaria Rápida)     */}
        {/* ============================================================ */}
        <g
          className={cn(
            'origin-center transition-transform duration-700 transform-gpu',
            isOpen ? 'animate-[copilot-spin_6s_linear_infinite]' : 'animate-[copilot-spin_10s_linear_infinite]',
            'group-hover:[animation-duration:4s]'
          )}
          style={{
            animationDuration: `${(isOpen ? 6 : 10) * speedMult}s`,
            willChange: 'transform',
          }}
        >
          {/* Hexágono / Octágono central Nítido */}
          <polygon
            points="200,140 242,156 260,200 242,244 200,260 158,244 140,200 158,156"
            fill="none"
            className="stroke-[url(#hdGradLight)] dark:stroke-[url(#hdGradDark)]"
            strokeWidth="3.5"
          />

          {/* Conexiones Radiales Nítidas */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
            const rad = (angle * Math.PI) / 180
            const x = 200 + 60 * Math.cos(rad)
            const y = 200 + 60 * Math.sin(rad)
            return (
              <line
                key={`hd-core-line-${i}`}
                x1="200"
                y1="200"
                x2={x}
                y2={y}
                className="stroke-sky-400 dark:stroke-cyan-300"
                strokeWidth="2.5"
              />
            )
          })}

          {/* Nodos de la Red Circular Interna */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
            const rad = (angle * Math.PI) / 180
            const x = 200 + 60 * Math.cos(rad)
            const y = 200 + 60 * Math.sin(rad)
            return (
              <g key={`hd-core-node-${i}`}>
                <circle cx={x} cy={y} r="7" className="fill-[url(#hdNodeLight)] dark:fill-[url(#hdNodeDark)] stroke-slate-900 dark:stroke-slate-950" strokeWidth="1.5" />
                <circle cx={x - 1} cy={y - 1} r="2" fill="#ffffff" />
              </g>
            )
          })}
        </g>

        {/* ============================================================ */}
        {/* CAPA 4: NÚCLEO CENTRAL PULSANTE HD (Punto Blanco Especular)  */}
        {/* ============================================================ */}
        <g className="origin-center animate-[copilot-pulse_2.5s_ease-in-out_infinite] transform-gpu">
          {/* Halo Neón Exterior del Núcleo */}
          <circle
            cx="200"
            cy="200"
            r="32"
            className="fill-cyan-400/25 dark:fill-cyan-300/35"
            style={{ filter: 'url(#copilotGlowHD)' }}
          />

          {/* Anillo de energía intermedio */}
          <circle
            cx="200"
            cy="200"
            r="22"
            className="fill-sky-500/40 dark:fill-cyan-400/50 stroke-cyan-300"
            strokeWidth="2"
          />

          {/* Esfera del Núcleo Central */}
          <circle
            cx="200"
            cy="200"
            r="15"
            className="fill-sky-600 dark:fill-cyan-300"
          />

          {/* Punto blanco central de resplandor máximo */}
          <circle
            cx="196"
            cy="196"
            r="6"
            fill="#ffffff"
          />
        </g>
      </svg>
    </div>
  )
}
