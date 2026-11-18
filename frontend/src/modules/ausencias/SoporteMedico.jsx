import { useEffect, useRef, useState } from 'react'
import {
  Camera, Images, FileUp, RotateCw, Trash2, ArrowLeft, ArrowRight, Crop, FileText,
  LoaderCircle, TriangleAlert, ZoomIn, ZoomOut, CircleCheck,
} from 'lucide-react'
import { Btn } from '../../components/ui.jsx'
import { cn } from '../../lib/cn.js'
import {
  MODOS_ESCANER, MAX_BYTES_SOPORTE, MAX_PAGINAS, LADO_MINIMO_LEGIBLE_PX,
  escanearFoto, construirPdfSoporte,
} from '../../lib/escanerDocumento.js'

// Soporte de una incapacidad: la persona toma fotos del certificado (o las
// elige de la galería) y aquí se limpian "tipo escáner" y se juntan en un solo
// PDF; o sube directamente un PDF que ya tenga. En ambos casos el padre recibe
// un único File (PDF) por onChange, o null mientras no haya uno listo.

let consecutivo = 0
const nuevoId = () => `pag-${++consecutivo}`

const kb = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)
const hoyISO = () => new Date().toISOString().slice(0, 10)

const BTN_ICONO = 'rounded-md p-1.5 text-slate-600 transition hover:bg-brand-600/10 hover:text-brand-700 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-brand-400/10 dark:hover:text-brand-300'

export default function SoporteMedico({ onChange, onOcupado }) {
  const [origen, setOrigen] = useState(null) // null | 'pdf' | 'fotos'
  const [pdfDirecto, setPdfDirecto] = useState(null)
  const [paginas, setPaginas] = useState([])
  const [modo, setModo] = useState('documento')
  const [resultado, setResultado] = useState(null) // { archivo, url }
  const [armando, setArmando] = useState(false)
  const [error, setError] = useState('')
  const [verId, setVerId] = useState(null)
  const [acercar, setAcercar] = useState(false)

  const inputCamara = useRef(null)
  const inputGaleria = useRef(null)
  const inputPdf = useRef(null)
  const cola = useRef(Promise.resolve())
  const urlsPagina = useRef({})
  const urlResultado = useRef(null)
  const callbacks = useRef({ onChange, onOcupado })
  useEffect(() => { callbacks.current = { onChange, onOcupado } })

  const procesando = paginas.some((p) => p.estado === 'pendiente' || p.estado === 'procesando')
  const ocupado = procesando || armando

  useEffect(() => { callbacks.current.onOcupado?.(ocupado) }, [ocupado])

  // Al salir del formulario se sueltan las URLs temporales.
  useEffect(() => () => {
    Object.values(urlsPagina.current).forEach((u) => URL.revokeObjectURL(u))
    if (urlResultado.current) URL.revokeObjectURL(urlResultado.current)
    // Si se desmonta a medias (p. ej. cambian el tipo de ausencia), el padre
    // no debe quedarse esperando un soporte que ya no existe.
    callbacks.current.onOcupado?.(false)
  }, [])

  // Cada página pendiente se escanea de a una (en cola): varias fotos de 12 MP
  // a la vez agotarían la memoria de un celular modesto.
  useEffect(() => {
    for (const p of paginas) {
      if (p.estado !== 'pendiente') continue
      setPaginas((prev) => prev.map((x) => (x.id === p.id && x.token === p.token ? { ...x, estado: 'procesando' } : x)))
      cola.current = cola.current.then(async () => {
        try {
          const r = await escanearFoto(p.archivo, { modo, rotacion: p.rotacion, recortar: p.recortar })
          const url = URL.createObjectURL(r.blob)
          setPaginas((prev) => {
            const actual = prev.find((x) => x.id === p.id)
            if (!actual || actual.token !== p.token) {
              URL.revokeObjectURL(url)
              return prev
            }
            if (urlsPagina.current[p.id]) URL.revokeObjectURL(urlsPagina.current[p.id])
            urlsPagina.current[p.id] = url
            return prev.map((x) => (x.id === p.id
              ? { ...x, estado: 'listo', url, blob: r.blob, width: r.width, height: r.height, ladoOriginal: r.ladoOriginal }
              : x))
          })
        } catch (err) {
          console.error('No se pudo escanear la foto:', err)
          setPaginas((prev) => prev.map((x) => (x.id === p.id && x.token === p.token ? { ...x, estado: 'error' } : x)))
        }
      })
    }
  }, [paginas, modo])

  // Cuando todas las páginas están listas se arma el PDF y se entrega al padre.
  useEffect(() => {
    if (origen !== 'fotos') return undefined
    const todasListas = paginas.length > 0 && paginas.every((p) => p.estado === 'listo')
    if (!todasListas) {
      callbacks.current.onChange(null)
      setResultado(null)
      return undefined
    }
    let vigente = true
    setArmando(true)
    setError('')
    construirPdfSoporte(paginas, `incapacidad_${hoyISO()}.pdf`)
      .then((archivo) => {
        if (!vigente) return
        if (archivo.size > MAX_BYTES_SOPORTE) {
          setError(`El PDF pesa ${kb(archivo.size)} y el máximo es ${kb(MAX_BYTES_SOPORTE)}. Quita alguna página.`)
          callbacks.current.onChange(null)
          return
        }
        if (urlResultado.current) URL.revokeObjectURL(urlResultado.current)
        urlResultado.current = URL.createObjectURL(archivo)
        setResultado({ archivo, url: urlResultado.current })
        callbacks.current.onChange(archivo)
      })
      .catch((err) => {
        if (!vigente) return
        console.error('No se pudo armar el PDF del soporte:', err)
        setError('No se pudo armar el PDF. Intenta de nuevo o sube un PDF ya hecho.')
        callbacks.current.onChange(null)
      })
      .finally(() => { if (vigente) setArmando(false) })
    return () => { vigente = false }
  }, [paginas, origen])

  function soltarPaginas() {
    Object.values(urlsPagina.current).forEach((u) => URL.revokeObjectURL(u))
    urlsPagina.current = {}
    setPaginas([])
    setVerId(null)
  }

  function agregarFotos(lista) {
    const imagenes = Array.from(lista || []).filter((f) => f.type.startsWith('image/'))
    if (imagenes.length === 0) return
    setError('')
    if (origen === 'pdf') {
      setPdfDirecto(null)
      callbacks.current.onChange(null)
    }
    setOrigen('fotos')
    setPaginas((prev) => {
      const cupo = MAX_PAGINAS - prev.length
      if (imagenes.length > cupo) setError(`Máximo ${MAX_PAGINAS} páginas por soporte.`)
      const nuevas = imagenes.slice(0, Math.max(0, cupo)).map((archivo) => ({
        id: nuevoId(), archivo, rotacion: 0, recortar: true, estado: 'pendiente', token: 0, url: null,
      }))
      return [...prev, ...nuevas]
    })
  }

  function elegirPdf(archivo) {
    if (!archivo) return
    const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name)
    if (!esPdf) {
      setError('El archivo debe ser un PDF. Para fotos usa "Tomar foto" o "Elegir fotos".')
      return
    }
    if (archivo.size > MAX_BYTES_SOPORTE) {
      setError(`El PDF pesa ${kb(archivo.size)} y el máximo es ${kb(MAX_BYTES_SOPORTE)}.`)
      return
    }
    setError('')
    soltarPaginas()
    setResultado(null)
    setOrigen('pdf')
    setPdfDirecto(archivo)
    callbacks.current.onChange(archivo)
  }

  function cambiarPagina(id, cambios) {
    setPaginas((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios, estado: 'pendiente', token: p.token + 1 } : p)))
  }

  function quitarPagina(id) {
    if (urlsPagina.current[id]) URL.revokeObjectURL(urlsPagina.current[id])
    delete urlsPagina.current[id]
    if (verId === id) setVerId(null)
    const quedan = paginas.filter((p) => p.id !== id)
    if (quedan.length === 0) {
      // Sin páginas el efecto que arma el PDF ya no corre: hay que avisar aquí
      // que el PDF anterior dejó de valer.
      setOrigen(null)
      setResultado(null)
      callbacks.current.onChange(null)
    }
    setPaginas(quedan)
  }

  function mover(indice, delta) {
    setPaginas((prev) => {
      const destino = indice + delta
      if (destino < 0 || destino >= prev.length) return prev
      const copia = [...prev]
      ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
      return copia
    })
  }

  function cambiarModo(nuevo) {
    if (nuevo === modo) return
    setModo(nuevo)
    setPaginas((prev) => prev.map((p) => ({ ...p, estado: 'pendiente', token: p.token + 1 })))
  }

  function quitarPdf() {
    setPdfDirecto(null)
    setOrigen(null)
    callbacks.current.onChange(null)
  }

  const baja = paginas
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ p }) => p.estado === 'listo' && p.ladoOriginal < LADO_MINIMO_LEGIBLE_PX)
  const paginaVista = paginas.find((p) => p.id === verId && p.url)

  return (
    <div className="space-y-3">
      {/* capture="environment" abre directo la cámara trasera en el celular;
          en escritorio cae al selector de archivos. */}
      <input ref={inputCamara} type="file" accept="image/*" capture="environment" className="sr-only"
        onChange={(e) => { agregarFotos(e.target.files); e.target.value = '' }} />
      <input ref={inputGaleria} type="file" accept="image/*" multiple className="sr-only"
        onChange={(e) => { agregarFotos(e.target.files); e.target.value = '' }} />
      <input ref={inputPdf} type="file" accept="application/pdf" className="sr-only"
        onChange={(e) => { elegirPdf(e.target.files?.[0]); e.target.value = '' }} />

      <div className="grid grid-cols-3 gap-2">
        <Btn variante="secundario" className="flex items-center justify-center gap-1.5" onClick={() => inputCamara.current?.click()}>
          <Camera className="h-4 w-4" aria-hidden="true" /> Tomar foto
        </Btn>
        <Btn variante="secundario" className="flex items-center justify-center gap-1.5" onClick={() => inputGaleria.current?.click()}>
          <Images className="h-4 w-4" aria-hidden="true" /> Elegir fotos
        </Btn>
        <Btn variante="secundario" className="flex items-center justify-center gap-1.5" onClick={() => inputPdf.current?.click()}>
          <FileUp className="h-4 w-4" aria-hidden="true" /> Subir PDF
        </Btn>
      </div>

      {origen === null && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Toma una foto por cada hoja del certificado con buena luz y el papel completo a la vista;
          se limpian como un escáner y se juntan en un PDF. Si ya tienes el PDF, súbelo directo.
        </p>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      {origen === 'pdf' && pdfDirecto && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
          <FileText className="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-400" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{pdfDirecto.name}</span>
          <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{kb(pdfDirecto.size)}</span>
          <button type="button" className={BTN_ICONO} onClick={quitarPdf} aria-label="Quitar PDF">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {origen === 'fotos' && paginas.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Aspecto:</span>
            <div role="radiogroup" aria-label="Aspecto de las páginas" className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              {MODOS_ESCANER.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={modo === m.value}
                  onClick={() => cambiarModo(m.value)}
                  className={cn(
                    'px-3 py-1 text-xs transition',
                    modo === m.value
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 hover:bg-brand-600/10 dark:text-slate-300 dark:hover:bg-brand-400/10',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {paginaVista && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700">
                <span>Página {paginas.indexOf(paginaVista) + 1} (así saldrá en el PDF)</span>
                <span className="flex items-center gap-1">
                  <button type="button" className={BTN_ICONO} onClick={() => setAcercar((a) => !a)}
                    aria-label={acercar ? 'Alejar' : 'Acercar'}>
                    {acercar ? <ZoomOut className="h-4 w-4" aria-hidden="true" /> : <ZoomIn className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  <button type="button" className="rounded-md px-2 py-1 hover:bg-brand-600/10" onClick={() => setVerId(null)}>Cerrar</button>
                </span>
              </div>
              <div className="max-h-[55svh] overflow-auto bg-slate-100 p-2 dark:bg-slate-900">
                <img
                  src={paginaVista.url}
                  alt={`Página ${paginas.indexOf(paginaVista) + 1} escaneada`}
                  className={cn('mx-auto bg-white shadow', acercar ? 'max-w-none w-[220%]' : 'w-full')}
                />
              </div>
            </div>
          )}

          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {paginas.map((p, i) => (
              <li key={p.id} className="rounded-lg border border-slate-200 p-1.5 dark:border-slate-700">
                <button
                  type="button"
                  className="relative block aspect-[3/4] w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-900"
                  onClick={() => p.url && setVerId(p.id)}
                  aria-label={`Ver página ${i + 1} en grande`}
                  disabled={!p.url}
                >
                  {p.url && <img src={p.url} alt={`Página ${i + 1}`} className="h-full w-full object-contain" />}
                  {(p.estado === 'pendiente' || p.estado === 'procesando') && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-black/50">
                      <LoaderCircle className="h-6 w-6 animate-spin text-brand-700 dark:text-brand-400" aria-label="Procesando" />
                    </span>
                  )}
                  {p.estado === 'error' && (
                    <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-red-600 dark:text-red-400">
                      No se pudo leer esta foto
                    </span>
                  )}
                  <span className="panel-mono absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] text-white">{i + 1}</span>
                </button>
                <div className="mt-1 flex items-center justify-between">
                  <span className="flex">
                    <button type="button" className={BTN_ICONO} onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Mover antes">
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" className={BTN_ICONO} onClick={() => mover(i, 1)} disabled={i === paginas.length - 1} aria-label="Mover después">
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                  <span className="flex">
                    <button type="button" className={BTN_ICONO} onClick={() => cambiarPagina(p.id, { rotacion: (p.rotacion + 90) % 360 })} aria-label="Girar">
                      <RotateCw className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={cn(BTN_ICONO, p.recortar && 'text-brand-700 dark:text-brand-300')}
                      onClick={() => cambiarPagina(p.id, { recortar: !p.recortar })}
                      aria-pressed={p.recortar}
                      aria-label="Ajuste automático (enderezar y recortar)"
                      title={p.recortar ? 'Ajuste automático activado: endereza y recorta el papel' : 'Ajuste automático desactivado: se usa la foto completa'}
                    >
                      <Crop className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" className={BTN_ICONO} onClick={() => quitarPagina(p.id)} aria-label="Quitar página">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ol>

          {baja.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {baja.length === 1 ? `La página ${baja[0].n} tiene` : `Las páginas ${baja.map((b) => b.n).join(', ')} tienen`} poca
              resolución y puede no leerse bien. Tómala de nuevo más de cerca y con buena luz.
            </p>
          )}

          <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300" aria-live="polite">
            {ocupado ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                {armando ? 'Armando el PDF…' : 'Procesando las fotos…'}
              </>
            ) : resultado ? (
              <>
                <CircleCheck className="h-4 w-4 text-accent-600 dark:text-accent-400" aria-hidden="true" />
                PDF listo: {paginas.length} página{paginas.length === 1 ? '' : 's'} · {kb(resultado.archivo.size)}
                <a href={resultado.url} target="_blank" rel="noreferrer" className="ml-1 text-brand-700 underline dark:text-brand-400">Ver PDF</a>
              </>
            ) : null}
          </p>
        </>
      )}
    </div>
  )
}
