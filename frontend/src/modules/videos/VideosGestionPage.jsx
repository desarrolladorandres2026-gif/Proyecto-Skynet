import { useEffect, useMemo, useRef, useState } from 'react'
import { Clapperboard, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { videosApi } from '../../api/videos.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { useValorDiferido } from '../../hooks/useValorDiferido.js'
import { cn } from '../../lib/cn.js'
import { Badge, Btn, ErrorMsg, Field, Input, Modal, Pager, Textarea, fmtFecha, fmtFechaHora } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'
import { VideoMiniatura } from '../../components/videos/VideoMiniatura.jsx'
import { VideoReproductor } from '../../components/videos/VideoReproductor.jsx'

const POR_PAGINA = 20
// Lo que el backend acepta (ver videos.almacenamiento.js). La extensión va
// también porque Windows a veces no conoce el tipo de un .mov/.m4v.
const ACEPTA_VIDEO = 'video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg,.mp4,.webm,.mov,.m4v,.ogv'
const CLASE_INPUT_ARCHIVO =
  'block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 dark:text-slate-300 dark:file:text-brand-300'

function fmtBytes(bytes) {
  if (bytes == null) return ''
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB']
  let valor = bytes
  let i = 0
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024
    i++
  }
  return `${valor.toLocaleString('es-CO', { maximumFractionDigits: i >= 2 ? 1 : 0 })} ${unidades[i]}`
}

function fmtRestante(segundos) {
  if (!Number.isFinite(segundos) || segundos <= 0) return ''
  if (segundos < 60) return `≈ ${Math.ceil(segundos)} s restantes`
  if (segundos < 3600) return `≈ ${Math.ceil(segundos / 60)} min restantes`
  const h = Math.floor(segundos / 3600)
  return `≈ ${h} h ${Math.ceil((segundos % 3600) / 60)} min restantes`
}

// <input type="datetime-local"> espera "YYYY-MM-DDTHH:mm" SIN zona. El backend
// interpreta ese formato como hora del Terminal (UTC-5, ver utils/fechas.js),
// así que aquí se formatea en esa misma zona — no en la del navegador — para
// que guardar y volver a abrir un video no le corra la hora.
function aInputFechaHora(valor) {
  if (!valor) return ''
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value])
  )
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`
}

function OpcionFuente({ activa, onClick, children }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        activa ? 'bg-brand-600 text-white dark:bg-brand-500' : 'text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800'
      )}
    >
      {children}
    </button>
  )
}

// Barra de avance de la subida. Durante la transferencia muestra lo enviado y
// una estimación del tiempo restante; al llegar al 100 % el servidor todavía
// verifica el archivo y guarda, así que se aclara para que no parezca colgado.
function ProgresoSubida({ progreso }) {
  const pct = progreso.total ? Math.min(100, Math.floor((progreso.enviados / progreso.total) * 100)) : 0
  const segundos = (Date.now() - progreso.inicio) / 1000
  const velocidad = segundos > 1 ? progreso.enviados / segundos : 0
  const restante = velocidad ? (progreso.total - progreso.enviados) / velocidad : NaN
  const terminado = pct >= 100

  return (
    <div aria-live="polite">
      <div
        role="progressbar"
        aria-label="Progreso de la subida"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <div className="h-full bg-brand-600 transition-[width] duration-300 dark:bg-brand-400" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
        {terminado
          ? 'Archivo recibido. Verificando y guardando en el servidor…'
          : `Subiendo: ${fmtBytes(progreso.enviados)} de ${fmtBytes(progreso.total)} (${pct} %) ${fmtRestante(restante)}`}
      </p>
      {!terminado && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">No cierres esta ventana hasta que termine.</p>}
    </div>
  )
}

// Se monta solo mientras está abierto (ver VideosGestionPage) y con `key` por
// video: así el estado del formulario nace limpio en cada apertura sin
// efectos de sincronización.
function FormularioVideo({ video, categorias, onCerrar, onGuardado }) {
  const editando = Boolean(video)
  const tieneArchivoActual = editando && video.proveedor === 'local'
  const [titulo, setTitulo] = useState(video?.titulo || '')
  const [categoria, setCategoria] = useState(video?.categoria || '')
  const [descripcion, setDescripcion] = useState(video?.descripcion || '')
  // Un video nuevo arranca en "subir archivo": es el caso habitual.
  const [fuente, setFuente] = useState(editando && video.proveedor !== 'local' ? 'enlace' : 'archivo')
  const [url, setUrl] = useState(video?.url || '')
  const [archivoVideo, setArchivoVideo] = useState(null)
  const [fecha, setFecha] = useState(aInputFechaHora(video?.fechaPublicacion))
  const [archivo, setArchivo] = useState(null)
  const [quitarMiniatura, setQuitarMiniatura] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [progreso, setProgreso] = useState(null)
  const [error, setError] = useState('')
  const cancelarRef = useRef(null)

  const vistaPrevia = useMemo(() => (archivo ? URL.createObjectURL(archivo) : null), [archivo])
  useEffect(() => () => vistaPrevia && URL.revokeObjectURL(vistaPrevia), [vistaPrevia])

  // Cerrar o recargar la pestaña a mitad de una subida la pierde entera: el
  // navegador pide confirmación mientras hay una en curso.
  useEffect(() => {
    if (!guardando) return undefined
    const avisar = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [guardando])

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (fuente === 'archivo' && !archivoVideo && !tieneArchivoActual) {
      setError('Selecciona el archivo de video que quieres subir.')
      return
    }

    // Texto primero y el video al final: así el servidor ya tiene los datos
    // del formulario cuando empieza a recibir el archivo pesado.
    const datos = new FormData()
    datos.append('titulo', titulo)
    datos.append('categoria', categoria)
    datos.append('descripcion', descripcion)
    datos.append('fechaPublicacion', fecha)
    if (fuente === 'enlace') datos.append('url', url)
    if (archivo) datos.append('miniatura', archivo)
    if (quitarMiniatura && !archivo) datos.append('quitarMiniatura', 'true')
    if (fuente === 'archivo' && archivoVideo) datos.append('video', archivoVideo)

    const controlador = new AbortController()
    cancelarRef.current = controlador
    const inicio = Date.now()
    setGuardando(true)
    setProgreso(fuente === 'archivo' && archivoVideo ? { enviados: 0, total: archivoVideo.size, inicio } : null)
    const opciones = {
      signal: controlador.signal,
      onProgreso: archivoVideo ? ({ enviados, total }) => setProgreso({ enviados, total, inicio }) : undefined,
    }
    try {
      const { video: guardado } = editando
        ? await videosApi.actualizar(video.id, datos, opciones)
        : await videosApi.crear(datos, opciones)
      toast.success(editando ? 'Video actualizado' : 'Video creado')
      onGuardado(guardado)
    } catch (err) {
      setError(err.cancelada ? 'Subida cancelada. No se guardó ningún cambio.' : err.message)
    } finally {
      cancelarRef.current = null
      setGuardando(false)
      setProgreso(null)
    }
  }

  return (
    <Modal abierto titulo={editando ? 'Editar video' : 'Nuevo video'} onCerrar={guardando ? () => {} : onCerrar} ancho="max-w-2xl">
      <form onSubmit={guardar} className="space-y-4">
        <ErrorMsg>{error}</ErrorMsg>

        <Field label="Título">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required minLength={3} maxLength={140} disabled={guardando} />
        </Field>

        <Field label="Área, comité o categoría">
          <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} required maxLength={80} list="videos-categorias" placeholder="Ej. Comité SIG, COPASST, Talento Humano" disabled={guardando} />
          <datalist id="videos-categorias">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <Field label="Descripción breve">
          <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={600} disabled={guardando} />
          <span className="mt-1 block text-right text-[11px] text-slate-400">{descripcion.length}/600</span>
        </Field>

        <div>
          <span className="panel-mono mb-1.5 block text-[11px] tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">Video</span>
          <div role="radiogroup" aria-label="Origen del video" className="mb-3 flex flex-wrap gap-1.5">
            <OpcionFuente activa={fuente === 'archivo'} onClick={() => !guardando && setFuente('archivo')}>Subir desde el computador</OpcionFuente>
            <OpcionFuente activa={fuente === 'enlace'} onClick={() => !guardando && setFuente('enlace')}>Enlace (YouTube, Vimeo…)</OpcionFuente>
          </div>

          {fuente === 'archivo' ? (
            <div>
              {tieneArchivoActual && !archivoVideo && (
                <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                  Archivo actual: <span className="font-medium">{video.archivoNombreOriginal}</span> ({fmtBytes(video.archivoTamano)}). Selecciona otro solo si quieres reemplazarlo.
                </p>
              )}
              <input
                type="file"
                accept={ACEPTA_VIDEO}
                aria-label="Archivo de video"
                disabled={guardando}
                onChange={(e) => setArchivoVideo(e.target.files?.[0] || null)}
                className={CLASE_INPUT_ARCHIVO}
              />
              {archivoVideo && (
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {archivoVideo.name} · {fmtBytes(archivoVideo.size)}
                </p>
              )}
              <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                Se guarda en el servidor de Skynet, sin límite de tamaño. Formato recomendado: MP4 (H.264), que se ve en cualquier navegador; también WebM y MOV.
              </span>
            </div>
          ) : (
            <div>
              <Input type="url" aria-label="URL del video" value={url} onChange={(e) => setUrl(e.target.value)} required disabled={guardando} placeholder="https://www.youtube.com/watch?v=…" />
              <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                YouTube o Vimeo (se reproducen dentro de Skynet), un enlace directo a un archivo .mp4/.webm, u otro enlace https (se abre en una pestaña nueva).
                {tieneArchivoActual && ' Al guardar con un enlace, el archivo subido se elimina del servidor.'}
              </span>
            </div>
          )}
        </div>

        <Field label="Fecha y hora de publicación (opcional)" className="sm:max-w-xs">
          <Input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={guardando} />
          <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
            Vacía: se publica apenas guardes. Con fecha futura, queda programado hasta ese momento.
          </span>
        </Field>

        <Field label="Miniatura (opcional)">
          <input
            type="file"
            accept="image/*"
            disabled={guardando}
            onChange={(e) => {
              setArchivo(e.target.files?.[0] || null)
              setQuitarMiniatura(false)
            }}
            className={CLASE_INPUT_ARCHIVO}
          />
          <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
            Imagen de máximo 5 MB, proporción 16:9. Si no subes una, se usa la de YouTube o un fotograma del propio video.
          </span>
        </Field>

        {vistaPrevia && <img src={vistaPrevia} alt="Vista previa de la miniatura" className="aspect-video w-48 rounded-lg object-cover" />}
        {editando && video.tieneMiniaturaPropia && !archivo && (
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={quitarMiniatura} onChange={(e) => setQuitarMiniatura(e.target.checked)} disabled={guardando} />
            Quitar la miniatura actual
          </label>
        )}

        {progreso && <ProgresoSubida progreso={progreso} />}

        <div className="flex justify-end gap-2 pt-2">
          {guardando && progreso ? (
            <Btn variante="secundario" onClick={() => cancelarRef.current?.abort()}>Cancelar subida</Btn>
          ) : (
            <Btn variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Btn>
          )}
          <Btn type="submit" disabled={guardando}>
            {guardando ? (progreso ? 'Subiendo…' : 'Guardando…') : editando ? 'Guardar cambios' : 'Crear video'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}

export default function VideosGestionPage() {
  const [busqueda, setBusqueda] = useState('')
  const [page, setPage] = useState(1)
  // undefined = cerrado, null = video nuevo, objeto = editando ese video
  const [formulario, setFormulario] = useState(undefined)
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [vistaPrevia, setVistaPrevia] = useState(null)

  const q = useValorDiferido(busqueda.trim())
  const clave = `videos:gestion:${JSON.stringify({ q, page })}`
  const { data, cargando, error, recargar } = useDatosConCache(
    clave,
    () => videosApi.listarGestion({ page, limit: POR_PAGINA, q }),
    { ttlMs: 30_000 }
  )
  const videos = data?.videos || []

  async function confirmarEliminar() {
    if (!porEliminar) return
    setEliminando(true)
    try {
      await videosApi.eliminar(porEliminar.id)
      toast.success('Video eliminado')
      setPorEliminar(null)
      await recargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Clapperboard className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Gestionar videos</h1>
        </div>
        <Btn onClick={() => setFormulario(null)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo video
        </Btn>
      </div>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Cada video se publica al guardarlo, y el más reciente se destaca en el inicio de todo el personal. Para retirar uno, elimínalo.
      </p>

      <ErrorMsg>{error}</ErrorMsg>

      <div className="mb-2 border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
        <Field label="Buscar por título" className="sm:max-w-md">
          <Input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPage(1) }} placeholder="Título…" />
        </Field>
      </div>

      {cargando && !data ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Cargando videos…</p>
      ) : videos.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {q ? 'No hay videos que coincidan con la búsqueda.' : 'Aún no has creado videos.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
          {videos.map((v) => (
            <li key={v.id} className="grid gap-3 py-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-5">
              <VideoMiniatura video={v} onClick={() => setVistaPrevia(v)} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {v.programado && <Badge valor="programada" label={`Programado: ${fmtFechaHora(v.fechaPublicacion)}`} />}
                  {/* Solo videos creados cuando existían borrador/desactivado:
                      siguen ocultos hasta que se editen (ver models/Video.js). */}
                  {v.ocultoLegado && <Badge valor="inactivo" label="Oculto: edítalo para publicarlo" />}
                  <span className="panel-mono text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{v.categoria}</span>
                </div>
                <h2 className="mt-1 text-base font-semibold leading-snug text-slate-900 dark:text-white">{v.titulo}</h2>
                <p className="panel-mono mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {v.fechaPublicacion ? `Fecha de publicación: ${fmtFecha(v.fechaPublicacion)}` : 'Sin fecha de publicación'}
                  {v.creadoPor ? ` · creado por ${v.creadoPor}` : ''}
                  {v.proveedor === 'local' && v.archivoNombreOriginal ? ` · ${v.archivoNombreOriginal} (${fmtBytes(v.archivoTamano)})` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-1 gap-y-1 -ml-3">
                  <Btn variante="fantasma" className="!py-1" onClick={() => setFormulario(v)}>Editar</Btn>
                  <Btn variante="fantasma" className="!py-1 !text-red-600 dark:!text-red-400" onClick={() => setPorEliminar(v)}>Eliminar</Btn>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager page={data?.page || 1} pages={data?.pages || 1} onPage={setPage} />

      {formulario !== undefined && (
        <FormularioVideo
          key={formulario?.id || 'nuevo'}
          video={formulario}
          categorias={data?.categorias || []}
          onCerrar={() => setFormulario(undefined)}
          onGuardado={() => {
            setFormulario(undefined)
            recargar()
          }}
        />
      )}

      <VideoReproductor video={vistaPrevia} onCerrar={() => setVistaPrevia(null)} />

      <ConfirmDialog
        abierto={Boolean(porEliminar)}
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={confirmarEliminar}
        cargando={eliminando}
        titulo={`¿Eliminar "${porEliminar?.titulo}"?`}
        descripcion="Se elimina de forma definitiva (incluido el archivo, si lo subiste al servidor) y deja de mostrarse al personal."
        confirmarLabel="Eliminar"
      />
    </div>
  )
}
