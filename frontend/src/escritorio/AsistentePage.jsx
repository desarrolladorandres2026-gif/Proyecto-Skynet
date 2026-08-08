import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MicOff } from 'lucide-react'

import { useAuth } from '../auth/AuthContext.jsx'
import { copiloto } from '../api/copiloto.js'
import { CopilotoButton } from '../components/copiloto/CopilotoButton.jsx'
import { useVoiceAssistant } from '../components/copiloto/useVoiceAssistant.js'
import { puenteEscritorio, esEscritorio } from './esEscritorio.js'
import { precargarModelo } from './reconocedorVosk.js'

// Lo que carga la ventana OCULTA del asistente de escritorio.
//
// ── Qué es y qué no es ──────────────────────────────────────────────────────
// No es un asistente nuevo: es el mismo `useVoiceAssistant` y el mismo cliente
// `copiloto.chat()` que usa el widget del panel, montados sin la interfaz del
// panel. Todo lo que Skynet sabe hacer —Gemini, herramientas, permisos,
// confirmaciones, auditoría— sigue viviendo en el backend y llega por el mismo
// camino; aquí no hay ni una regla de negocio.
//
// La diferencia con `CopilotoWidget` es lo que le rodea, no lo que hace:
// esta pantalla no dibuja chat ni burbujas porque la ventana está oculta casi
// siempre. Lo que se ve durante unos segundos es solo el orbe.
//
// ── Por qué es una ruta de la app web y no un HTML aparte en Electron ───────
// Porque así hereda la sesión. La ventana carga esta ruta desde la MISMA URL
// del panel, con lo cual comparte origen y comparte la cookie httpOnly del
// backend: si la persona inició sesión en el panel, el asistente ya está
// autenticado, sin guardar ningún token en disco ni inventar un segundo
// mecanismo de login.

export default function AsistentePage() {
  const { usuario, cargando } = useAuth()
  const navigate = useNavigate()
  const puente = puenteEscritorio()

  const [ultimaRespuesta, setUltimaRespuesta] = useState('')
  const [modeloListo, setModeloListo] = useState(null) // null = comprobando

  const conversacionIdRef = useRef(null)
  const peticionRef = useRef(null)

  // Precarga del modelo de voz al arrancar, no en la primera pulsación: son
  // varios segundos de descompresión, y pagarlos cuando el usuario ya está
  // hablando significa perder la frase entera.
  useEffect(() => {
    if (!esEscritorio()) return
    let vivo = true
    precargarModelo().then((ok) => vivo && setModeloListo(ok))
    return () => {
      vivo = false
    }
  }, [])

  // ── El único camino de las preguntas ──────────────────────────────────────
  // Idéntico al del widget: mismo endpoint, mismo streaming, mismos eventos de
  // acción. Lo que cambia es el destino de lo que llega, porque aquí no hay
  // chat que pintar: el texto se lee en voz alta y las acciones visuales
  // levantan el panel.
  const enviarTexto = useCallback(
    async (texto, { porVoz = true } = {}) => {
      const limpio = texto?.trim()
      if (!limpio) return

      peticionRef.current?.abort()
      const controlador = new AbortController()
      peticionRef.current = controlador

      const hablar = vozRef.current.debeHablar(porVoz)
      if (hablar) vozRef.current.reiniciar()
      setUltimaRespuesta('')

      try {
        const resultado = await copiloto.chat(limpio, conversacionIdRef.current, {
          signal: controlador.signal,
          onDelta: (trozo) => {
            setUltimaRespuesta((prev) => prev + trozo)
            if (hablar) vozRef.current.encolarTexto(trozo)
          },
          // Un borrador o una confirmación NO se pueden resolver hablando:
          // exigen ver qué se va a hacer y pulsar un botón. Se levanta el
          // panel, que es donde vive esa interfaz, en vez de duplicarla aquí.
          onAccion: () => puente.abrirPanel('/'),
          onConfirmacion: () => puente.abrirPanel('/'),
          // La navegación pedida por voz abre el panel en la ruta que decidió
          // el backend (ya verificada contra los permisos del usuario). Sin
          // esto, "abre los reportes" no tendría dónde abrirlos: la ventana
          // del asistente está oculta y no es el panel.
          onNavegacion: (evento) => {
            if (evento.ruta) puente.abrirPanel(evento.ruta)
          },
        })
        conversacionIdRef.current = resultado.conversacionId
        if (hablar) vozRef.current.finalizar()
      } catch (err) {
        if (err.name === 'AbortError') return
        // Sesión caducada: el JWT dura 8 h y una ventana oculta no puede pedir
        // la contraseña. Se avisa al proceso principal para que abra el login.
        if (/401|sesión|sesion/i.test(err.message || '')) {
          puente.sesionCaducada()
          return
        }
        if (hablar) vozRef.current.detener()
        throw err
      } finally {
        if (peticionRef.current === controlador) peticionRef.current = null
      }
    },
    [puente]
  )

  const asistenteVoz = useVoiceAssistant({ onPregunta: enviarTexto })
  const { voz } = asistenteVoz

  const vozRef = useRef(voz)
  vozRef.current = voz

  // El proceso principal necesita el estado para mostrar u ocultar el orbe: la
  // ventana no tiene barra ni botones, así que aparecer y desaparecer ES el
  // único indicador de que Skynet está haciendo algo.
  useEffect(() => {
    puente.reportarEstado(asistenteVoz.estadoVoz)
  }, [asistenteVoz.estadoVoz, puente])

  // El atajo global entra por aquí. Dispara exactamente lo mismo que el botón
  // de micrófono del panel: no hay una ruta de voz "de escritorio" aparte.
  const activarRef = useRef(asistenteVoz.activarMicrofono)
  activarRef.current = asistenteVoz.activarMicrofono
  useEffect(() => puente.alEscuchar(() => activarRef.current?.()), [puente])

  // "Oye Skynet" se enciende y se apaga desde el menú de la bandeja.
  const vozRefWake = useRef(asistenteVoz)
  vozRefWake.current = asistenteVoz
  useEffect(
    () =>
      puente.alCambiarWakeWord((activo) => {
        const a = vozRefWake.current
        if (activo && !a.microfono.escuchandoWake) a.alternarWake()
        if (!activo && a.microfono.escuchandoWake) a.alternarWake()
      }),
    [puente]
  )

  // Enciende el wake word si venía activado en la configuración, una vez que
  // el modelo está cargado. Antes de eso, arrancarlo solo produciría un error.
  useEffect(() => {
    if (!puente.wakeWordInicial || modeloListo !== true) return
    if (!asistenteVoz.microfono.escuchandoWake) asistenteVoz.alternarWake()
    // Solo debe correr cuando el modelo pasa a estar listo, no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeloListo, puente.wakeWordInicial])

  // Sin sesión no hay nada que hacer en una ventana oculta: se le pide al
  // proceso principal que abra el login en el panel visible.
  useEffect(() => {
    if (!cargando && !usuario) puente.sesionCaducada()
  }, [cargando, usuario, puente])

  // Fuera del asistente de escritorio esta ruta no tiene sentido: si alguien
  // la abre en el navegador se le manda al panel normal.
  useEffect(() => {
    if (!esEscritorio()) navigate('/', { replace: true })
  }, [navigate])

  if (!esEscritorio()) return null

  const problema =
    modeloListo === false
      ? 'Falta el modelo de voz'
      : asistenteVoz.errorMensaje || (!usuario && !cargando ? 'Inicia sesión' : '')

  return (
    // `bg-transparent` y sin bordes: la ventana de Electron es transparente y
    // sin marco, así que lo único que se ve en pantalla es el orbe flotando.
    <div className="flex h-screen w-screen select-none flex-col items-center justify-center gap-3 bg-transparent">
      <CopilotoButton
        isOpen={false}
        onClick={() => asistenteVoz.activarMicrofono()}
        state={asistenteVoz.estadoVoz}
        rmsRef={asistenteVoz.rmsRef}
        badgeText={puente.atajo ? `Skynet • ${puente.atajo}` : 'Skynet'}
        size={140}
      />

      {problema && (
        <button
          type="button"
          onClick={() => puente.abrirPanel('/asistente/diagnostico')}
          className="flex items-center gap-1.5 rounded-full bg-slate-900/85 px-3 py-1.5 text-[11px] font-medium text-amber-300 shadow-lg backdrop-blur"
        >
          <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
          {problema} — ver diagnóstico
        </button>
      )}

      {/* Lo que Skynet está diciendo, recortado: sirve para confirmar de un
          vistazo que entendió, sin convertir el orbe en una ventana de chat. */}
      {!problema && ultimaRespuesta && (
        <p className="max-w-[280px] rounded-2xl bg-slate-900/85 px-3 py-2 text-center text-[11px] leading-snug text-slate-100 shadow-lg backdrop-blur">
          {ultimaRespuesta.slice(0, 160)}
          {ultimaRespuesta.length > 160 ? '…' : ''}
        </p>
      )}
    </div>
  )
}
