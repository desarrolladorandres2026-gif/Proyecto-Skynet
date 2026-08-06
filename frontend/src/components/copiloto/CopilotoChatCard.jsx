import React, { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Send, Loader2, Trash2, Bot, User, CornerDownLeft, Zap, Mic, MicOff, Ear, Volume2, VolumeX, AudioLines, Play, Check, MessageSquare, Wand2, Square } from 'lucide-react'
import { CopilotoAnimatedIcon } from './CopilotoAnimatedIcon'
import { Popover, PopoverTrigger, PopoverContent } from '../Popover.jsx'
import { cn } from '../../lib/cn'

/**
 * CopilotoChatCard - Tarjeta Futurista de Chat IA en armonía con el Botón Animado
 *
 * Características Estéticas:
 * - Glassmorphism traslúcido con resplandor neón cian/azul adaptado a Modo Claro y Oscuro.
 * - Cabezal con versión miniatura del ícono animado giratorio.
 * - Chips de sugerencias rápidas e interactivas.
 * - Burbujas de mensajes estilizadas cibernéticamente (Gradientes de usuario + Marcos neón de IA).
 * - Indicador de estado "Pensando" con onda de energía.
 */
export function CopilotoChatCard({
  isOpen,
  onClose,
  mensajes = [],
  entrada = '',
  setEntrada,
  onEnviar,
  cargando = false,
  error = '',
  onLimpiarHistorial,
  // Voz (ver useReconocimientoVoz.js / useHablar.js). Todo opcional: si el
  // navegador no soporta la Web Speech API (Firefox, Safari a medias) los
  // controles no se pintan y el chat funciona igual escribiendo.
  vozSoportada = false,
  escuchando = false,
  pidiendoPermisoMicrofono = false,
  parcialVoz = '',
  onMicrofono,
  wakeActivo = false,
  onAlternarWake,
  hablando = false,
  onCallar,
  voces = [],
  vozElegidaURI = '',
  onElegirVoz,
  onProbarVoz,
  sintesisSoportada = false,
  modoRespuesta = 'auto',
  onElegirModoRespuesta,
  vozActiva = true,
  onAlternarVoz,
  // Arranca el arrastre del widget completo (ver CopilotoWidget.jsx: usa
  // dragControls de framer-motion en vez de `drag` sobre toda la tarjeta,
  // precisamente para que el cuerpo del chat se pueda seleccionar con el
  // mouse en vez de mover la ventana).
  onIniciarArrastre,
}) {
  const finRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      finRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [mensajes, isOpen, cargando])

  // Preguntas que SIEMPRE puede responder: las herramientas de solo lectura
  // cubren lo propio de cada usuario (ver Backend/copiloto.herramientas.js).
  // No se sugiere nada que implique una acción (crear, aprobar): el copiloto
  // solo consulta.
  const suguerenciasRapidas = [
    '¿Cómo va mi último requerimiento?',
    '¿Qué tengo pendiente hoy?',
    '¿En qué van los daños que reporté?',
  ]

  const handleSugerenciaClick = (texto) => {
    setEntrada(texto)
    inputRef.current?.focus()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'mb-3 flex h-[30rem] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-3xl shadow-2xl backdrop-blur-2xl transition-all duration-300 z-50 select-text',
            // Modo Oscuro: Vidrio cibernético cian
            'dark:bg-slate-950/90 dark:border dark:border-cyan-500/30 dark:shadow-[0_0_50px_rgba(6,182,212,0.2)]',
            // Modo Claro: Vidrio azul cielo elegante
            'bg-white/95 border border-sky-200/80 shadow-[0_20px_50px_rgba(2,132,199,0.18)] text-slate-900'
          )}
        >
          {/* ============================================================ */}
          {/* CABEZAL / HEADER CON ÍCONO GIRATORIO Y BADGE NEÓN */}
          {/* ============================================================ */}
          <header className="flex shrink-0 items-center justify-between border-b border-cyan-500/20 dark:border-cyan-500/30 px-5 py-3.5 bg-gradient-to-r from-cyan-500/10 via-transparent to-transparent">
            {/* Asa de arrastre: SOLO esta zona (ícono + nombre), sin ningún
                botón dentro — así nunca hay ambigüedad entre "arrastrar" y
                "hacer clic" para los controles de la derecha (cerrar, oye
                Skynet, limpiar). */}
            <div
              onPointerDown={onIniciarArrastre}
              className="flex flex-1 min-w-0 cursor-grab touch-none items-center gap-3 active:cursor-grabbing"
            >
              {/* Ícono animado miniatura en el header */}
              <div className="relative flex items-center justify-center">
                <CopilotoAnimatedIcon size={34} speed="slow" showPulseRing={false} />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-bold tracking-wide text-slate-900 dark:text-cyan-300">
                    Skynet
                  </span>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
                  </span>
                </div>
                <p className="text-[10px] font-mono text-slate-500 dark:text-cyan-400/70">
                  Asistente Virtual
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Detener la lectura EN CURSO. Distinto del interruptor de
                  abajo: esto corta la respuesta que se está leyendo ahora sin
                  cambiar la preferencia. Por eso usa un ícono de "detener" y
                  no un altavoz, que se confundiría con el interruptor. */}
              {hablando && onCallar && (
                <button
                  type="button"
                  onClick={onCallar}
                  title="Detener esta lectura"
                  aria-label="Detener la respuesta que se está leyendo"
                  className="rounded-xl p-1.5 text-cyan-500 hover:bg-cyan-500/15 dark:text-cyan-300 transition-colors"
                >
                  <Square className="h-4 w-4 fill-current" />
                </button>
              )}

              {/* Interruptor de un clic: ¿responde hablando o solo por
                  escrito? Es la preferencia de uso diario, así que va directo
                  en el encabezado y no dentro del panel (ahí quedan los
                  ajustes finos: automático vs. siempre, y cuál voz usar). */}
              {sintesisSoportada && onAlternarVoz && (
                <button
                  type="button"
                  onClick={onAlternarVoz}
                  title={vozActiva ? 'Respuestas habladas: activadas' : 'Respuestas habladas: desactivadas'}
                  aria-label={vozActiva ? 'Desactivar respuestas habladas' : 'Activar respuestas habladas'}
                  aria-pressed={vozActiva}
                  className={cn(
                    'rounded-xl p-1.5 transition-colors',
                    vozActiva
                      ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300'
                      : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300'
                  )}
                >
                  {vozActiva ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </button>
              )}

              {/* Interruptor de "Oye Skynet". Apagado por defecto: mientras
                  está encendido el micrófono queda abierto y Chrome transcribe
                  el audio en servidores de Google, así que debe ser una
                  decisión consciente del usuario, nunca el estado inicial. */}
              {vozSoportada && onAlternarWake && (
                <button
                  type="button"
                  onClick={onAlternarWake}
                  disabled={pidiendoPermisoMicrofono}
                  title={
                    pidiendoPermisoMicrofono
                      ? 'Esperando permiso del navegador…'
                      : wakeActivo
                        ? 'Desactivar "Oye Skynet" (micrófono abierto)'
                        : 'Activar "Oye Skynet"'
                  }
                  aria-label={wakeActivo ? 'Desactivar activación por voz' : 'Activar activación por voz'}
                  aria-pressed={wakeActivo}
                  className={cn(
                    'relative rounded-xl p-1.5 transition-colors',
                    wakeActivo
                      ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300'
                      : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-cyan-500/20 hover:text-cyan-600 dark:hover:text-cyan-300'
                  )}
                >
                  <Ear className="h-4 w-4" />
                  {wakeActivo && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                    </span>
                  )}
                </button>
              )}

              {/* Selector de voz: cuál suena mejor depende del equipo de cada
                  persona (varía qué voces trae instaladas cada sistema
                  operativo/navegador), así que se deja elegir en vez de fijar
                  una sola en el código. La elección se guarda en localStorage
                  (ver useHablar.js) y sobrevive a recargar la página. */}
              {sintesisSoportada && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title={
                        modoRespuesta === 'voz'
                          ? 'Respuestas habladas siempre'
                          : modoRespuesta === 'texto'
                            ? 'Respuestas solo escritas'
                            : 'Respuestas habladas solo si preguntas por voz'
                      }
                      aria-label="Preferencias de respuesta y voz"
                      className={cn(
                        'rounded-xl p-1.5 transition-colors',
                        // El modo mudo se resalta: es el único en el que el
                        // usuario podría extrañarse de no oír nada, así que
                        // conviene que se note sin abrir el panel.
                        modoRespuesta === 'texto'
                          ? 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                          : 'text-cyan-600/70 dark:text-cyan-300/70 hover:bg-cyan-500/15 hover:text-cyan-600 dark:hover:text-cyan-300'
                      )}
                    >
                      {modoRespuesta === 'texto' ? (
                        <MessageSquare className="h-4 w-4" />
                      ) : (
                        <AudioLines className="h-4 w-4" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 max-h-80 overflow-y-auto p-1.5">
                    {/* Cómo recibir las respuestas. El texto siempre aparece en
                        el chat; lo que se elige aquí es cuándo ADEMÁS se lee en
                        voz alta (ver debeHablar en useHablar.js). */}
                    {onElegirModoRespuesta && (
                      <>
                        <p className="px-2 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-cyan-400/70">
                          Respuestas
                        </p>
                        {[
                          { valor: 'auto', icono: Wand2, titulo: 'Automático', detalle: 'Habla solo si preguntas por voz' },
                          { valor: 'voz', icono: Volume2, titulo: 'Habladas', detalle: 'Lee siempre en voz alta' },
                          { valor: 'texto', icono: MessageSquare, titulo: 'Escritas', detalle: 'Nunca lee en voz alta' },
                        ].map(({ valor, icono: Icono, titulo, detalle }) => (
                          <button
                            key={valor}
                            type="button"
                            onClick={() => onElegirModoRespuesta(valor)}
                            aria-pressed={modoRespuesta === valor}
                            className={cn(
                              'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                              modoRespuesta === valor
                                ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                            )}
                          >
                            <Icono className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm leading-tight">{titulo}</span>
                              <span className="block text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                                {detalle}
                              </span>
                            </span>
                            {modoRespuesta === valor && <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                          </button>
                        ))}
                        <div className="my-1.5 border-t border-slate-200 dark:border-slate-700" />
                      </>
                    )}

                    {/* La lista solo aparece si el sistema tiene voces en
                        español instaladas; si no las hay, el navegador leerá
                        con su voz por defecto y no hay nada que elegir. */}
                    {voces.length > 0 && onElegirVoz && (
                      <>
                    <p className="px-2 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-cyan-400/70">
                      Voz de Skynet
                    </p>
                    {voces.map((v) => (
                      <div
                        key={v.voiceURI}
                        role="button"
                        tabIndex={0}
                        onClick={() => onElegirVoz(v.voiceURI)}
                        onKeyDown={(e) => e.key === 'Enter' && onElegirVoz(v.voiceURI)}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors',
                          v.voiceURI === vozElegidaURI
                            ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                        )}
                      >
                        {v.voiceURI === vozElegidaURI ? (
                          <Check className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <span className="w-3.5 shrink-0" />
                        )}
                        <span className="flex-1 truncate">{v.name}</span>
                        {onProbarVoz && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onProbarVoz(v.voiceURI)
                            }}
                            title="Escuchar esta voz"
                            aria-label={`Escuchar la voz ${v.name}`}
                            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-cyan-500/20 hover:text-cyan-600 dark:hover:text-cyan-300"
                          >
                            <Play className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                      </>
                    )}
                  </PopoverContent>
                </Popover>
              )}

              {/* Botón para limpiar chat */}
              {mensajes.length > 0 && onLimpiarHistorial && (
                <button
                  type="button"
                  onClick={onLimpiarHistorial}
                  title="Limpiar chat"
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-cyan-500/20 hover:text-cyan-600 dark:hover:text-cyan-300 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

              {/* Botón para cerrar */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar chat de Skynet"
                className="rounded-xl p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* ============================================================ */}
          {/* CUERPO DEL CHAT / ÁREA DE MENSAJES */}
          {/* ============================================================ */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar">
            {/* Estado Inicial Vacio: Presentación y Sugerencias */}
            {mensajes.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-4 px-2 space-y-4">
                <div className="p-3.5 rounded-full bg-cyan-500/10 dark:bg-cyan-400/15 border border-cyan-500/30 dark:shadow-[0_0_20px_rgba(34,211,238,0.3)]">
                  <Sparkles className="w-6 h-6 text-cyan-500 dark:text-cyan-300 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-cyan-200">
                    ¿En qué puedo ayudarte hoy?
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                    Consulta requerimientos, reportes de mantenimiento, ausencias o datos de tu módulo.
                  </p>
                </div>

                {/* Sugerencias Rápidas */}
                <div className="w-full space-y-2 pt-2">
                  <p className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400 dark:text-cyan-400/80 flex items-center justify-center gap-1">
                    <Zap className="w-3 h-3 text-cyan-400" /> Preguntas Sugeridas
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {suguerenciasRapidas.map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSugerenciaClick(sug)}
                        className="text-left text-xs px-3.5 py-2 rounded-2xl transition-all border border-slate-200 dark:border-cyan-500/20 bg-slate-50 dark:bg-slate-900/60 hover:border-cyan-400 dark:hover:border-cyan-400 hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10 text-slate-700 dark:text-cyan-100 flex items-center justify-between group shadow-sm"
                      >
                        <span>{sug}</span>
                        <CornerDownLeft className="w-3 h-3 text-slate-400 group-hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Renderizado de Mensajes. La burbuja del modelo aún vacía (el
                stream no ha emitido su primer trozo) no se pinta: en su lugar
                se ve el indicador de "Pensando…" de más abajo. */}
            {mensajes.filter((m) => m.texto || m.rol === 'user').map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn('flex gap-2.5', m.rol === 'user' ? 'justify-end' : 'justify-start')}
              >
                {/* Avatar de Skynet para mensajes de la IA */}
                {m.rol !== 'user' && (
                  <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shrink-0 mt-1 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                    <Bot className="w-4 h-4 text-cyan-500 dark:text-cyan-300" />
                  </div>
                )}

                {/* Burbuja de Mensaje */}
                <div
                  className={cn(
                    'max-w-[82%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm whitespace-pre-wrap leading-relaxed shadow-md',
                    m.rol === 'user'
                      ? // Usuario: Gradiente cian/azul vibrante
                        'bg-gradient-to-r from-cyan-600 to-sky-600 text-white rounded-br-xs shadow-cyan-900/20 font-medium'
                      : // Skynet: Marco neón con vidrio cibernético
                        'bg-slate-100/90 dark:bg-slate-900/90 text-slate-800 dark:text-cyan-50 border border-slate-200/80 dark:border-cyan-500/30 rounded-bl-xs dark:shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                  )}
                >
                  {m.texto}
                </div>

                {/* Avatar del Usuario */}
                {m.rol === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center shrink-0 mt-1 text-slate-600 dark:text-slate-300">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </motion.div>
            ))}

            {/* Estado Cargando/Pensando: solo hasta que llega el primer trozo
                del stream — a partir de ahí el propio texto que se escribe ya
                es la señal de que está respondiendo. */}
            {cargando && !mensajes[mensajes.length - 1]?.texto && (
              <div className="flex items-center gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shrink-0 animate-pulse">
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-slate-100 dark:bg-slate-900/90 border border-cyan-500/30 px-3.5 py-2 text-xs text-cyan-600 dark:text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                  <span className="font-mono text-[11px] animate-pulse">Procesando consulta cibernética…</span>
                </div>
              </div>
            )}

            <div ref={finRef} />
          </div>

          {/* Aviso de micrófono abierto: que el usuario NUNCA tenga dudas de
              cuándo se le está escuchando. Además muestra la transcripción
              EN VIVO de lo que el reconocedor va oyendo (no solo cuando ya
              detectó la activación): sin esto no hay forma de saber si el
              micrófono simplemente no oye nada, o si oye pero no reconoce
              "Skynet" — son problemas completamente distintos de diagnosticar. */}
          {wakeActivo && !error && (
            <div className="shrink-0 border-t border-cyan-500/20 bg-cyan-500/10 px-4 py-1.5 text-[10px] text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
              <Volume2 className="h-3 w-3 shrink-0 animate-pulse" />
              {parcialVoz ? (
                <span className="italic truncate">"{parcialVoz}"</span>
              ) : (
                <span>
                  Micrófono abierto, esperando <strong>"Oye Skynet"</strong>. Solo mientras esta pantalla esté activa.
                </span>
              )}
            </div>
          )}

          {/* Banner de Error */}
          {error && (
            <div className="shrink-0 border-t border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-600 dark:text-red-300 flex items-center gap-2">
              <span className="font-bold">Error:</span> {error}
            </div>
          )}

          {/* ============================================================ */}
          {/* PIE / FORMULARIO DE ENTRADA CON ESTILO CIBERNÉTICO */}
          {/* ============================================================ */}
          <form
            onSubmit={onEnviar}
            className="flex shrink-0 items-center gap-2 border-t border-cyan-500/20 dark:border-cyan-500/30 p-3 bg-gradient-to-b from-transparent to-slate-900/10 dark:to-slate-950/40"
          >
            {/* Pulsar para hablar: captura puntual, no deja el micrófono
                abierto (a diferencia del modo "Oye Skynet" del encabezado). */}
            {vozSoportada && onMicrofono && (
              <button
                type="button"
                onClick={onMicrofono}
                disabled={cargando || escuchando || pidiendoPermisoMicrofono}
                title={
                  pidiendoPermisoMicrofono
                    ? 'Esperando permiso del navegador…'
                    : escuchando
                      ? 'Escuchando…'
                      : 'Preguntar por voz'
                }
                aria-label={
                  pidiendoPermisoMicrofono ? 'Esperando permiso de micrófono' : escuchando ? 'Escuchando' : 'Preguntar por voz'
                }
                className={cn(
                  'h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center transition-all duration-300',
                  escuchando
                    ? 'bg-red-500/15 text-red-500 ring-2 ring-red-500/40 animate-pulse'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-600 disabled:opacity-50'
                )}
              >
                {pidiendoPermisoMicrofono ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : escuchando ? (
                  <Mic className="h-4 w-4" />
                ) : (
                  <MicOff className="h-4 w-4" />
                )}
              </button>
            )}

            <div className="relative flex-1 flex items-center">
              <input
                ref={inputRef}
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                placeholder={escuchando ? parcialVoz || 'Escuchando…' : 'Escribe tu consulta a Skynet…'}
                className="w-full rounded-2xl border border-slate-200 dark:border-cyan-500/30 bg-slate-100/80 dark:bg-slate-900/80 px-4 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-cyan-100 placeholder-slate-400 dark:placeholder-cyan-700/60 outline-none focus:border-cyan-400 dark:focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                disabled={cargando}
              />
            </div>

            <button
              type="submit"
              disabled={cargando || !entrada.trim()}
              aria-label="Enviar mensaje"
              className={cn(
                'h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-md',
                entrada.trim() && !cargando
                  ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white hover:shadow-[0_0_20px_rgba(6,182,212,0.6)] hover:scale-105 active:scale-95'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
