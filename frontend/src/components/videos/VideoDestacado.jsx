import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { videosApi } from '../../api/videos.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { fmtFecha } from '../ui.jsx'
import { VideoMiniatura } from './VideoMiniatura.jsx'
import { VideoReproductor } from './VideoReproductor.jsx'

// Sección del inicio con el video informativo más recientemente publicado.
//
// Se diseña como parte de la página, no como una tarjeta: sin fondo ni borde
// propios, separada del resto por espacio y una línea fina. El layout responde
// al ANCHO DEL CONTENEDOR (@container), no al de la ventana: en el panel
// denso ocupa todo el ancho, en el inicio móvil vive dentro de una columna
// angosta, y en ambos casos debe elegir sola entre "lado a lado" y "apilado".
//
// Falla en silencio a propósito: si no hay videos publicados (respuesta
// `video: null`), el módulo está apagado (403) o la red falla, la sección
// simplemente no existe — un problema con los videos nunca debe romper ni
// ensuciar el inicio.
export default function VideoDestacado({ className = '' }) {
  const { data } = useDatosConCache('videos:destacado', () => videosApi.destacado(), { ttlMs: 60_000 })
  const [reproduciendo, setReproduciendo] = useState(null)

  const video = data?.video
  if (!video) return null

  return (
    <section aria-labelledby="video-destacado-titulo" className={`@container ${className}`}>
      <div className="grid items-center gap-4 border-b border-slate-200/80 pb-5 dark:border-slate-800/80 @2xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] @2xl:gap-8">
        <VideoMiniatura video={video} onClick={() => setReproduciendo(video)} botonGrande />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="panel-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-700 dark:text-brand-300">
              Video informativo
            </span>
            {video.esNuevo && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500 motion-safe:animate-pulse" aria-hidden="true" />
                Nuevo video
              </span>
            )}
          </div>

          <h2 id="video-destacado-titulo" className="mt-2 text-lg font-bold leading-snug tracking-tight text-slate-900 dark:text-white @2xl:text-xl">
            {video.titulo}
          </h2>

          {video.descripcion && (
            <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{video.descripcion}</p>
          )}

          <p className="panel-mono mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
            {video.categoria} · {fmtFecha(video.fechaPublicacion)}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => setReproduciendo(video)}
              className="panel-btn-primario inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium"
            >
              Ver video
            </button>
            <Link
              to="/videos"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-600 dark:text-brand-300 dark:hover:text-brand-200"
            >
              Ver todos los videos
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      <VideoReproductor video={reproduciendo} onCerrar={() => setReproduciendo(null)} />
    </section>
  )
}
