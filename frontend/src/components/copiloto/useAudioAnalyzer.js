import { useCallback, useEffect, useRef } from 'react'

/**
 * useAudioAnalyzer - Web Audio API AnalyserNode para visualizaciones a 60 FPS
 *
 * Proporciona mediciones en tiempo real de amplitud (RMS) y espectro de frecuencia.
 * Soporta dos fuentes:
 * 1. Stream de micrófono real (MediaStream) en estado LISTENING.
 * 2. Sintetizador de envolvente/frecuencia modulada por voz en estado SPEAKING.
 *
 * Utiliza refs para evitar renders de React por frame y mantener 60 FPS sostenidos.
 */
export function useAudioAnalyzer() {
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const animFrameRef = useRef(null)

  // Refs de valores numéricos expuestos a componentes de renderizado (VoiceOrb)
  const rmsRef = useRef(0) // 0.0 a 1.0
  const pitchRef = useRef(0) // 0.0 a 1.0 (frecuencia dominante)
  const esActivoRef = useRef(false)

  // Obtiene o crea el AudioContext reutilizable
  const obtenerAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx()
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {})
    }
    return audioCtxRef.current
  }, [])

  // Inicializa el AnalyserNode
  const obtenerAnalyser = useCallback(() => {
    const ctx = obtenerAudioContext()
    if (!ctx) return null

    if (!analyserRef.current) {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.75
      analyser.minDecibels = -90
      analyser.maxDecibels = -10
      analyserRef.current = analyser
    }
    return analyserRef.current
  }, [obtenerAudioContext])

  // Detiene el análisis y libera recursos
  const detenerAnalisis = useCallback(() => {
    esActivoRef.current = false
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect()
      } catch {
        /* ya desconectado */
      }
      sourceNodeRef.current = null
    }

    rmsRef.current = 0
    pitchRef.current = 0
  }, [])

  // Bucle de actualización por requestAnimationFrame (60 FPS sin React re-renders)
  const iniciarLoopAnalisis = useCallback(
    (onFrame) => {
      const analyser = analyserRef.current
      if (!analyser) return

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      let rmsSuave = 0

      const loop = () => {
        if (!esActivoRef.current) return

        analyser.getByteFrequencyData(dataArray)

        // Calcular RMS (Root Mean Square) del buffer de frecuencia
        let suma = 0
        for (let i = 0; i < bufferLength; i++) {
          const val = dataArray[i] / 255.0
          suma += val * val
        }
        const rmsActual = Math.sqrt(suma / bufferLength)

        // Aplicar interpolación lineal (lerp) para movimientos ultra-suaves tipo Siri
        rmsSuave = rmsSuave * 0.7 + rmsActual * 0.3
        rmsRef.current = Math.min(1.0, Math.max(0.0, rmsSuave))

        if (onFrame) onFrame(rmsRef.current)

        animFrameRef.current = requestAnimationFrame(loop)
      }

      loop()
    },
    []
  )

  // 1. Conecta stream de micrófono real (MediaStream)
  const conectarMicrofono = useCallback(
    (stream) => {
      if (!stream) return
      detenerAnalisis()

      const ctx = obtenerAudioContext()
      const analyser = obtenerAnalyser()
      if (!ctx || !analyser) return

      try {
        const source = ctx.createMediaStreamSource(stream)
        source.connect(analyser)
        sourceNodeRef.current = source
        esActivoRef.current = true
        iniciarLoopAnalisis()
      } catch (err) {
        console.warn('[useAudioAnalyzer] Error conectando micrófono:', err)
      }
    },
    [detenerAnalisis, obtenerAudioContext, obtenerAnalyser, iniciarLoopAnalisis]
  )

  // 2. Modulador de audio sintético para TTS (SpeechSynthesis)
  // Genera un oscilador de prueba modulado con fluctuación de habla humana en tiempo real
  const iniciarAnalisisSinteticoTTS = useCallback(() => {
    detenerAnalisis()

    const ctx = obtenerAudioContext()
    const analyser = obtenerAnalyser()
    if (!ctx || !analyser) return

    try {
      // Oscilador de audio de baja ganancia rítmico que simula formantes de la voz hablada
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(180, ctx.currentTime) // frecuencia base de voz

      lfo.type = 'triangle'
      lfo.frequency.setValueAtTime(5.5, ctx.currentTime) // modulación cadencia ~5.5 Hz (ritmo sílabas)

      lfoGain.gain.setValueAtTime(0.35, ctx.currentTime)
      lfo.connect(lfoGain)
      lfoGain.connect(gain.gain)

      gain.gain.setValueAtTime(0.4, ctx.currentTime)

      osc.connect(gain)
      gain.connect(analyser)

      osc.start()
      lfo.start()

      sourceNodeRef.current = {
        disconnect: () => {
          try {
            osc.stop()
            lfo.stop()
            osc.disconnect()
            lfo.disconnect()
            gain.disconnect()
          } catch {
            /* ignorar */
          }
        },
      }

      esActivoRef.current = true
      iniciarLoopAnalisis()
    } catch (err) {
      console.warn('[useAudioAnalyzer] Error en análisis sintético TTS:', err)
    }
  }, [detenerAnalisis, obtenerAudioContext, obtenerAnalyser, iniciarLoopAnalisis])

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      detenerAnalisis()
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {})
      }
    }
  }, [detenerAnalisis])

  return {
    rmsRef,
    esActivoRef,
    conectarMicrofono,
    iniciarAnalisisSinteticoTTS,
    detenerAnalisis,
  }
}
