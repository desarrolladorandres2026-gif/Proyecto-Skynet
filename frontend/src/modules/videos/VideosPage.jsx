import { useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { videosApi } from '../../api/videos.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { useValorDiferido } from '../../hooks/useValorDiferido.js'
import { cn } from '../../lib/cn.js'
import { ErrorMsg, Field, Input, Pager, Select, fmtFecha } from '../../components/ui.jsx'
import { VideoMiniatura } from '../../components/videos/VideoMiniatura.jsx'
import { VideoReproductor } from '../../components/videos/VideoReproductor.jsx'

const POR_PAGINA = 12

function ChipCategoria({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
        activo
          ? 'bg-brand-600 text-white dark:bg-brand-500'
          : 'text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800'
      )}
    >
      {children}
    </button>
  )
}

// Historial de videos publicados ("Ver todos los videos"). Lista plana con
// líneas finas entre filas, sin tarjetas: la miniatura es el único elemento
// con presencia visual propia.
export default function VideosPage() {
  const [filtros, setFiltros] = useState({ categoria: '', orden: 'recientes', desde: '', hasta: '', busqueda: '', page: 1 })
  const [reproduciendo, setReproduciendo] = useState(null)

  // Cambiar cualquier filtro vuelve a la primera página en el MISMO estado: si
  // no, se pediría un instante la página 3 de un resultado que ahora solo
  // tiene una.
  const cambiar = (cambio) => setFiltros((f) => ({ ...f, ...cambio, page: 1 }))
  const { categoria, orden, desde, hasta, busqueda, page } = filtros
  const q = useValorDiferido(busqueda.trim())

  const { data: catData } = useDatosConCache('videos:categorias', () => videosApi.categorias(), { ttlMs: 5 * 60_000 })
  const categorias = catData?.categorias || []

  const clave = `videos:lista:${JSON.stringify({ categoria, orden, desde, hasta, q, page })}`
  const { data, cargando, error } = useDatosConCache(
    clave,
    () => videosApi.listar({ page, limit: POR_PAGINA, categoria, orden, desde, hasta, q }),
    { ttlMs: 60_000 }
  )
  const videos = data?.videos || []
  const hayFiltros = Boolean(categoria || desde || hasta || q)

  function limpiarFiltros() {
    cambiar({ categoria: '', desde: '', hasta: '', busqueda: '' })
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex items-center gap-2.5">
        <Clapperboard className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Videos informativos</h1>
      </div>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Comunicados y capacitaciones del Terminal, del más reciente al más antiguo.
      </p>

      <ErrorMsg>{error}</ErrorMsg>

      {categorias.length > 0 && (
        <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por categoría o comité">
          <ChipCategoria activo={!categoria} onClick={() => cambiar({ categoria: '' })}>Todas</ChipCategoria>
          {categorias.map((c) => (
            <ChipCategoria key={c} activo={categoria === c} onClick={() => cambiar({ categoria: c })}>{c}</ChipCategoria>
          ))}
        </div>
      )}

      <div className="mb-2 grid gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-800/80 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <Field label="Buscar">
          <Input type="search" placeholder="Título o descripción…" value={busqueda} onChange={(e) => cambiar({ busqueda: e.target.value })} />
        </Field>
        <Field label="Desde">
          <Input type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiar({ desde: e.target.value })} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiar({ hasta: e.target.value })} />
        </Field>
        <Field label="Orden">
          <Select value={orden} onChange={(e) => cambiar({ orden: e.target.value })}>
            <option value="recientes">Más recientes primero</option>
            <option value="antiguos">Más antiguos primero</option>
          </Select>
        </Field>
      </div>

      {cargando && !data ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Cargando videos…</p>
      ) : videos.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>{hayFiltros ? 'No hay videos que coincidan con los filtros.' : 'Aún no hay videos publicados.'}</p>
          {hayFiltros && (
            <button type="button" onClick={limpiarFiltros} className="mt-2 font-medium text-brand-700 hover:underline dark:text-brand-300">
              Quitar filtros
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
          {videos.map((v) => (
            <li key={v.id} className="grid gap-3 py-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <VideoMiniatura video={v} onClick={() => setReproduciendo(v)} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="panel-mono text-[11px] uppercase tracking-wide text-brand-700 dark:text-brand-300">{v.categoria}</span>
                  <span className="panel-mono text-[11px] text-slate-500 dark:text-slate-400">{fmtFecha(v.fechaPublicacion)}</span>
                  {v.esNuevo && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
                      Nuevo video
                    </span>
                  )}
                </div>
                <h2 className="mt-1.5 text-base font-semibold leading-snug text-slate-900 dark:text-white">
                  <button type="button" onClick={() => setReproduciendo(v)} className="text-left hover:text-brand-700 dark:hover:text-brand-300">
                    {v.titulo}
                  </button>
                </h2>
                {v.descripcion && (
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{v.descripcion}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager page={data?.page || 1} pages={data?.pages || 1} onPage={(p) => setFiltros((f) => ({ ...f, page: p }))} />

      <VideoReproductor video={reproduciendo} onCerrar={() => setReproduciendo(null)} />
    </div>
  )
}
