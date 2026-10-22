import { useRef, useState } from 'react'
import { Images, Upload, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { sitioWebApi } from '../../api/sitioWeb.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { useValorDiferido } from '../../hooks/useValorDiferido.js'
import { cn } from '../../lib/cn.js'
import { Btn, ErrorMsg, Field, Input, Pager, fmtFecha } from '../../components/ui.jsx'
import { EncabezadoSeccion } from './comun.jsx'

const ACEPTA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_BYTES = 8 * 1024 * 1024

export default function MediosPage() {
  const [busqueda, setBusqueda] = useState('')
  const [page, setPage] = useState(1)
  const [subiendo, setSubiendo] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [errorSubida, setErrorSubida] = useState('')
  const entradaRef = useRef(null)

  const buscar = useValorDiferido(busqueda.trim())
  const { data, cargando, error, recargar } = useDatosConCache(
    `sitioweb:medios:${JSON.stringify({ buscar, page })}`,
    () => sitioWebApi.listarMedios({ page, limit: 24, buscar }),
    { ttlMs: 30_000 }
  )
  const medios = data?.medios || []

  // Sube de una en una: cada archivo se valida en el servidor por su contenido
  // real, y un fallo en uno no debe tirar a los demás.
  async function subir(archivos) {
    setErrorSubida('')
    const lista = Array.from(archivos || [])
    if (!lista.length) return
    setSubiendo(true)
    let subidas = 0
    const fallos = []
    for (const archivo of lista) {
      if (!ACEPTA.includes(archivo.type)) {
        fallos.push(`${archivo.name}: formato no compatible`)
      } else if (archivo.size > MAX_BYTES) {
        fallos.push(`${archivo.name}: supera 8 MB`)
      } else {
        try {
          await sitioWebApi.subirImagen(archivo)
          subidas++
        } catch (err) {
          fallos.push(`${archivo.name}: ${err.message}`)
        }
      }
    }
    setSubiendo(false)
    if (entradaRef.current) entradaRef.current.value = ''
    if (subidas) {
      toast.success(subidas === 1 ? 'Imagen subida' : `${subidas} imágenes subidas`)
      setPage(1)
      await recargar()
    }
    if (fallos.length) setErrorSubida(fallos.join(' · '))
  }

  async function copiar(url) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Dirección de la imagen copiada')
    } catch {
      toast.error('No se pudo copiar. Selecciona la dirección manualmente.')
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <EncabezadoSeccion
        icono={Images}
        titulo="Biblioteca de imágenes"
        descripcion="Las imágenes del sitio web. Sube las nuevas aquí y elígelas después en noticias, eventos y avisos."
      >
        <input ref={entradaRef} type="file" accept={ACEPTA.join(',')} multiple className="sr-only" onChange={(e) => subir(e.target.files)} disabled={subiendo} />
        <Btn onClick={() => entradaRef.current?.click()} disabled={subiendo}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          {subiendo ? 'Subiendo…' : 'Subir imágenes'}
        </Btn>
      </EncabezadoSeccion>

      <ErrorMsg>{error || errorSubida}</ErrorMsg>

      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); subir(e.dataTransfer.files) }}
        className={cn(
          'mb-5 rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition-colors',
          arrastrando ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400'
        )}
      >
        Arrastra aquí tus imágenes · JPG, PNG, WebP o GIF · máximo 8 MB cada una
      </div>

      <div className="mb-4 border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
        <Field label="Buscar" className="sm:max-w-md">
          <Input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPage(1) }} placeholder="Nombre de la imagen…" />
        </Field>
      </div>

      {cargando && !data ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Cargando biblioteca…</p>
      ) : medios.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">{buscar ? 'No hay imágenes con ese nombre.' : 'La biblioteca está vacía.'}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {medios.map((m) => (
            <li key={m.id} className="panel-card overflow-hidden rounded-xl">
              <div className="aspect-square bg-slate-100 dark:bg-slate-900">
                <img src={m.miniatura} alt={m.alt || m.titulo} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200" title={m.titulo}>{m.titulo || '(sin nombre)'}</p>
                <p className="panel-mono text-[10px] text-slate-500 dark:text-slate-400">
                  {m.ancho && m.alto ? `${m.ancho}×${m.alto} · ` : ''}{fmtFecha(m.fecha)}
                </p>
                <Btn variante="fantasma" className="-ml-2 mt-1 !px-2 !py-0.5 !text-xs" onClick={() => copiar(m.url)}>
                  <Copy className="h-3 w-3" aria-hidden="true" /> Copiar dirección
                </Btn>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} pages={data?.totalPaginas || 1} onPage={setPage} />
    </div>
  )
}
