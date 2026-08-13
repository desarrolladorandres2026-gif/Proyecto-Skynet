/**
 * Generador de efectos de audio de ciencia ficción/HUD táctico mediante Web Audio API puro.
 * No requiere archivos MP3 externos, funciona offline y tiene fallback seguro para SSR/tests.
 */

let audioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioCtx()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
    return audioCtx
  } catch {
    return null
  }
}

/**
 * Sonido de verificación en curso (escaneo cibernético)
 */
export function playVerifySound() {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(520, now)
    osc.frequency.exponentialRampToValueAtTime(1040, now + 0.18)

    gain.gain.setValueAtTime(0.08, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.22)
  } catch {
    // Ignorar si el navegador bloquea audio
  }
}

/**
 * Sonido ÉPICO de acceso concedido:
 * Acorde armónico futurista + barrido sub-bass + shimmer agudo
 */
export function playAccessGrantedSound() {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime

    // 1. Sub-bass drop / whoosh
    const subOsc = ctx.createOscillator()
    const subGain = ctx.createGain()
    subOsc.type = 'sine'
    subOsc.frequency.setValueAtTime(180, now)
    subOsc.frequency.exponentialRampToValueAtTime(45, now + 0.8)

    subGain.gain.setValueAtTime(0.22, now)
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9)

    subOsc.connect(subGain)
    subGain.connect(ctx.destination)
    subOsc.start(now)
    subOsc.stop(now + 0.9)

    // 2. Acorde cibernético de 3 frecuencias (Triada Futurista: C5, G5, C6)
    const frecuencias = [523.25, 783.99, 1046.5, 1567.98]
    frecuencias.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = idx % 2 === 0 ? 'triangle' : 'sine'
      const startT = now + idx * 0.06
      osc.frequency.setValueAtTime(freq * 0.95, startT)
      osc.frequency.exponentialRampToValueAtTime(freq, startT + 0.08)

      gain.gain.setValueAtTime(0, now)
      gain.gain.setValueAtTime(0.12 / (idx + 1), startT)
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.8)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(startT)
      osc.stop(startT + 0.85)
    })

    // 3. Shimmer agudo final
    const shimmer = ctx.createOscillator()
    const shimmerGain = ctx.createGain()
    shimmer.type = 'sine'
    shimmer.frequency.setValueAtTime(1800, now + 0.2)
    shimmer.frequency.exponentialRampToValueAtTime(2400, now + 0.5)

    shimmerGain.gain.setValueAtTime(0.06, now + 0.2)
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)

    shimmer.connect(shimmerGain)
    shimmerGain.connect(ctx.destination)
    shimmer.start(now + 0.2)
    shimmer.stop(now + 0.65)
  } catch {
    // Ignorar si el navegador bloquea audio
  }
}

/**
 * Sonido de acceso denegado (buzzer táctico)
 */
export function playAccessDeniedSound() {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(140, now)
    osc.frequency.setValueAtTime(110, now + 0.12)

    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.32)
  } catch {
    // Ignorar
  }
}
