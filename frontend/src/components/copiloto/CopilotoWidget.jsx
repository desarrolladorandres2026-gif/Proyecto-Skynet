import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useDragControls } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../../auth/AuthContext.jsx'
import { copiloto } from '../../api/copiloto.js'
import { ia as iaApi } from '../../api/ia.js'
import { CopilotoButton } from './CopilotoButton.jsx'
import { CopilotoChatCard } from './CopilotoChatCard.jsx'
import { useVoiceAssistant } from './useVoiceAssistant.js'
import { useAvisosIA } from './useAvisosIA.js'
import { useTecladoVirtual } from './useTecladoVirtual.js'
import { useEsMovil } from '../../layout/useEsMovil.js'

// Comando de interfaz que se resuelve en el navegador, sin ir al servidor: es
// una acción sobre la propia pantalla, así que mandarla a un modelo para que
// decida sería pagar ~800 ms y una petición de cuota por algo que aquí se
// decide en microsegundos.
function normalizarComando(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[.,;:!?¡¿]/g, '')
    .trim()
}
const PATRON_ABRIR_CHAT = /\b(abre|abrir|muestra|mostrar)\s+(skynet|chat|copiloto)\b/i

// Respuestas cortas de sí/no a una confirmación PENDIENTE (ver `confirmacion`
// más abajo). Se resuelven aquí, en el navegador, pulsando el mismo botón
// real que ya existía (CopilotoConfirmacion) — nunca mandándole el texto al
// modelo. Esto es lo que permite responder "Sí, confirmo" sin repetir
// "Asistente" (sigue siendo la misma conversación) SIN reabrir el hueco que
// copiloto.confirmaciones.js existe para cerrar: el modelo nunca decide
// ejecutar nada a partir de lo que alguien escribió o dijo. Lista corta y
// exacta a propósito, mismo criterio de "toda duda cae al camino normal" que
// copiloto.intencion.js: un falso negativo cae al chat de siempre (el modelo
// puede seguir pidiendo que se use el botón); un falso positivo dispararía
// una acción irreversible por error.
const FRASES_CONFIRMAR = new Set(['si', 'si confirmo', 'confirmo', 'autorizo', 'procede'])
const FRASES_CANCELAR = new Set(['no', 'no autorizo', 'cancela', 'cancelar', 'deten el proceso', 'detente'])

function resolverComoConfirmacion(texto) {
  const normalizado = normalizarComando(texto)
  if (FRASES_CONFIRMAR.has(normalizado)) return 'confirmar'
  if (FRASES_CANCELAR.has(normalizado)) return 'cancelar'
  return null
}

// Burbuja flotante y movible disponible en cualquier pantalla (montada una sola vez en AppShell.jsx).
// Permite interactuar mediante Voz Inteligente estilo Siri (con el chat cerrado por defecto)
// o abrir el Modo Chat completo por clic o por comando explícito "Abre Skynet".
export default function CopilotoWidget() {
  const { moduloActivo } = useAuth()
  const navigate = useNavigate()
  const dragControls = useDragControls()
  const esMovil = useEsMovil()
  const alturaTeclado = useTecladoVirtual()
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState([])
  const [entrada, setEntrada] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [borrador, setBorrador] = useState(null)
  const [enviandoBorrador, setEnviandoBorrador] = useState(false)
  const [errorBorrador, setErrorBorrador] = useState('')
  const [confirmacion, setConfirmacion] = useState(null)
  const [enviandoConfirmacion, setEnviandoConfirmacion] = useState(false)
  const [errorConfirmacion, setErrorConfirmacion] = useState('')

  const abrirConEfecto = useCallback(() => {
    setAbierto(true)
  }, [])

  const mensajesRef = useRef([])
  const aplicarMensajes = useCallback((siguiente) => {
    mensajesRef.current = typeof siguiente === 'function' ? siguiente(mensajesRef.current) : siguiente
    setMensajes(mensajesRef.current)
  }, [])

  // Identificador del hilo en el servidor. Sustituye al historial completo que
  // antes viajaba en cada petición (ver api/copiloto.js): el backend es ahora
  // la única fuente de verdad de lo que el modelo recuerda, y este componente
  // mantiene `mensajes` solo para pintarlos.
  const conversacionIdRef = useRef(null)

  // Cancela la petición en vuelo cuando llega otra encima. Sin esto, preguntar
  // algo nuevo mientras la respuesta anterior seguía llegando dejaba las dos
  // corriendo: los trozos de ambas se intercalaban en la misma burbuja y en la
  // misma cola de voz, y se oían dos respuestas mezcladas.
  const peticionRef = useRef(null)

  // Espejo por ref de `confirmacion`/`confirmarAccion`/`descartarConfirmacion`
  // para que `enviarTexto` (congelada tras el primer render, ver el
  // comentario de `vozRef` más abajo) siempre lea la confirmación pendiente
  // VIGENTE y no la que existía cuando se creó la clausura.
  const confirmacionRef = useRef(null)
  confirmacionRef.current = confirmacion
  const confirmarAccionRef = useRef(null)
  const descartarConfirmacionRef = useRef(null)

  const enviarTexto = useCallback(
    async (texto, { porVoz = false } = {}) => {
      const limpio = texto?.trim()
      if (!limpio) return

      // ── Respuesta a una confirmación pendiente ─────────────────────────
      // Va ANTES de tocar la red: mientras haya una tarjeta de confirmación
      // en pantalla, un "sí, confirmo" o un "cancelar" son la respuesta a ESA
      // pregunta concreta (la que el usuario está viendo), no un mensaje
      // nuevo para el modelo. Queda intrínsecamente ligado a esa operación:
      // se pulsa el botón de la tarjeta vigente, con su token, y no hay forma
      // de que un "sí" suelto autorice una operación distinta — si la
      // confirmación caducó o se limpió (cambio de tema, /limpiar), aquí ya
      // no hay nada que confirmar y el texto sigue su camino normal.
      const pendiente = confirmacionRef.current
      if (pendiente) {
        const decision = resolverComoConfirmacion(limpio)
        if (decision) {
          const responder = (respuesta) => {
            aplicarMensajes((prev) => [...prev, { rol: 'user', texto: limpio }, { rol: 'model', texto: respuesta }])
            // Si la confirmación llegó dictada, la respuesta también se dice
            // en voz alta: contestar "sí, confirmo" y recibir solo silencio
            // hasta que termine el envío deja al usuario sin saber si le
            // entendió.
            if (vozRef.current.debeHablar(porVoz)) {
              vozRef.current.reiniciar()
              vozRef.current.encolarTexto(respuesta)
              vozRef.current.finalizar()
            }
          }
          if (decision === 'confirmar') {
            responder('Autorización confirmada. Ejecutando…')
            await confirmarAccionRef.current?.()
          } else {
            descartarConfirmacionRef.current?.()
            responder('Operación cancelada. No se ejecutó nada.')
          }
          return
        }
      }

      peticionRef.current?.abort()
      const controlador = new AbortController()
      peticionRef.current = controlador

      const hablar = vozRef.current.debeHablar(porVoz)

      // Cierra lo que hubiera quedado a medias de una respuesta cancelada: su
      // burbuja seguiría marcada como `streaming` y pintando el cursor
      // parpadeante para siempre, porque el camino de cancelación sale sin
      // pasar por el cierre normal. Lo que alcanzó a decir se conserva (es
      // información real que el usuario ya leyó); lo que no llegó a nada se
      // descarta para no dejar una burbuja vacía.
      const previos = mensajesRef.current
        .filter((m) => !(m.streaming && !m.texto))
        .map((m) => (m.streaming ? { rol: m.rol, texto: m.texto } : m))

      aplicarMensajes([...previos, { rol: 'user', texto: limpio }, { rol: 'model', texto: '', streaming: true }])
      setError('')
      setCargando(true)
      setBorrador(null)
      setErrorBorrador('')
      // Una confirmación pendiente muere en cuanto se pregunta otra cosa: el
      // token del servidor sigue vivo unos minutos, pero dejar el botón en
      // pantalla después de cambiar de tema es la receta para que alguien lo
      // pulse creyendo que confirma lo último que dijo.
      setConfirmacion(null)
      setErrorConfirmacion('')
      if (hablar) vozRef.current.reiniciar()

      try {
        const resultado = await copiloto.chat(limpio, conversacionIdRef.current, {
          signal: controlador.signal,
          onDelta: (trozo) => {
            aplicarMensajes((prev) => {
              const copia = [...prev]
              const ultimo = copia[copia.length - 1]
              copia[copia.length - 1] = { ...ultimo, texto: ultimo.texto + trozo }
              return copia
            })
            if (hablar) vozRef.current.encolarTexto(trozo)
          },
          onAccion: (evento) => {
            if (evento.accion === 'requerimiento_compra_borrador') setBorrador(evento.datos)
          },
          // La ruta viene del servidor, ya resuelta contra los permisos reales
          // de este usuario (ver copiloto.navegacion.js) — este componente no
          // decide a dónde se puede ir, solo ejecuta. Y aunque llegara una
          // ruta indebida, los guardas de App.jsx (PermissionRoute /
          // ModuloActivoRoute) siguen siendo los que deciden si se pinta.
          onNavegacion: (evento) => {
            if (evento.ruta) navigate(evento.ruta)
          },
          onConfirmacion: (evento) => {
            setConfirmacion(evento)
            setErrorConfirmacion('')
            // Una confirmación EXIGE ver qué se va a hacer antes de decir que
            // sí. Si la pregunta entró por voz con el chat cerrado, el usuario
            // oiría "¿quieres continuar?" sin tener dónde pulsar, así que aquí
            // el chat se abre solo: es exactamente el caso que el diseño de
            // voz reserva para abrirlo (acción que requiere interacción
            // visual), no una excepción a esa regla.
            abrirConEfecto()
          },
        })
        conversacionIdRef.current = resultado.conversacionId
        // Cierra la burbuja: quitar `streaming` es lo único que hace falta,
        // porque el texto ya se fue acumulando trozo a trozo. Antes aquí se
        // reemplazaban TODOS los mensajes por el historial del servidor, que
        // es lo que hacía parpadear la conversación entera al terminar cada
        // respuesta.
        aplicarMensajes((prev) => {
          const copia = [...prev]
          const ultimo = copia[copia.length - 1]
          if (ultimo?.streaming) copia[copia.length - 1] = { rol: ultimo.rol, texto: ultimo.texto }
          return copia
        })
        if (hablar) vozRef.current.finalizar()
      } catch (err) {
        // Cancelada por otra pregunta: no es un error que mostrar, y la
        // interfaz ya está pintando la petición nueva.
        if (err.name === 'AbortError') return
        aplicarMensajes([...previos, { rol: 'user', texto: limpio }])
        setError(err.message || 'No se pudo consultar a Skynet')
        if (hablar) vozRef.current.detener()
        throw err // el asistente de voz lo necesita para pasar a estado ERROR
      } finally {
        if (peticionRef.current === controlador) {
          peticionRef.current = null
          setCargando(false)
        }
      }
    },
    [aplicarMensajes, navigate, abrirConEfecto]
  )

  // Camino de las preguntas dictadas. Además de enviarlas, atiende el único
  // comando de interfaz que se resuelve sin red: "abre Skynet" abre el chat en
  // el acto, sin esperar a que el servidor conteste nada.
  const enviarPorVoz = useCallback(
    (texto, opciones) => {
      if (PATRON_ABRIR_CHAT.test(normalizarComando(texto))) abrirConEfecto()
      return enviarTexto(texto, { ...opciones, porVoz: true })
    },
    [abrirConEfecto, enviarTexto]
  )

  // El asistente de voz recibe `enviarPorVoz` y ya no hace su propia petición
  // (antes mantenía un historial paralelo que divergía del de este widget).
  const asistenteVoz = useVoiceAssistant({ onPregunta: enviarPorVoz })
  const { voz, microfono } = asistenteVoz

  // `enviarTexto` no puede depender de `voz`: el hook que produce `voz` recibe
  // a `enviarTexto` como argumento, así que depender de él cerraría un ciclo.
  // El espejo por ref le da acceso al valor vigente sin entrar en la lista de
  // dependencias. Se asigna durante el render (no en un efecto) para que nunca
  // vaya un render por detrás.
  const vozRef = useRef(voz)
  vozRef.current = voz

  // Preferencia personal de "leer avisos en voz" (PreferenciaIA.voz.activo,
  // ver modules/ia). Se carga una sola vez al montar: por defecto es
  // true (avisar por voz automáticamente es el comportamiento elegido para
  // Skynet), así que hasta que responda el servidor se asume true en vez de
  // esperar en silencio.
  const vozAvisosIARef = useRef(true)
  useEffect(() => {
    // Sin el widget del copiloto no hay dónde mostrar/hablar un aviso: se
    // gatea también en 'copiloto' además de 'ia' (el módulo dueño del canal
    // de entrega), no solo en 'ia'.
    if (!moduloActivo('ia') || !moduloActivo('copiloto')) return
    let cancelado = false
    iaApi
      .preferencias()
      .then((prefs) => {
        if (!cancelado) vozAvisosIARef.current = prefs.voz.activo
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Avisos proactivos (nuevo requerimiento, nuevo daño...) — ver
  // useAvisosIA.js. Se pintan como burbujas normales del asistente (mismo
  // `rol:'model'` que cualquier respuesta) y, si la voz está permitida y no
  // hay una respuesta del chat hablándose en este momento, se leen en voz
  // automáticamente sin que el usuario haya preguntado nada.
  const onAvisosIA = useCallback(
    (avisos) => {
      aplicarMensajes((prev) => [
        ...prev,
        ...avisos.map((a) => ({ rol: 'model', texto: a.cuerpo ? `${a.titulo}. ${a.cuerpo}` : a.titulo })),
      ])
      const puedeHablar = vozAvisosIARef.current && vozRef.current.soportado && !peticionRef.current
      if (puedeHablar) {
        vozRef.current.reiniciar()
        for (const a of avisos) vozRef.current.encolarTexto(a.cuerpo ? `${a.titulo}. ${a.cuerpo}` : a.titulo)
        vozRef.current.finalizar()
      }
    },
    [aplicarMensajes]
  )
  useAvisosIA({ activo: moduloActivo('ia') && moduloActivo('copiloto'), onAvisos: onAvisosIA })

  if (!moduloActivo('copiloto')) return null

  function enviar(e) {
    e?.preventDefault?.()
    if (cargando) return
    const texto = entrada.trim()
    if (!texto) return
    setEntrada('')
    // enviarTexto relanza el error para que el asistente de voz pueda pasar a
    // estado ERROR; por la ruta de texto el error ya quedó en el banner del
    // chat, así que aquí solo hay que evitar la promesa rechazada suelta.
    enviarTexto(texto).catch(() => {})
  }

  const limpiarHistorial = () => {
    aplicarMensajes([])
    setError('')
    setBorrador(null)
    setErrorBorrador('')
    setConfirmacion(null)
    setErrorConfirmacion('')
    // Suelta también el hilo del servidor: "limpiar" tiene que borrar lo que
    // el modelo recuerda, no solo lo que se ve en pantalla. Sin esto, el chat
    // aparecía vacío pero el asistente seguía respondiendo con el contexto de
    // la conversación anterior. El siguiente mensaje abre un hilo nuevo.
    conversacionIdRef.current = null
    peticionRef.current?.abort()
    voz.detener()
  }

  const descartarBorrador = () => {
    setBorrador(null)
    setErrorBorrador('')
  }

  const descartarConfirmacion = () => {
    setConfirmacion(null)
    setErrorConfirmacion('')
  }
  descartarConfirmacionRef.current = descartarConfirmacion

  // Único camino por el que una acción marcada como destructiva llega a
  // ejecutarse. No pasa por Gemini: manda el token que emitió el servidor a un
  // endpoint que no consulta al modelo (ver copiloto.confirmaciones.js).
  async function confirmarAccion() {
    setEnviandoConfirmacion(true)
    setErrorConfirmacion('')
    try {
      const resultado = await copiloto.confirmarAccion(confirmacion.token)
      setConfirmacion(null)
      // Algunas herramientas (ver protocolo de despliegue) devuelven un
      // resumen propio en `resultado.mensaje` — p. ej. conteos de envío que
      // el usuario necesita ver tal cual, no una frase genérica. El resto
      // sigue mostrando el mismo texto de siempre porque su resultado no
      // trae ese campo.
      const texto = resultado?.resultado?.mensaje || 'Listo, la acción quedó ejecutada.'
      aplicarMensajes((prev) => [...prev, { rol: 'model', texto }])
      if (vozRef.current.vozActiva && vozRef.current.soportado) {
        vozRef.current.reiniciar()
        vozRef.current.encolarTexto(texto)
        vozRef.current.finalizar()
      }
    } catch (err) {
      setErrorConfirmacion(err.message || 'No se pudo ejecutar la acción')
    } finally {
      setEnviandoConfirmacion(false)
    }
  }
  confirmarAccionRef.current = confirmarAccion

  async function confirmarBorrador() {
    setEnviandoBorrador(true)
    setErrorBorrador('')
    try {
      await copiloto.crearRequerimientoCompra(borrador)
      setBorrador(null)
      aplicarMensajes((prev) => [
        ...prev,
        { rol: 'model', texto: 'Listo, tu requerimiento de compra quedó registrado y notificado a Financiero.' },
      ])
    } catch (err) {
      setErrorBorrador(err.message || 'No se pudo guardar el requerimiento')
    } finally {
      setEnviandoBorrador(false)
    }
  }

  const alternarWake = () => {
    asistenteVoz.alternarWake()
  }

  const cerrar = () => {
    setAbierto(false)
    asistenteVoz.cancelarVoz()
  }

  return (
    <>
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
          alturaTeclado={esMovil ? alturaTeclado : 0}
          onClose={cerrar}
          mensajes={mensajes}
          entrada={entrada}
          setEntrada={setEntrada}
          onEnviar={enviar}
          cargando={cargando}
          error={error || asistenteVoz.errorMensaje}
          onLimpiarHistorial={limpiarHistorial}
          vozSoportada={microfono.soportado}
          escuchando={microfono.capturandoPregunta}
          pidiendoPermisoMicrofono={microfono.pidiendoPermiso}
          parcialVoz={microfono.parcial}
          onMicrofono={asistenteVoz.activarMicrofono}
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
          borrador={borrador}
          onConfirmarBorrador={confirmarBorrador}
          onDescartarBorrador={descartarBorrador}
          enviandoBorrador={enviandoBorrador}
          errorBorrador={errorBorrador}
          confirmacion={confirmacion}
          onConfirmarAccion={confirmarAccion}
          onDescartarConfirmacion={descartarConfirmacion}
          enviandoConfirmacion={enviandoConfirmacion}
          errorConfirmacion={errorConfirmacion}
        />

        <div className="flex justify-end touch-none" onPointerDown={(e) => dragControls.start(e)}>
          <CopilotoButton
            isOpen={abierto}
            onClick={() => (abierto ? cerrar() : abrirConEfecto())}
            state={asistenteVoz.estadoVoz}
            rmsRef={asistenteVoz.rmsRef}
            badgeText="Skynet • Arrastra para mover"
            size={70}
          />
        </div>
      </motion.div>
    </>
  )
}
