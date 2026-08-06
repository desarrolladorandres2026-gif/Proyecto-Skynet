import { useCallback, useRef, useState } from 'react'
import { motion, useDragControls } from 'framer-motion'

import { useAuth } from '../../auth/AuthContext.jsx'
import { copiloto } from '../../api/copiloto.js'
import { CopilotoButton } from './CopilotoButton.jsx'
import { CopilotoChatCard } from './CopilotoChatCard.jsx'
import { useHablar } from './useHablar.js'
import { useReconocimientoVoz } from './useReconocimientoVoz.js'

// Burbuja flotante y movible disponible en cualquier pantalla (montada una sola vez en AppShell.jsx).
// Permite arrastrar el botón a cualquier posición de la pantalla (mouse + touch).
export default function CopilotoWidget() {
  const { moduloActivo } = useAuth()
  // `dragListener={false}` + dragControls: por defecto framer-motion arma el
  // drag sobre TODO el elemento con `drag`, así que cualquier intento de
  // seleccionar texto dentro del chat term arrastrando la ventana en vez de
  // marcar el texto. Con dragControls el arrastre solo arranca donde se llame
  // a dragControls.start(evento) a propósito: el encabezado de la tarjeta y el
  // botón flotante (ver más abajo), nunca el cuerpo de mensajes ni el input.
  const dragControls = useDragControls()
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState([])
  const [entrada, setEntrada] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  // Espejo síncrono de `mensajes`. Hace falta porque enviarTexto se invoca
  // también desde el callback de voz (fuera del ciclo de render): leer el
  // estado por clausura daría una versión vieja, y leerlo dentro del updater
  // de setMensajes tampoco sirve — ese callback corre en el render siguiente,
  // cuando la petición ya se mandó.
  const mensajesRef = useRef([])
  const aplicarMensajes = useCallback((siguiente) => {
    mensajesRef.current = typeof siguiente === 'function' ? siguiente(mensajesRef.current) : siguiente
    setMensajes(mensajesRef.current)
  }, [])

  const voz = useHablar()

  // Envía una pregunta y transmite la respuesta. `porVoz` indica CÓMO entró la
  // pregunta (micrófono/"Oye Skynet" o teclado); si además se lee en voz alta
  // lo decide la preferencia del usuario, no este dato —  ver debeHablar() en
  // useHablar.js.
  const enviarTexto = useCallback(
    async (texto, { porVoz = false } = {}) => {
      const limpio = texto?.trim()
      if (!limpio) return
      const hablar = voz.debeHablar(porVoz)

      const historialPrevio = mensajesRef.current
      // El turno del usuario + un turno vacío del modelo que se va rellenando
      // con cada trozo que llega (efecto "escribiendo"). `streaming` marca cuál
      // es la burbuja en curso para que la UI no muestre además el indicador de
      // "Pensando…" cuando el texto ya empezó a aparecer.
      aplicarMensajes([...historialPrevio, { rol: 'user', texto: limpio }, { rol: 'model', texto: '', streaming: true }])
      setError('')
      setCargando(true)
      if (hablar) voz.reiniciar()

      try {
        const resultado = await copiloto.chat(limpio, historialPrevio, {
          onDelta: (trozo) => {
            aplicarMensajes((prev) => {
              const copia = [...prev]
              const ultimo = copia[copia.length - 1]
              copia[copia.length - 1] = { ...ultimo, texto: ultimo.texto + trozo }
              return copia
            })
            // Se va hablando por oraciones completas mientras el resto sigue
            // generándose (ver useHablar): esperar la respuesta entera
            // desperdiciaría la ventaja del streaming.
            if (hablar) voz.encolarTexto(trozo)
          },
        })
        // El historial del backend es la fuente de verdad (ya viene recortado y
        // sin la marca `streaming`).
        aplicarMensajes(resultado.historial)
        if (hablar) voz.finalizar()
      } catch (err) {
        // Descarta la burbuja vacía del modelo: el error se muestra en su banner.
        aplicarMensajes([...historialPrevio, { rol: 'user', texto: limpio }])
        setError(err.message || 'No se pudo consultar a Skynet')
        if (hablar) voz.detener()
      } finally {
        setCargando(false)
      }
    },
    [aplicarMensajes, voz]
  )

  // Al detectar "Oye Skynet" (o al terminar de hablar con el botón de
  // micrófono) llega aquí la transcripción. Se abre el panel para que la
  // persona VEA la respuesta además de oírla.
  const alRecibirPregunta = useCallback(
    (pregunta) => {
      setAbierto(true)
      enviarTexto(pregunta, { porVoz: true })
    },
    [enviarTexto]
  )

  // Mientras Skynet habla o está generando, el micrófono se suspende: si no,
  // captaría su propia voz por el altavoz y se reactivaría en bucle.
  const microfono = useReconocimientoVoz({
    onPregunta: alRecibirPregunta,
    pausado: voz.hablando || cargando,
  })

  if (!moduloActivo('copiloto')) return null

  function enviar(e) {
    e?.preventDefault?.()
    if (cargando) return
    const texto = entrada.trim()
    if (!texto) return
    setEntrada('')
    enviarTexto(texto)
  }

  const limpiarHistorial = () => {
    aplicarMensajes([])
    setError('')
    voz.detener()
  }

  const alternarWake = () => {
    if (microfono.escuchandoWake) microfono.desactivarWake()
    else microfono.activarWake()
  }

  const cerrar = () => {
    setAbierto(false)
    voz.detener()
    // El modo "Oye Skynet" sobrevive a cerrar el panel a propósito: su razón de
    // ser es poder invocarlo sin tocar la pantalla. Solo se corta la captura en
    // curso; el bucle de escucha sigue si el usuario lo dejó encendido.
    if (!microfono.escuchandoWake) microfono.detener()
  }

  return (
    <motion.div
      drag
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0.05}
      className="fixed right-4 bottom-20 z-40 sm:right-6 sm:bottom-6"
    >
      <CopilotoChatCard
        isOpen={abierto}
        onClose={cerrar}
        mensajes={mensajes}
        entrada={entrada}
        setEntrada={setEntrada}
        onEnviar={enviar}
        cargando={cargando}
        error={error || microfono.error}
        onLimpiarHistorial={limpiarHistorial}
        vozSoportada={microfono.soportado}
        escuchando={microfono.capturandoPregunta}
        pidiendoPermisoMicrofono={microfono.pidiendoPermiso}
        parcialVoz={microfono.parcial}
        onMicrofono={microfono.escucharUnaVez}
        wakeActivo={microfono.escuchandoWake}
        onAlternarWake={alternarWake}
        hablando={voz.hablando}
        onCallar={voz.detener}
        onIniciarArrastre={(e) => dragControls.start(e)}
        voces={voz.vocesDisponibles}
        vozElegidaURI={voz.vozElegidaURI}
        onElegirVoz={voz.elegirVoz}
        onProbarVoz={voz.probarVoz}
        sintesisSoportada={voz.soportado}
        modoRespuesta={voz.modoRespuesta}
        onElegirModoRespuesta={voz.elegirModoRespuesta}
        vozActiva={voz.vozActiva}
        onAlternarVoz={voz.alternarVoz}
      />

      {/* Único punto de arrastre cuando la tarjeta está cerrada: el propio
          botón flotante. touch-none aquí (y no en el contenedor completo)
          para no bloquear la selección de texto del chat en pantallas
          táctiles. */}
      <div className="flex justify-end touch-none" onPointerDown={(e) => dragControls.start(e)}>
        <CopilotoButton
          isOpen={abierto}
          onClick={() => (abierto ? cerrar() : setAbierto(true))}
          badgeText="Skynet • Arrastra para mover"
          size={70}
        />
      </div>
    </motion.div>
  )
}
