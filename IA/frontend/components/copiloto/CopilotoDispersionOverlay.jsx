import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * CopilotoDispersionOverlay
 *
 * Proyecta una ráfaga de ondas neón, rejilla cibernética y partículas de energía
 * a pantalla completa originadas desde las coordenadas exactas del botón del Copiloto.
 * Se destruye automáticamente tras completar la animación (~1.3s).
 */
export function CopilotoDispersionOverlay({ triggerKey, origin = { x: window.innerWidth - 60, y: window.innerHeight - 60 } }) {
  const [active, setActive] = useState(false)
  const [coords, setCoords] = useState(origin)

  useEffect(() => {
    if (!triggerKey) return
    setCoords(origin)
    setActive(true)
    const timer = setTimeout(() => {
      setActive(false)
    }, 1300)
    return () => clearTimeout(timer)
  }, [triggerKey, origin.x, origin.y])

  if (!active) return null

  // Crear array de partículas en 360 grados
  const particles = Array.from({ length: 18 }, (_, i) => {
    const angle = (i * 360) / 18
    const distance = Math.max(window.innerWidth, window.innerHeight) * 0.85
    const rad = (angle * Math.PI) / 180
    return {
      id: i,
      targetX: Math.cos(rad) * distance,
      targetY: Math.sin(rad) * distance,
      size: 4 + (i % 3) * 3,
      color: i % 3 === 0 ? '#22d3ee' : i % 3 === 1 ? '#a855f7' : '#38bdf8',
    }
  })

  return (
    <AnimatePresence>
      <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden select-none">
        {/* Flash de energía de fondo */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.4, 0] }}
          transition={{ duration: 0.85, ease: 'easeOut' }}
          className="absolute inset-0 bg-gradient-to-r from-cyan-900/30 via-indigo-900/40 to-fuchsia-900/30 backdrop-blur-[2px]"
        />

        {/* Rejilla cibernética holográfica fugaz */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 0.45, 0], scale: [0.9, 1.1, 1.25] }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          className="absolute inset-0 bg-[radial-gradient(#22d3ee_1px,transparent_1px)] [background-size:24px_24px] opacity-20"
        />

        {/* Onda expansiva principal 1 (Neón Cian) */}
        <motion.div
          initial={{ width: 0, height: 0, opacity: 1, left: coords.x, top: coords.y }}
          animate={{
            width: [0, window.innerWidth * 2.4],
            height: [0, window.innerWidth * 2.4],
            left: [coords.x, coords.x - window.innerWidth * 1.2],
            top: [coords.y, coords.y - window.innerWidth * 1.2],
            opacity: [0.95, 0.6, 0],
          }}
          transition={{ duration: 1.15, ease: [0.1, 0.8, 0.2, 1] }}
          className="absolute rounded-full border-2 border-cyan-400 dark:border-cyan-300 shadow-[0_0_60px_rgba(34,211,238,0.9),inset_0_0_35px_rgba(34,211,238,0.6)]"
        />

        {/* Onda expansiva secundaria 2 (Neón Violeta/Fucsia) */}
        <motion.div
          initial={{ width: 0, height: 0, opacity: 1, left: coords.x, top: coords.y }}
          animate={{
            width: [0, window.innerWidth * 1.9],
            height: [0, window.innerWidth * 1.9],
            left: [coords.x, coords.x - window.innerWidth * 0.95],
            top: [coords.y, coords.y - window.innerWidth * 0.95],
            opacity: [0.85, 0.4, 0],
          }}
          transition={{ duration: 0.95, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="absolute rounded-full border border-fuchsia-400 dark:border-fuchsia-300 shadow-[0_0_60px_rgba(217,70,239,0.7)]"
        />

        {/* Resplandor central de energía en el origen */}
        <motion.div
          initial={{ scale: 0.2, opacity: 1 }}
          animate={{ scale: [0.5, 4, 5.5], opacity: [1, 0.5, 0] }}
          transition={{ duration: 0.85, ease: 'easeOut' }}
          style={{ left: coords.x - 75, top: coords.y - 75 }}
          className="absolute w-[150px] h-[150px] rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500 blur-xl opacity-80"
        />

        {/* Ráfaga de partículas direccionales */}
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ left: coords.x, top: coords.y, opacity: 1, scale: 1 }}
            animate={{
              left: coords.x + p.targetX,
              top: coords.y + p.targetY,
              opacity: [1, 0.8, 0],
              scale: [1, 1.6, 0],
            }}
            transition={{ duration: 1.0, ease: [0.15, 0.85, 0.35, 1], delay: p.id * 0.012 }}
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              boxShadow: `0 0 14px ${p.color}`,
            }}
            className="absolute rounded-full"
          />
        ))}

        {/* Línea de escaneo holográfica vertical */}
        <motion.div
          initial={{ top: '-10%', opacity: 0.9 }}
          animate={{ top: '110%', opacity: 0 }}
          transition={{ duration: 0.85, ease: 'linear' }}
          className="absolute left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-cyan-400 via-fuchsia-400 to-transparent shadow-[0_0_25px_#22d3ee]"
        />
      </div>
    </AnimatePresence>
  )
}
