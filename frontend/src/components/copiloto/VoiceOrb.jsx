import React, { useEffect, useRef } from 'react'
import { cn } from '../../lib/cn'

/**
 * VoiceOrb - Esfera inteligente de IA inspirada en Siri para Skynet
 *
 * Máquina de estados visuales:
 * - IDLE: Glow mínimo, pulso sutil azul/cian.
 * - LISTENING: Halo azul de respiración profunda y ondas concentradas.
 * - PROCESSING: Partículas orbitando, rotación acelerada, núcleo comprimiéndose.
 * - SPEAKING: Esfera inteligente Siri reactiva a la voz en tiempo real vía Web Audio API.
 *   - El halo, ondas, brillo y emisión de partículas responden al nivel RMS (volumen).
 * - ERROR: Resplandor rojo brillante con micro-vibración.
 *
 * Rendimiento:
 * - Cero re-renders de React por frame: el bucle escribe en el DOM por refs.
 * - El bucle de 60 FPS SOLO corre cuando el orbe tiene algo que reaccionar
 *   (escuchando, pensando, hablando o en error). En reposo —que es donde el
 *   orbe pasa casi todo el tiempo— los anillos giran con una animación CSS,
 *   que lleva el compositor de la GPU sin despertar el hilo principal.
 *
 *   No es una micro-optimización: este componente vive en el widget del panel
 *   Y en la ventana oculta del asistente de escritorio, así que un bucle
 *   incondicional significaba dos canvas repintándose 60 veces por segundo
 *   durante toda la jornada, en equipos que además tienen el ERP abierto. Se
 *   medía en ~0,4 hilos de CPU y GPU constantes sin que nadie estuviera
 *   usando Skynet.
 */

// Estados en los que el orbe reacciona a algo (audio, progreso) y por tanto
// necesita recalcularse cada frame. IDLE queda fuera a propósito.
const ESTADOS_ANIMADOS = new Set(['LISTENING', 'PROCESSING', 'SPEAKING', 'ERROR'])
export function VoiceOrb({
  state = 'IDLE', // 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR'
  size = 70,
  rmsRef = null,
  className = '',
  onClick,
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const haloOuterRef = useRef(null)
  const haloInnerRef = useRef(null)
  const ring1Ref = useRef(null)
  const ring2Ref = useRef(null)
  const animFrameRef = useRef(null)

  // Arreglo de partículas para el Canvas en estados PROCESSING / SPEAKING
  const particulasRef = useRef([])

  useEffect(() => {
    // Inicializar 24 partículas de energía
    const particulas = []
    for (let i = 0; i < 24; i++) {
      particulas.push({
        angulo: Math.random() * Math.PI * 2,
        radio: 15 + Math.random() * 25,
        velocidad: 0.02 + Math.random() * 0.03,
        tamano: 1.5 + Math.random() * 2,
        opacidad: 0.3 + Math.random() * 0.7,
        hue: 180 + Math.random() * 40, // tonos cian/azul
      })
    }
    particulasRef.current = particulas
  }, [])

  useEffect(() => {
    // ── Reposo: se cede el giro al CSS y no se pinta ni un frame ────────────
    // Hay que borrar los `transform` en línea que dejó el bucle: un estilo en
    // línea gana a la animación CSS, así que sin esto el orbe se quedaría
    // congelado en el ángulo exacto donde terminó de hablar.
    if (!ESTADOS_ANIMADOS.has(state)) {
      for (const ref of [ring1Ref, ring2Ref, haloOuterRef, haloInnerRef]) {
        if (ref.current) ref.current.style.transform = ''
      }
      if (haloOuterRef.current) {
        haloOuterRef.current.style.opacity = ''
        haloOuterRef.current.style.boxShadow = ''
      }
      // El canvas de partículas no dibuja nada en reposo, pero puede quedar el
      // último fotograma pintado.
      const canvas = canvasRef.current
      const ctx = canvas?.getContext?.('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      return undefined
    }

    let rotacion1 = 0
    let rotacion2 = 0
    let tiempo = 0

    const loop = () => {
      tiempo += 0.03
      const rms = rmsRef?.current || 0

      // Velocidad de rotaciones según estado
      const multVel = state === 'PROCESSING' ? 3.5 : state === 'SPEAKING' ? 1.8 : 0.8
      rotacion1 += 0.8 * multVel
      rotacion2 -= 1.2 * multVel

      // 1. Aplicar transformaciones directas al DOM para 60 FPS sin React re-renders
      if (ring1Ref.current) {
        ring1Ref.current.style.transform = `rotate(${rotacion1}deg)`
      }
      if (ring2Ref.current) {
        ring2Ref.current.style.transform = `rotate(${rotacion2}deg)`
      }

      // 2. Reactividad al Audio en SPEAKING / LISTENING (Estilo Siri)
      let escalaHalo = 1.0
      let opacidadHalo = 0.5
      let glowSpread = 20

      if (state === 'SPEAKING') {
        escalaHalo = 1.0 + rms * 0.45 + Math.sin(tiempo * 8) * 0.04
        opacidadHalo = 0.6 + rms * 0.4
        glowSpread = 25 + rms * 45
      } else if (state === 'LISTENING') {
        escalaHalo = 1.05 + Math.sin(tiempo * 3) * 0.08 + rms * 0.25
        opacidadHalo = 0.5 + Math.sin(tiempo * 3) * 0.2 + rms * 0.3
        glowSpread = 20 + rms * 25
      } else if (state === 'PROCESSING') {
        escalaHalo = 0.92 + Math.sin(tiempo * 6) * 0.05
        opacidadHalo = 0.8
        glowSpread = 30
      } else if (state === 'ERROR') {
        escalaHalo = 1.0 + Math.sin(tiempo * 15) * 0.03
        opacidadHalo = 0.9
        glowSpread = 35
      }

      if (haloOuterRef.current) {
        haloOuterRef.current.style.transform = `scale(${escalaHalo})`
        haloOuterRef.current.style.opacity = opacidadHalo
        if (state === 'ERROR') {
          haloOuterRef.current.style.boxShadow = `0 0 ${glowSpread}px rgba(239, 68, 68, 0.8)`
        } else if (state === 'SPEAKING') {
          haloOuterRef.current.style.boxShadow = `0 0 ${glowSpread}px rgba(34, 211, 238, ${0.4 + rms * 0.5})`
        } else {
          haloOuterRef.current.style.boxShadow = `0 0 ${glowSpread}px rgba(6, 182, 212, 0.4)`
        }
      }

      if (haloInnerRef.current) {
        const escalaInner = 1.0 + (state === 'SPEAKING' ? rms * 0.3 : Math.sin(tiempo * 4) * 0.05)
        haloInnerRef.current.style.transform = `scale(${escalaInner})`
      }

      // 3. Renderizado de partículas en Canvas para estados dinámicos
      const canvas = canvasRef.current
      if (canvas) {
        let ctx = null
        try {
          ctx = canvas.getContext?.('2d')
        } catch {
          /* jsdom fallback */
        }
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          const centroX = canvas.width / 2
          const centroY = canvas.height / 2

          if (state === 'SPEAKING' || state === 'PROCESSING' || state === 'LISTENING') {
            const particulas = particulasRef.current
            const velMultParticulas = state === 'SPEAKING' ? 1 + rms * 2.5 : state === 'PROCESSING' ? 2 : 1

            particulas.forEach((p) => {
              p.angulo += p.velocidad * velMultParticulas
              const rDinamico = p.radio * (state === 'SPEAKING' ? 1 + rms * 0.5 : 1)
              const x = centroX + Math.cos(p.angulo) * rDinamico
              const y = centroY + Math.sin(p.angulo) * rDinamico

              ctx.beginPath()
              ctx.arc(x, y, p.tamano * (state === 'SPEAKING' ? 1 + rms * 0.8 : 1), 0, Math.PI * 2)
              ctx.fillStyle = state === 'ERROR' ? `rgba(248, 113, 113, ${p.opacidad})` : `hsla(${p.hue}, 90%, 65%, ${p.opacidad})`
              ctx.shadowColor = state === 'ERROR' ? '#ef4444' : '#22d3ee'
              ctx.shadowBlur = 6
              ctx.fill()
            })
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop)
    }

    // La ventana oculta del asistente de escritorio corre con
    // `backgroundThrottling: false` para poder seguir escuchando, y eso
    // significa que Chromium NO frena sus animaciones al esconderla: sin esta
    // comprobación, el orbe seguiría pintándose a pantalla completa detrás de
    // todo, para nadie.
    const visible = () => document.visibilityState !== 'hidden'

    const alCambiarVisibilidad = () => {
      if (visible() && !animFrameRef.current) {
        loop()
      } else if (!visible() && animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
    }

    if (visible()) loop()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
    }
  }, [state, rmsRef])

  // Colores principales según estado
  const colorBorde =
    state === 'ERROR'
      ? 'stroke-red-500 dark:stroke-red-400'
      : state === 'SPEAKING'
      ? 'stroke-cyan-300 dark:stroke-cyan-200'
      : state === 'PROCESSING'
      ? 'stroke-sky-400 dark:stroke-cyan-400'
      : state === 'LISTENING'
      ? 'stroke-sky-500 dark:stroke-cyan-300'
      : 'stroke-cyan-500/60 dark:stroke-cyan-400/60'

  // En reposo el giro lo lleva el compositor. Las duraciones reproducen el
  // ritmo que tenía el bucle en IDLE (0,8 × 0,8°/frame y 0,8 × 1,2°/frame a
  // 60 FPS ≈ 9,4 s y 6,3 s por vuelta), para que el cambio no se note.
  const enReposo = !ESTADOS_ANIMADOS.has(state)
  const giroCSS = (segundos, inverso) =>
    enReposo
      ? {
          animation: `${inverso ? 'copilot-spin-reverse' : 'copilot-spin'} ${segundos}s linear infinite`,
          transformOrigin: 'center',
        }
      : undefined

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className={cn('relative flex items-center justify-center select-none cursor-pointer group', className)}
      style={{ width: size, height: size }}
    >
      {/* Canvas posterior para partículas de energía */}
      <canvas
        ref={canvasRef}
        width={size * 2}
        height={size * 2}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* Resplandor neón posterior exterior (Halo Siri) */}
      <div
        ref={haloOuterRef}
        className={cn(
          'absolute inset-0 rounded-full transition-shadow duration-300 pointer-events-none z-0',
          state === 'ERROR'
            ? 'bg-red-500/20'
            : state === 'SPEAKING'
            ? 'bg-cyan-400/30'
            : state === 'PROCESSING'
            ? 'bg-sky-500/25'
            : state === 'LISTENING'
            ? 'bg-cyan-500/20'
            : 'bg-cyan-500/10'
        )}
      />

      {/* Halo interior pulsante */}
      <div
        ref={haloInnerRef}
        className={cn(
          'absolute inset-2 rounded-full pointer-events-none z-0 transition-opacity duration-300',
          state === 'ERROR' ? 'bg-red-600/30' : 'bg-cyan-400/20 dark:bg-cyan-300/25'
        )}
      />

      {/* SVG vectorial multinivel de la Esfera Inteligente */}
      <svg
        viewBox="0 0 400 400"
        className={cn(
          'w-full h-full relative z-10 overflow-visible transform-gpu transition-all duration-300',
          state === 'ERROR' && 'animate-[copilot-shake_0.4s_ease-in-out]'
        )}
        style={{ background: 'transparent' }}
        shapeRendering="geometricPrecision"
      >
        <defs>
          <filter id="orbGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="gradSiriDark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>

          <linearGradient id="gradError" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>

        {/* CAPA 1: Anillo Exterior. Gira por CSS en reposo y por ref (ring1Ref)
            cuando el orbe está reaccionando a algo. */}
        {/* El aro exterior va FUERA del grupo que gira, a propósito.
            Es una circunferencia perfecta: rotarla no cambia un solo píxel,
            pero lleva encima el filtro gaussiano `#orbGlow`, y un filtro SVG
            dentro de un elemento en movimiento obliga al navegador a
            recalcular el desenfoque en cada fotograma. Sacándolo, el
            resultado se dibuja una vez y se reutiliza. */}
        <circle
          cx="200"
          cy="200"
          r="176"
          fill="none"
          className={colorBorde}
          strokeWidth={state === 'SPEAKING' ? 7 : state === 'PROCESSING' ? 6 : 4}
          style={{ filter: 'url(#orbGlow)' }}
        />

        <g ref={ring1Ref} className="origin-center" style={giroCSS(9.4, false)}>
          {/* Arcos de latitud / longitud de la esfera */}
          <ellipse
            cx="200"
            cy="200"
            rx="176"
            ry="92"
            fill="none"
            className={colorBorde}
            strokeWidth="3"
            strokeOpacity="0.75"
          />
          <ellipse
            cx="200"
            cy="200"
            rx="92"
            ry="176"
            fill="none"
            className={colorBorde}
            strokeWidth="3"
            strokeOpacity="0.75"
          />
        </g>

        {/* CAPA 2: Rombo cibernético intermedio (ring2Ref) */}
        <g ref={ring2Ref} className="origin-center" style={giroCSS(6.3, true)}>
          <polygon
            points="200,64 336,200 200,336 64,200"
            fill="none"
            className={colorBorde}
            strokeWidth={state === 'PROCESSING' ? 5 : 3.5}
            strokeDasharray={state === 'PROCESSING' ? '12 6' : 'none'}
          />

          {/* Vértices destacados */}
          {[
            { x: 200, y: 64 },
            { x: 336, y: 200 },
            { x: 200, y: 336 },
            { x: 64, y: 200 },
          ].map((pt, i) => (
            <circle
              key={`v-node-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={state === 'SPEAKING' ? 8 : 6}
              className={state === 'ERROR' ? 'fill-red-400' : 'fill-cyan-300 dark:fill-cyan-200'}
            />
          ))}
        </g>

        {/* CAPA 3: Núcleo Central de Energía Siri */}
        <g className="origin-center">
          <circle
            cx="200"
            cy="200"
            r={state === 'SPEAKING' ? 38 : state === 'PROCESSING' ? 24 : 30}
            className={cn(
              'transition-all duration-300',
              state === 'ERROR'
                ? 'fill-red-500/40 stroke-red-400'
                : state === 'SPEAKING'
                ? 'fill-cyan-400/40 stroke-cyan-200'
                : 'fill-sky-500/30 stroke-cyan-300'
            )}
            strokeWidth="3"
            style={{ filter: 'url(#orbGlow)' }}
          />

          {/* Punto brillante especular central */}
          <circle
            cx="196"
            cy="196"
            r={state === 'SPEAKING' ? 9 : 6}
            fill="#ffffff"
            className="transition-all duration-300"
          />
        </g>
      </svg>
    </div>
  )
}
