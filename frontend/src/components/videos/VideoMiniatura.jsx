import { useState } from 'react'
import { Clapperboard, Play } from 'lucide-react'
import { urlArchivoVideo } from '../../api/videos.js'
import { cn } from '../../lib/cn.js'

// Miniatura de un video con su botón de reproducción. Es un <button> completo
// (no solo el icono) para que toda la imagen sea el objetivo del toque. Orden:
//  1. la imagen de miniatura (subida, o la automática de YouTube);
//  2. si es un video subido al VPS sin miniatura propia, un fotograma del
//     propio video (#t=1 + preload="metadata": el navegador pide solo los
//     bytes necesarios por rango, no el archivo completo);
//  3. si nada de eso carga, un fondo neutro con icono: la miniatura es
//     contenido multimedia, no un contenedor decorativo.
export function VideoMiniatura({ video, onClick, className = '', botonGrande = false }) {
  const [fallo, setFallo] = useState(false)
  const conImagen = Boolean(video.miniaturaUrl) && !fallo
  const conFotograma = !video.miniaturaUrl && video.proveedor === 'local' && !fallo

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Reproducir video: ${video.titulo}`}
      className={cn(
        'sup-oscura group relative block aspect-video w-full overflow-hidden rounded-xl bg-slate-900 text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel-bg)]',
        className
      )}
    >
      {conImagen ? (
        <img
          src={video.miniaturaUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFallo(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : conFotograma ? (
        <video
          src={`${urlArchivoVideo(video)}#t=1`}
          preload="metadata"
          muted
          playsInline
          tabIndex={-1}
          aria-hidden="true"
          onError={() => setFallo(true)}
          className="pointer-events-none h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <Clapperboard className="absolute inset-0 m-auto h-8 w-8 text-slate-600" aria-hidden="true" />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-white/90 text-brand-700 shadow-lg transition-transform duration-200 group-hover:scale-110',
            botonGrande ? 'h-14 w-14' : 'h-10 w-10'
          )}
        >
          <Play className={cn('ml-0.5 fill-current', botonGrande ? 'h-6 w-6' : 'h-4 w-4')} aria-hidden="true" />
        </span>
      </span>
    </button>
  )
}
