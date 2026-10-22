import { useRef, useState } from 'react'
import { ImagePlus, Upload, Check } from 'lucide-react'
import { toast } from 'sonner'
import { sitioWebApi } from '../../api/sitioWeb.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { useValorDiferido } from '../../hooks/useValorDiferido.js'
import { cn } from '../../lib/cn.js'
import { Btn, ErrorMsg, Input, Modal, Pager } from '../../components/ui.jsx'

const ACEPTA = 'image/jpeg,image/png,image/webp,image/gif'
const MAX_BYTES = 8 * 1024 * 1024

// Modal para elegir una imagen de la biblioteca del sitio o subir una nueva.
// Al subir, la imagen queda elegida de inmediato. `onElegir` recibe
// { id, url, miniatura }.
export function SelectorImagen({ abierto, onCerrar, onElegir }) {
  const [busqueda, setBusqueda] = useState('')
  const [page, setPage] = useState(1)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const entradaRef = useRef(null)

  const buscar = useValorDiferido(busqueda.trim())
  const { data, cargando, error: errorLista, recargar } = useDatosConCache(
    `sitioweb:medios:${JSON.stringify({ buscar, page })}`,
    () => sitioWebApi.listarMedios({ page, limit: 24, buscar }),
    { ttlMs: 30_000 }
  )
  const medios = data?.medios || []

  async function subir(archivo) {
    setError('')
    if (!archivo) return
    if (!ACEPTA.split(',').includes(archivo.type)) return setError('Sube una imagen JPG, PNG, WebP o GIF.')
    if (archivo.size > MAX_BYTES) return setError('La imagen supera el máximo de 8 MB.')
    setSubiendo(true)
    try {
      const { medio } = await sitioWebApi.subirImagen(archivo)
      toast.success('Imagen subida a la biblioteca del sitio')
      onElegir(medio)
    } catch (err) {
      setError(err.message)
      recargar()
    } finally {
      setSubiendo(false)
      if (entradaRef.current) entradaRef.current.value = ''
    }
  }

  return (
    <Modal abierto={abierto} titulo="Elegir imagen" onCerrar={subiendo ? () => {} : onCerrar} ancho="max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setPage(1) }}
          placeholder="Buscar en la biblioteca…"
          className="sm:max-w-xs"
        />
        <input ref={entradaRef} type="file" accept={ACEPTA} className="sr-only" id="subir-imagen-sitio" onChange={(e) => subir(e.target.files?.[0])} disabled={subiendo} />
        <Btn onClick={() => entradaRef.current?.click()} disabled={subiendo}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          {subiendo ? 'Subiendo…' : 'Subir imagen nueva'}
        </Btn>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">JPG, PNG, WebP o GIF · máximo 8 MB</span>
      </div>

      <ErrorMsg>{error || errorLista}</ErrorMsg>

      {cargando && !data ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Cargando biblioteca…</p>
      ) : medios.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No hay imágenes. Sube la primera.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {medios.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onElegir(m)}
                disabled={subiendo}
                className={cn('group relative block aspect-square w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-800 dark:bg-slate-900')}
                title={m.titulo}
              >
                <img src={m.miniatura} alt={m.alt || m.titulo} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                <span className="absolute inset-0 hidden items-center justify-center bg-brand-600/60 text-white group-hover:flex group-focus-visible:flex">
                  <Check className="h-6 w-6" aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} pages={data?.totalPaginas || 1} onPage={setPage} />
    </Modal>
  )
}

// Campo de formulario: muestra la imagen elegida con acciones de cambiar/quitar.
export function CampoImagen({ imagenUrl, onCambiar, onQuitar, deshabilitado }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div>
      {imagenUrl ? (
        <img src={imagenUrl} alt="Imagen elegida" className="mb-2 aspect-video w-full max-w-sm rounded-lg border border-slate-200 object-cover dark:border-slate-800" />
      ) : (
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Sin imagen.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Btn variante="secundario" onClick={() => setAbierto(true)} disabled={deshabilitado}>
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
          {imagenUrl ? 'Cambiar imagen' : 'Elegir o subir imagen'}
        </Btn>
        {imagenUrl && (
          <Btn variante="fantasma" onClick={onQuitar} disabled={deshabilitado}>Quitar</Btn>
        )}
      </div>
      {/* Se monta solo abierto: la biblioteca no se pide hasta que hace falta. */}
      {abierto && (
        <SelectorImagen
          abierto
          onCerrar={() => setAbierto(false)}
          onElegir={(m) => {
            setAbierto(false)
            onCambiar(m)
          }}
        />
      )}
    </div>
  )
}
