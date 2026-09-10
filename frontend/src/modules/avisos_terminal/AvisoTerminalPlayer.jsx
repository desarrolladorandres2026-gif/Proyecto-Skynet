import { useCallback, useEffect, useRef, useState } from 'react'
import { Volume2, Square, RotateCcw, Megaphone } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { avisosTerminal } from '../../api/avisosTerminal.js'
import { useAvisosTerminalPendientes } from './useAvisosTerminalPendientes.js'
import { useAnuncioVoz } from './useAnuncioVoz.js'

// Cuánto queda visible el banner tras terminar de hablar antes de
// desaparecer solo (si no hay otro aviso encolado detrás) — suficiente para
// leer el texto una vez más o pulsar "Repetir" sin tener que ir a "Mis
// avisos" para reescucharlo.
const GRACIA_TRAS_TERMINAR_MS = 6000
// Respiro entre un aviso y el siguiente si llegan varios encolados: evita que
// se sientan como un solo audio corrido sin separación.
const RESPIRO_ENTRE_AVISOS_MS = 900

// Reproductor global de "Avisos Terminal de Neiva": vive montado en
// AppShell.jsx (junto a CopilotoWidget y PushOnboardingPrompt), así que
// funciona igual para cualquier rol y en ambos shells (panel denso de
// escritorio y MobileShell) sin que ninguna pantalla tenga que acordarse de
// incluirlo. Es la mitad "destinatario" del flujo: detecta avisos pendientes
// (polling + puente del Service Worker), los reproduce en orden (campanita ->
// pausa -> voz) y confirma entregado/reproducido contra el backend.
//
// Se siente como un anuncio oficial, no como un chat: una sola barra
// institucional de ancho completo, sin tarjetas ni subcontenedores.
export default function AvisoTerminalPlayer() {
  const { usuario, moduloActivo } = useAuth()
  const activo = Boolean(usuario) && moduloActivo('avisos_terminal')

  const { reproducir, reintentar, detener: detenerVoz, fase } = useAnuncioVoz()
  const [entregaActual, setEntregaActual] = useState(null)
  const [estadoVisual, setEstadoVisual] = useState('inactivo') // 'reproduciendo' | 'bloqueado' | 'finalizado'

  const colaRef = useRef([])
  const procesadosRef = useRef(new Set())
  const procesandoRef = useRef(false)
  // true mientras el banner muestra "Toca para escuchar" (bloqueado por
  // autoplay) esperando el gesto del usuario. Sin esto, un aviso nuevo que
  // llega por polling/push mientras se espera ese toque encontraba
  // procesandoRef en false (el intento bloqueado ya lo había apagado) y
  // arrancaba la cola de inmediato, PISANDO entregaActual con el aviso
  // nuevo — el bloqueado quedaba marcado 'entregado' pero nunca
  // 'reproducido' y desaparecía de la cola sin que nadie lo escuchara.
  const esperandoGestoRef = useRef(false)
  const graciaRef = useRef(null)

  const limpiarGracia = useCallback(() => {
    if (graciaRef.current) {
      clearTimeout(graciaRef.current)
      graciaRef.current = null
    }
  }, [])

  // Único punto que decide "qué sigue" tras CUALQUIER intento de reproducir
  // (automático, reintento por bloqueo de autoplay, o "Repetir"): si queda
  // algo en cola avanza a lo siguiente, si no deja el banner en 'finalizado'
  // con su ventana de gracia. Centralizarlo evita que los tres call-sites
  // (automático/reintento/repetir) diverjan en cuándo se limpia el estado.
  const avanzarOFinalizar = useCallback(() => {
    procesandoRef.current = false
    if (colaRef.current.length > 0) {
      setTimeout(procesarSiguienteRef.current, RESPIRO_ENTRE_AVISOS_MS)
      return
    }
    setEstadoVisual('finalizado')
    graciaRef.current = setTimeout(() => {
      setEntregaActual(null)
      setEstadoVisual('inactivo')
    }, GRACIA_TRAS_TERMINAR_MS)
  }, [])

  // Ref porque avanzarOFinalizar y procesarSiguiente se necesitan mutuamente
  // (la cola sigue avanzando sola) sin formar un ciclo de dependencias de
  // useCallback.
  const procesarSiguienteRef = useRef(() => {})

  const procesarSiguiente = useCallback(async () => {
    if (procesandoRef.current) return
    const siguiente = colaRef.current.shift()
    if (!siguiente) return

    procesandoRef.current = true
    limpiarGracia()
    setEntregaActual(siguiente)
    setEstadoVisual('reproduciendo')

    // Confirmar "entregado" apenas se decide mostrarlo/reproducirlo — no hace
    // falta esperar a que termine de hablar (mismo criterio que "recibido"
    // del requisito de estados).
    avisosTerminal.confirmarEstadoEntrega(siguiente._id, 'entregado').catch(() => {})

    let resultado
    try {
      resultado = await reproducir({ textoLocucion: siguiente.aviso.textoLocucion, avisoId: siguiente.aviso._id })
    } catch {
      // Cualquier fallo inesperado en la cadena de audio (campanita, fetch
      // del audio institucional, síntesis local) NUNCA debe dejar la cola
      // congelada esperando una promesa que ya no va a resolver — sin este
      // catch, procesandoRef.current se quedaba en true para siempre y
      // ningún aviso nuevo volvía a sonar solo hasta recargar la app (el
      // bug real reportado: "el aviso queda pendiente hasta reabrir").
      resultado = { completado: false, bloqueadoPorAutoplay: false }
    }

    if (resultado.bloqueadoPorAutoplay) {
      // El navegador no dejó que la voz arrancara sola (sin gesto reciente):
      // se detiene la cola automática y se pide un toque — ese clic ya
      // cuenta como gesto, así que el reintento manual siempre podrá sonar.
      esperandoGestoRef.current = true
      setEstadoVisual('bloqueado')
      procesandoRef.current = false
      return
    }

    if (resultado.completado) {
      avisosTerminal.confirmarEstadoEntrega(siguiente._id, 'reproducido').catch(() => {})
    }
    avanzarOFinalizar()
  }, [avanzarOFinalizar, limpiarGracia, reproducir])

  procesarSiguienteRef.current = procesarSiguiente

  const onPendientes = useCallback((entregas) => {
    const nuevas = entregas.filter((e) => !procesadosRef.current.has(e._id))
    if (!nuevas.length) return
    for (const e of nuevas) procesadosRef.current.add(e._id)
    colaRef.current.push(...nuevas)
    // No auto-avanzar mientras se espera el toque de "Escuchar" del aviso
    // bloqueado actual: lo nuevo se queda en cola detrás de él.
    if (!procesandoRef.current && !esperandoGestoRef.current) procesarSiguienteRef.current()
  }, [])

  useAvisosTerminalPendientes({ activo, onPendientes })

  useEffect(() => () => limpiarGracia(), [limpiarGracia])

  // El clic de "Escuchar" (tras un bloqueo de autoplay) SÍ es un gesto real
  // del usuario: el audio puede arrancar solo esta vez. reintentar() repite
  // el ÚLTIMO intento del hook (mismo avisoId, así que si había audio
  // institucional generado, lo vuelve a pedir en vez de cambiar a la voz
  // local a mitad de camino).
  const reintentarConGesto = useCallback(() => {
    if (!entregaActual || procesandoRef.current) return
    esperandoGestoRef.current = false
    procesandoRef.current = true
    setEstadoVisual('reproduciendo')
    reintentar()
      .then((resultado) => {
        if (resultado.completado) {
          avisosTerminal.confirmarEstadoEntrega(entregaActual._id, 'reproducido').catch(() => {})
        }
      })
      .catch(() => {}) // ver el catch de procesarSiguiente: nunca dejar la cola congelada
      .finally(() => avanzarOFinalizar())
  }, [avanzarOFinalizar, entregaActual, reintentar])

  const repetir = useCallback(() => {
    if (!entregaActual || procesandoRef.current) return
    limpiarGracia()
    procesandoRef.current = true
    setEstadoVisual('reproduciendo')
    reintentar()
      .catch(() => {})
      .finally(() => avanzarOFinalizar())
  }, [avanzarOFinalizar, entregaActual, limpiarGracia, reintentar])

  const detenerTodo = useCallback(() => {
    limpiarGracia()
    detenerVoz()
    // Detener a mitad de la locución cuenta como "recibido y atendido": no
    // debe reaparecer en el siguiente polling pidiendo reproducirse solo.
    if (entregaActual) avisosTerminal.confirmarEstadoEntrega(entregaActual._id, 'reproducido').catch(() => {})
    colaRef.current = []
    procesandoRef.current = false
    esperandoGestoRef.current = false
    setEntregaActual(null)
    setEstadoVisual('inactivo')
  }, [detenerVoz, entregaActual, limpiarGracia])

  if (!activo || !entregaActual || estadoVisual === 'inactivo') return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[70] border-b border-white/10 bg-gradient-to-r from-brand-800 via-brand-700 to-brand-800 text-white shadow-lg"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
          <Megaphone className="h-4.5 w-4.5" aria-hidden="true" />
          {estadoVisual === 'reproduciendo' && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-400" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="panel-mono text-[10px] tracking-[0.15em] text-white/70 uppercase">
            {estadoVisual === 'bloqueado'
              ? 'Aviso institucional — toca para escuchar'
              : estadoVisual === 'reproduciendo' && fase === 'campanita'
                ? 'Aviso institucional'
                : 'Terminal de Transportes de Neiva informa que:'}
          </p>
          <p className="truncate text-sm font-medium text-white sm:whitespace-normal">{entregaActual.aviso.texto}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {estadoVisual === 'bloqueado' ? (
            <button
              type="button"
              onClick={reintentarConGesto}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/25"
            >
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              Escuchar
            </button>
          ) : (
            <>
              {estadoVisual === 'finalizado' && (
                <button
                  type="button"
                  onClick={repetir}
                  aria-label="Repetir aviso"
                  title="Repetir aviso"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={detenerTodo}
                aria-label="Detener aviso"
                title="Detener"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
