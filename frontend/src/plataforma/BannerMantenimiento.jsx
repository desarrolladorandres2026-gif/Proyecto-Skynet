import { useEffect, useState } from 'react'
import { CalendarClock, X, AlertTriangle } from 'lucide-react'
import { usePlataforma, useCuentaRegresiva, formatearRestante, formatearFechaHora } from './PlataformaContext.jsx'
import './mantenimiento.css'

const CLAVE_DESCARTE = 'skynet_banner_mantenimiento_descartado'
const MS_MINUTO = 60_000

// ─────────────────────────────────────────────────────────────────────────────
// Política de reaparición del aviso (decidida, 2026-08-22)
// ─────────────────────────────────────────────────────────────────────────────
// El requisito pide dos cosas en tensión directa: que el aviso "se vea desde
// cualquier módulo" y que "no interrumpa innecesariamente el trabajo". No hay
// una respuesta técnicamente correcta; esta es una decisión de producto tomada
// a propósito, no un valor por defecto que nadie miró.
//
// `descartadoEn`      -> momento (ms) en que la persona cerró el aviso, o null.
// `minutosParaInicio` -> cuánto falta para que empiece el mantenimiento.
// Devuelve true si el aviso debe estar visible ahora.
//
// REGLA: el descarte vale hasta que falten 15 minutos; a partir de ahí el
// aviso vuelve y ya no se puede cerrar (ver esDescartable). El criterio es que
// cerrar significa "ya me enteré", no "no me avises nunca": el costo de perder
// trabajo sin guardar es mucho mayor que el de una franja de 40px durante los
// últimos minutos.
//
// Se descartaron explícitamente:
//   - Descarte permanente por ventana: quien cierra el aviso a las 9am y
//     trabaja hasta las 10pm no recibiría ningún recordatorio dentro de la app.
//   - Escalonado 60/15/5: tres interrupciones garantizadas por ventana; más
//     ruido del que justifica el beneficio.
//   - Expiración fija por tiempo: se desacopla de la urgencia real (puede
//     reaparecer con 6 horas por delante y callar en los últimos 10 minutos).
//
// ── De dónde sale el umbral ─────────────────────────────────────────────────
// NO de un literal aquí. El umbral es el mismo que usa el backend para mandar
// el push/correo de "entra en mantenimiento en N minutos", y viaja en cada
// respuesta de GET /api/plataforma/estado (campo `avisoPrevioMin`, ver
// plataforma.dto.js). Así el banner se vuelve obligatorio exactamente cuando
// sale la notificación, aunque en el VPS se cambie
// PLATAFORMA_AVISO_PREVIO_MIN — una divergencia que ninguna prueba podría
// detectar, porque ese valor vive en un .env fuera del repositorio.
//
// Este valor solo se usa como red de seguridad en la ventana de un despliegue
// en la que el frontend ya es nuevo y el backend todavía no manda el campo.
// Debe coincidir con el default de Backend/src/config/env.js; hay una prueba
// que lo verifica (BannerMantenimiento.test.js) para que no se separen.
export const MIN_AVISO_PREVIO_POR_DEFECTO = 15

// `descartadoEn`      -> momento (ms) en que la persona cerró el aviso, o null.
// `minutosParaInicio` -> cuánto falta para que empiece el mantenimiento.
// `umbralMin`         -> antelación del aviso previo que reporta el backend.
// Devuelve true si el aviso debe estar visible ahora.
//
// Nota sobre precisión: `minutosParaInicio` viene de Math.floor, así que el
// valor `umbralMin` cubre todo su minuto ([15:00, 15:59] cuando el umbral es
// 15). En la práctica el banner se fija hasta 59s ANTES de que salga la
// notificación. Es un desfase deliberado y en la dirección segura — el aviso
// visual nunca llega tarde respecto al push — y no se corrige a milisegundos
// para no cambiar el comportamiento ya validado.
export function debeMostrarBanner(descartadoEn, minutosParaInicio, umbralMin = MIN_AVISO_PREVIO_POR_DEFECTO) {
  if (minutosParaInicio !== null && minutosParaInicio <= umbralMin) return true
  return descartadoEn === null
}

// El aviso es descartable solo mientras falte tiempo; en la recta final se
// vuelve fijo (coherente con la política de arriba: si va a reaparecer sí o
// sí, ofrecer una "X" que no hace nada sería mentirle a la persona).
export function esDescartable(minutosParaInicio, umbralMin = MIN_AVISO_PREVIO_POR_DEFECTO) {
  return minutosParaInicio === null || minutosParaInicio > umbralMin
}

export default function BannerMantenimiento() {
  const { estado, hayProgramado, ahoraServidor } = usePlataforma()
  const restante = useCuentaRegresiva(estado?.scheduledStart)
  const [descartadoEn, setDescartadoEn] = useState(null)

  const inicio = estado?.scheduledStart
  const claveVentana = inicio ? `${CLAVE_DESCARTE}:${inicio}` : null

  // El descarte se guarda con la HORA DE INICIO en la clave: si un
  // administrador reprograma el mantenimiento, la clave cambia y el aviso
  // vuelve a aparecer aunque la persona ya lo hubiera cerrado — que es lo
  // correcto, porque la información que descartó ya no es la vigente.
  //
  // sessionStorage y no localStorage: el descarte dura lo que dure la pestaña.
  // Volver a abrir Skynet es un momento natural para volver a informar.
  useEffect(() => {
    if (!claveVentana) return setDescartadoEn(null)
    try {
      const guardado = sessionStorage.getItem(claveVentana)
      setDescartadoEn(guardado ? Number(guardado) : null)
    } catch {
      // Modo incógnito / almacenamiento bloqueado: sin persistencia el aviso
      // simplemente reaparece al recargar. Degradar así es preferible a que
      // el componente reviente.
      setDescartadoEn(null)
    }
  }, [claveVentana])

  if (!hayProgramado || !inicio) return null

  const minutosParaInicio = restante === null ? null : Math.floor(restante / MS_MINUTO)

  // Fuente única de verdad: la antelación la decide el backend y viaja en el
  // estado. El literal solo entra si el backend es anterior a este campo.
  const umbral = estado.avisoPrevioMin ?? MIN_AVISO_PREVIO_POR_DEFECTO

  if (!debeMostrarBanner(descartadoEn, minutosParaInicio, umbral)) return null

  const inminente = minutosParaInicio !== null && minutosParaInicio <= umbral
  const descartable = esDescartable(minutosParaInicio, umbral)

  function descartar() {
    const ahora = ahoraServidor()
    setDescartadoEn(ahora)
    try {
      if (claveVentana) sessionStorage.setItem(claveVentana, String(ahora))
    } catch {
      /* sin persistencia: se descarta solo para esta vista */
    }
  }

  return (
    <div
      // role="status" y no "alert": un alert interrumpe al lector de pantalla
      // en mitad de lo que esté leyendo. Esto es información importante, pero
      // no una emergencia que justifique cortarle la frase a alguien.
      role="status"
      className={`mant-banner relative mb-4 rounded-xl border p-3.5 sm:px-4 sm:py-3 transition-all ${
        inminente
          ? 'border-amber-500/45 bg-amber-500/15'
          : 'border-amber-500/25 bg-amber-500/[0.07]'
      }`}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-x-4 sm:gap-y-2">
        <div className="flex items-center justify-between gap-2 sm:contents">
          <span className="flex items-center gap-2 text-amber-700 dark:text-amber-300 shrink-0">
            {inminente ? (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="text-sm font-semibold">
              {inminente ? 'Mantenimiento a punto de comenzar' : 'Mantenimiento programado'}
            </span>
          </span>

          {descartable && (
            <button
              type="button"
              onClick={descartar}
              aria-label="Ocultar aviso de mantenimiento"
              className="sm:order-last shrink-0 rounded-lg p-1 text-amber-700/70 transition-colors hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-300/70 dark:hover:text-amber-200"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <span className="min-w-0 flex-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed break-words">
          {estado.message || (
            <>
              Skynet no estará disponible desde el <strong>{formatearFechaHora(inicio)}</strong>
              {estado.scheduledEnd && <> hasta el <strong>{formatearFechaHora(estado.scheduledEnd)}</strong></>}.
            </>
          )}
          {estado.reason && (
            <span className="text-slate-500 dark:text-slate-400"> · {estado.reason}</span>
          )}
        </span>

        {restante !== null && (
          <span className="panel-mono shrink-0 self-start sm:self-auto rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] sm:text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-200">
            comienza en {formatearRestante(restante)}
          </span>
        )}
      </div>
    </div>
  )
}
