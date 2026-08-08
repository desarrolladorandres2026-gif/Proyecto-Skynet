import React, { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Trash2,
  Bot,
  User,
  CornerDownLeft,
  Zap,
  Mic,
  MicOff,
  Ear,
  Volume2,
  VolumeX,
  AudioLines,
  Play,
  Check,
  MessageSquare,
  Wand2,
  Square,
  Cpu,
  ShieldAlert,
} from 'lucide-react'
import { CopilotoAnimatedIcon } from './CopilotoAnimatedIcon'
import { Popover, PopoverTrigger, PopoverContent } from '../Popover.jsx'
import { CopilotoBorradorRequerimiento } from './CopilotoBorradorRequerimiento.jsx'
import { CopilotoConfirmacion } from './CopilotoConfirmacion.jsx'
import { cn } from '../../lib/cn'

/**
 * CopilotoChatCard - Tarjeta Neumórfica #212121 para Skynet IA
 *
 * Características Estéticas:
 * - Base Neumórfica en #212121 con doble sombra suave relieve 3D.
 * - Sin nombre "JARVIS" (marca oficial: SKYNET AI / CORE).
 * - Utiliza exactamente el MISMO ícono animado vectorial (`CopilotoAnimatedIcon`) del botón flotante.
 * - Acentos de luz Neón Cian adaptados perfectamente a la estética del botón.
 * - Entradas y botones con relieve háptico cian/oscuro de alta definición.
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
  borrador = null,
  onConfirmarBorrador,
  onDescartarBorrador,
  enviandoBorrador = false,
  errorBorrador = '',
  confirmacion = null,
  onConfirmarAccion,
  onDescartarConfirmacion,
  enviandoConfirmacion = false,
  errorConfirmacion = '',
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
          initial={{ opacity: 0, scale: 0.88, y: 25 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.88, y: 25 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-3 flex h-[35rem] w-[calc(100vw-2rem)] max-w-[390px] flex-col overflow-hidden neumorphic-skynet-card z-50 select-text font-sans p-5"
        >
          {/* ============================================================ */}
          {/* ENCABEZADO NEUMÓRFICO CON ÍCONO ANIMADO DEL BOTÓN */}
          {/* ============================================================ */}
          <header className="flex shrink-0 items-center justify-between border-b border-cyan-500/20 pb-3 pt-1">
            {/* Asa de arrastre con el MISMO diseño de botón flotante de Skynet */}
            <div
              onPointerDown={onIniciarArrastre}
              className="flex flex-1 min-w-0 cursor-grab touch-none items-center gap-3.5 active:cursor-grabbing group"
            >
              {/* Miniatura exacta del Botón de Skynet */}
              <div className="relative shrink-0 flex items-center justify-center p-1 rounded-full bg-transparent drop-shadow-[0_0_20px_rgba(34,211,238,0.7)] group-hover:drop-shadow-[0_0_30px_rgba(34,211,238,0.95)] group-hover:scale-105 transition-all duration-300">
                <CopilotoAnimatedIcon size={44} speed="normal" showPulseRing={true} />
                <span className="absolute top-0 right-0 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-400 border-2 border-[#212121]"></span>
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black tracking-widest text-cyan-300 font-mono uppercase drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]">
                    SKYNET AI
                  </h2>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                  </span>
                </div>
                <p className="text-[10px] text-cyan-400/70 font-mono truncate flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-cyan-400 inline" />
                  <span>SISTEMA DE ASISTENCIA VIRTUAL</span>
                </p>
              </div>
            </div>

            {/* Acciones de la Tarjeta */}
            <div className="flex items-center gap-1.5 shrink-0">
              {hablando && onCallar && (
                <button
                  type="button"
                  onClick={onCallar}
                  title="Detener lectura"
                  className="rounded-xl p-2 text-cyan-300 neumorphic-button text-xs"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              )}

              {sintesisSoportada && onAlternarVoz && (
                <button
                  type="button"
                  onClick={onAlternarVoz}
                  title={vozActiva ? 'Respuestas habladas activadas' : 'Respuestas habladas desactivadas'}
                  className={cn(
                    'rounded-xl p-2 text-xs transition-all neumorphic-button',
                    vozActiva ? 'text-cyan-300 border-cyan-400/40 shadow-[0_0_10px_rgba(34,211,238,0.3)]' : 'text-slate-400'
                  )}
                >
                  {vozActiva ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                </button>
              )}

              {vozSoportada && onAlternarWake && (
                <button
                  type="button"
                  onClick={onAlternarWake}
                  disabled={pidiendoPermisoMicrofono}
                  title={wakeActivo ? 'Desactivar Oye Skynet' : 'Activar Oye Skynet'}
                  className={cn(
                    'relative rounded-xl p-2 text-xs transition-all neumorphic-button',
                    wakeActivo ? 'text-cyan-300 border-cyan-400/50 shadow-[0_0_12px_rgba(34,211,238,0.4)]' : 'text-slate-400'
                  )}
                >
                  <Ear className="h-3.5 w-3.5" />
                  {wakeActivo && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                    </span>
                  )}
                </button>
              )}

              {sintesisSoportada && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title="Ajustes de Voz"
                      className="rounded-xl p-2 text-xs text-slate-400 hover:text-cyan-300 neumorphic-button"
                    >
                      {modoRespuesta === 'texto' ? (
                        <MessageSquare className="h-3.5 w-3.5" />
                      ) : (
                        <AudioLines className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 max-h-80 overflow-y-auto p-2 bg-[#1a1a1a] border border-cyan-500/30 text-cyan-100 shadow-2xl backdrop-blur-xl rounded-2xl">
                    {onElegirModoRespuesta && (
                      <>
                        <p className="px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                          Respuestas de Skynet
                        </p>
                        {[
                          { valor: 'auto', icono: Wand2, titulo: 'Automático', detalle: 'Solo si preguntas por voz' },
                          { valor: 'voz', icono: Volume2, titulo: 'Habladas', detalle: 'Lee siempre en voz alta' },
                          { valor: 'texto', icono: MessageSquare, titulo: 'Escritas', detalle: 'Nunca lee en voz alta' },
                        ].map(({ valor, icono: Icono, titulo, detalle }) => (
                          <button
                            key={valor}
                            type="button"
                            onClick={() => onElegirModoRespuesta(valor)}
                            className={cn(
                              'flex w-full items-start gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors',
                              modoRespuesta === valor
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                                : 'hover:bg-[#252525] text-slate-300'
                            )}
                          >
                            <Icono className="h-3.5 w-3.5 shrink-0 mt-0.5 text-cyan-400" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-semibold leading-tight">{titulo}</span>
                              <span className="block text-[10px] text-slate-400 leading-tight">{detalle}</span>
                            </span>
                            {modoRespuesta === valor && <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-cyan-300" />}
                          </button>
                        ))}
                        <div className="my-1.5 border-t border-slate-800" />
                      </>
                    )}

                    {voces.length > 0 && onElegirVoz && (
                      <>
                        <p className="px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                          Voz del Asistente
                        </p>
                        {voces.map((v) => (
                          <div
                            key={v.voiceURI}
                            role="button"
                            tabIndex={0}
                            onClick={() => onElegirVoz(v.voiceURI)}
                            className={cn(
                              'flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs cursor-pointer transition-colors',
                              v.voiceURI === vozElegidaURI
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                                : 'hover:bg-[#252525] text-slate-300'
                            )}
                          >
                            {v.voiceURI === vozElegidaURI ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
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
                                title="Escuchar voz"
                                className="shrink-0 rounded-md p-1 text-slate-400 hover:text-cyan-300"
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

              {mensajes.length > 0 && onLimpiarHistorial && (
                <button
                  type="button"
                  onClick={onLimpiarHistorial}
                  title="Limpiar chat"
                  className="rounded-xl p-2 text-xs text-slate-400 hover:text-cyan-300 neumorphic-button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar chat de Skynet"
                className="rounded-xl p-2 text-xs text-slate-400 hover:text-red-400 neumorphic-button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* ============================================================ */}
          {/* CUERPO DEL CHAT NEUMÓRFICO (#212121) */}
          {/* ============================================================ */}
          <div className="flex-1 space-y-3.5 overflow-y-auto py-4 px-1 custom-scrollbar relative z-10">
            {mensajes.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-4 px-2 space-y-4">
                {/* Reemplazo del SVG por el diseño del Botón de Skynet */}
                <div className="relative shrink-0 flex items-center justify-center p-2 rounded-full bg-transparent drop-shadow-[0_0_25px_rgba(34,211,238,0.8)] hover:scale-105 transition-transform duration-300">
                  <CopilotoAnimatedIcon size={64} speed="normal" showPulseRing={true} />
                  <span className="absolute top-1 right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-400 border-2 border-[#212121]"></span>
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-wide font-mono text-cyan-200 uppercase">
                    Skynet AI // En línea
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed font-sans">
                    Asistente para compras, mantenimiento, reportes corporativos y datos del sistema.
                  </p>
                </div>

                {/* Sugerencias Rápidas Neumórficas */}
                <div className="w-full space-y-2 pt-2">
                  <p className="text-[10px] uppercase font-mono font-bold tracking-wider text-cyan-400 flex items-center justify-center gap-1">
                    <Zap className="w-3 h-3 text-cyan-400 animate-bounce" /> Preguntas sugeridas
                  </p>
                  <div className="flex flex-col gap-2">
                    {suguerenciasRapidas.map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSugerenciaClick(sug)}
                        className="text-left text-xs px-4 py-2.5 rounded-2xl transition-all neumorphic-button text-cyan-100 flex items-center justify-between group"
                      >
                        <span>{sug}</span>
                        <CornerDownLeft className="w-3.5 h-3.5 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Mensajes del Chat */}
            {mensajes
              .filter((m) => m.texto || m.rol === 'user')
              .map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn('flex gap-2.5', m.rol === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {m.rol !== 'user' && (
                    <div className="w-7 h-7 rounded-2xl bg-[#1a1a1a] border border-cyan-400/40 text-cyan-300 flex items-center justify-center shrink-0 mt-1 shadow-md">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm whitespace-pre-wrap leading-relaxed shadow-lg',
                      m.rol === 'user'
                        ? // Usuario: Sello Neumórfico
                          'bg-[#282828] text-white border border-cyan-500/30 rounded-br-xs font-medium'
                        : // Skynet IA: Panel Cibernético Neumórfico
                          'bg-[#1a1a1a] text-cyan-100 border border-cyan-400/20 rounded-bl-xs shadow-[0_0_15px_rgba(6,182,212,0.12)] border-l-2 border-l-cyan-400'
                    )}
                  >
                    {m.texto}
                  </div>

                  {m.rol === 'user' && (
                    <div className="w-7 h-7 rounded-2xl bg-[#2a2a2a] text-slate-300 border border-slate-700 flex items-center justify-center shrink-0 mt-1 shadow-md">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </motion.div>
              ))}

            {cargando && !mensajes[mensajes.length - 1]?.texto && (
              <div className="flex items-center gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-2xl bg-[#1a1a1a] border border-cyan-400/50 text-cyan-300 flex items-center justify-center shrink-0 animate-pulse">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-[#1a1a1a] border border-cyan-500/30 px-3.5 py-2 text-xs text-cyan-300 shadow-md font-mono">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                  <span>Procesando consulta cibernética…</span>
                </div>
              </div>
            )}

            <div ref={finRef} />
          </div>

          {wakeActivo && !error && (
            <div className="shrink-0 border-t border-cyan-500/20 bg-[#181818] px-3 py-1.5 text-[10px] text-cyan-300 font-mono flex items-center gap-1.5 rounded-xl mb-2">
              <Volume2 className="h-3 w-3 shrink-0 text-cyan-400 animate-pulse" />
              {parcialVoz ? (
                <span className="italic truncate">"{parcialVoz}"</span>
              ) : (
                <span>Escuchando pasivamente: "Oye Skynet"</span>
              )}
            </div>
          )}

          <CopilotoBorradorRequerimiento
            borrador={borrador}
            onConfirmar={onConfirmarBorrador}
            onDescartar={onDescartarBorrador}
            enviando={enviandoBorrador}
            error={errorBorrador}
          />

          <CopilotoConfirmacion
            confirmacion={confirmacion}
            onConfirmar={onConfirmarAccion}
            onDescartar={onDescartarConfirmacion}
            enviando={enviandoConfirmacion}
            error={errorConfirmacion}
          />

          {error && (
            <div className="shrink-0 border-t border-red-500/30 bg-red-950/60 px-3 py-1.5 text-xs text-red-300 flex items-center gap-2 font-mono rounded-xl mb-2">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>Error: {error}</span>
            </div>
          )}

          {/* ============================================================ */}
          {/* PIE / FORMULARIO DE ENTRADA CON ENTRADA NEUMÓRFICA HÁPTICA */}
          {/* ============================================================ */}
          <form onSubmit={onEnviar} className="flex shrink-0 items-center gap-2 pt-2 border-t border-cyan-500/20">
            {vozSoportada && onMicrofono && (
              <button
                type="button"
                onClick={onMicrofono}
                disabled={cargando || escuchando || pidiendoPermisoMicrofono}
                title="Preguntar por voz"
                aria-label="Micrófono"
                className={cn(
                  'h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center transition-all neumorphic-button',
                  escuchando ? 'text-red-400 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse' : 'text-cyan-300'
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
                className="w-full rounded-2xl neumorphic-inset-input px-4 py-2.5 text-xs sm:text-sm text-cyan-50 placeholder-cyan-700/60 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 transition-all font-sans"
                disabled={cargando}
              />
            </div>

            <button
              type="submit"
              disabled={cargando || !entrada.trim()}
              aria-label="Enviar mensaje"
              className={cn(
                'h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center transition-all neumorphic-button',
                entrada.trim() && !cargando
                  ? 'text-cyan-300 border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.5)] active:scale-95'
                  : 'text-slate-600 cursor-not-allowed'
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
