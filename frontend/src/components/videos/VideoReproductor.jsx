import { useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { urlArchivoVideo } from '../../api/videos.js'
import { Btn, Modal, fmtFecha } from '../ui.jsx'

// El navegador solo permite autoplay tras un gesto del usuario; abrir este
// modal ES ese gesto (el click en la miniatura), así que se pide autoplay
// para que el video arranque sin un segundo clic.
function conAutoplay(embedUrl) {
  try {
    const url = new URL(embedUrl)
    url.searchParams.set('autoplay', '1')
    return url.toString()
  } catch {
    return embedUrl
  }
}

// Video subido al VPS o enlace directo a un .mp4: <video> nativo. El servidor
// responde por rangos, así que se puede adelantar sin esperar la descarga.
// Si el navegador no sabe decodificarlo (típico: un .mov de iPhone en HEVC
// visto en Chrome de Windows), se dice claramente y se ofrece descargarlo en
// vez de dejar un reproductor negro sin explicación.
function PantallaNativa({ src, titulo }) {
  const [noCompatible, setNoCompatible] = useState(false)
  if (noCompatible) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-slate-200">No se pudo reproducir este video en este navegador (formato no compatible o archivo no disponible).</p>
        <a href={src} download={titulo} className="inline-flex items-center gap-1.5 text-sm font-medium text-white underline">
          <Download className="h-4 w-4" aria-hidden="true" />
          Descargar el video
        </a>
      </div>
    )
  }
  return <video src={src} controls autoPlay playsInline preload="metadata" onError={() => setNoCompatible(true)} className="h-full w-full" />
}

function Pantalla({ video }) {
  if (video.proveedor === 'youtube' || video.proveedor === 'vimeo') {
    return (
      <iframe
        src={conAutoplay(video.embedUrl)}
        title={video.titulo}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full"
      />
    )
  }
  if (video.proveedor === 'local') return <PantallaNativa src={urlArchivoVideo(video)} titulo={video.titulo} />
  if (video.proveedor === 'archivo') return <PantallaNativa src={video.embedUrl} titulo={video.titulo} />
  return null
}

// Reproductor dentro de Skynet (modal). Videos subidos, YouTube, Vimeo y
// archivos directos se reproducen sin sacar a la persona de la plataforma; un
// enlace externo no se puede incrustar, así que ofrece abrirlo en una pestaña
// nueva. Al cerrarse el modal el contenido se desmonta y la reproducción se
// detiene.
export function VideoReproductor({ video, onCerrar }) {
  const incrustable = video && video.proveedor !== 'externo'

  return (
    <Modal abierto={Boolean(video)} titulo={video?.titulo || 'Video'} onCerrar={onCerrar} ancho="max-w-4xl">
      {video && (
        <div>
          {incrustable ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <Pantalla key={video.id} video={video} />
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 py-2">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Este video está alojado en otro sitio y no se puede reproducir aquí.
              </p>
              <a href={video.url} target="_blank" rel="noopener noreferrer">
                <Btn>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Abrir video en una pestaña nueva
                </Btn>
              </a>
            </div>
          )}

          <p className="panel-mono mt-4 text-[11px] uppercase tracking-wide text-brand-700 dark:text-brand-300">
            {video.categoria} · {fmtFecha(video.fechaPublicacion)}
          </p>
          {video.descripcion && (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">{video.descripcion}</p>
          )}
        </div>
      )}
    </Modal>
  )
}
