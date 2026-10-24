import { useState } from 'react'
import { toast } from 'sonner'
import { sitioWebApi } from '../../api/sitioWeb.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { useValorDiferido } from '../../hooks/useValorDiferido.js'
import { Badge, Btn, ErrorMsg, Field, Input, Modal, Pager, Select, TablaWrap, Td, Textarea, Th, fmtFechaHora } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'
import { EditorTexto, esContenidoEditable } from './EditorTexto.jsx'
import { CampoImagen } from './SelectorImagen.jsx'
import { COLOR_ESTADO, ETIQUETA_ESTADO, EncabezadoSeccion, aInputFechaHora, htmlATexto } from './comun.jsx'

const POR_PAGINA = 20

// Se monta solo mientras está abierto y con `key` por noticia: el estado del
// formulario nace limpio en cada apertura sin efectos de sincronización.
function FormularioNoticia({ noticia, categorias, onCerrar, onGuardado }) {
  const editando = Boolean(noticia)
  // Una noticia armada en WordPress puede traer maquetación que este editor no
  // conoce; reescribirla la dañaría. En ese caso el cuerpo no se toca.
  const cuerpoEditable = !editando || esContenidoEditable(noticia.contenido)
  const [titulo, setTitulo] = useState(noticia?.titulo || '')
  const [extracto, setExtracto] = useState(noticia ? htmlATexto(noticia.extracto) : '')
  const [contenido, setContenido] = useState(noticia?.contenido || '')
  const [categoria, setCategoria] = useState(noticia?.categorias?.[0] ? String(noticia.categorias[0]) : '')
  const [estado, setEstado] = useState(noticia?.estado === 'draft' || !noticia ? 'draft' : 'publish')
  const [fecha, setFecha] = useState(noticia?.estado === 'future' ? aInputFechaHora(noticia.fecha) : '')
  const [destacada, setDestacada] = useState(Boolean(noticia?.destacada))
  const [imagen, setImagen] = useState(noticia?.imagenId ? { id: noticia.imagenId, url: noticia.imagenUrl } : null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function enviar(e) {
    e.preventDefault()
    setError('')
    if (!titulo.trim()) return setError('El título es obligatorio')
    const datos = {
      titulo: titulo.trim(),
      extracto,
      estado,
      destacada,
      categorias: categoria ? [Number(categoria)] : [],
      imagenId: imagen?.id ?? null,
      ...(estado === 'publish' && fecha ? { fechaPublicacion: fecha } : {}),
      ...(cuerpoEditable ? { contenido } : {}),
    }
    setGuardando(true)
    try {
      const { noticia: guardada } = editando ? await sitioWebApi.actualizarNoticia(noticia.id, datos) : await sitioWebApi.crearNoticia(datos)
      toast.success(
        guardada.estado === 'future' ? 'Noticia programada' : guardada.estado === 'publish' ? 'Noticia publicada en el sitio web' : 'Borrador guardado'
      )
      onGuardado()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const etiquetaGuardar = guardando ? 'Guardando…' : estado === 'draft' ? 'Guardar borrador' : fecha ? 'Guardar y programar' : 'Guardar y publicar'

  return (
    <Modal abierto titulo={editando ? 'Editar noticia' : 'Nueva noticia'} onCerrar={guardando ? () => {} : onCerrar} ancho="max-w-3xl">
      <form onSubmit={enviar} className="space-y-4">
        <ErrorMsg>{error}</ErrorMsg>
        <Field label="Título">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} disabled={guardando} autoFocus />
        </Field>
        <Field label="Resumen (opcional)">
          <Textarea rows={2} value={extracto} onChange={(e) => setExtracto(e.target.value)} disabled={guardando} />
        </Field>

        <div>
          <span className="panel-mono mb-1.5 block text-[11px] tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">Imagen destacada</span>
          <CampoImagen imagenUrl={imagen?.url || imagen?.miniatura} onCambiar={setImagen} onQuitar={() => setImagen(null)} deshabilitado={guardando} />
        </div>

        {cuerpoEditable ? (
          <div>
            <span className="panel-mono mb-1.5 block text-[11px] tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">Contenido</span>
            <EditorTexto valorInicial={contenido} onChange={setContenido} deshabilitado={guardando} />
          </div>
        ) : (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            El contenido de esta noticia tiene una maquetación avanzada hecha en WordPress. Para no dañarla, edítalo allá; aquí puedes cambiar el título,
            la imagen, la categoría, el estado y la fecha.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoría">
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={guardando}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={estado} onChange={(e) => setEstado(e.target.value)} disabled={guardando}>
              <option value="draft">Borrador (no visible en el sitio)</option>
              <option value="publish">Publicada (visible para todos)</option>
            </Select>
          </Field>
        </div>

        {estado === 'publish' && (
          <Field label="Programar publicación (opcional)" className="sm:max-w-xs">
            <Input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={guardando} />
            <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
              Vacío: se publica al guardar. Con fecha futura, queda programada hasta ese momento (hora del Terminal).
            </span>
          </Field>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={destacada} onChange={(e) => setDestacada(e.target.checked)} disabled={guardando} />
          Marcar como destacada (aparece primero en el sitio)
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Btn variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Btn>
          <Btn type="submit" disabled={guardando}>{etiquetaGuardar}</Btn>
        </div>
      </form>
    </Modal>
  )
}

export default function NoticiasPage() {
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')
  const [categoria, setCategoria] = useState('')
  const [page, setPage] = useState(1)
  // undefined = cerrado, null = noticia nueva, objeto = editando esa noticia
  const [formulario, setFormulario] = useState(undefined)
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  const buscar = useValorDiferido(busqueda.trim())
  const { data, cargando, error, recargar } = useDatosConCache(
    `sitioweb:noticias:${JSON.stringify({ buscar, estado, categoria, page })}`,
    () => sitioWebApi.listarNoticias({ page, limit: POR_PAGINA, buscar, estado, categoria }),
    { ttlMs: 60_000 }
  )
  const { data: dataCategorias } = useDatosConCache('sitioweb:categorias', () => sitioWebApi.categorias(), { ttlMs: 300_000 })
  const noticias = data?.noticias || []
  const categorias = dataCategorias?.categorias || []
  const nombreCategoria = (id) => categorias.find((c) => c.id === id)?.name

  async function confirmarEliminar() {
    if (!porEliminar) return
    setEliminando(true)
    try {
      await sitioWebApi.eliminarNoticia(porEliminar.id)
      toast.success('Noticia enviada a la papelera del sitio web')
      setPorEliminar(null)
      await recargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div>
      <EncabezadoSeccion
        titulo="Noticias"
        descripcion="Lo que guardes aquí se publica en elterminalneiva.com. Las noticias nuevas nacen como borrador hasta que las publiques."
      >
        <Btn onClick={() => setFormulario(null)}>
          Nueva noticia
        </Btn>
      </EncabezadoSeccion>

      <ErrorMsg>{error}</ErrorMsg>

      <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,24rem)_11rem_13rem]">
        <Field label="Buscar por título">
          <Input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPage(1) }} placeholder="Título…" />
        </Field>
        <Field label="Estado">
          <Select value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1) }}>
            <option value="">Todas</option>
            <option value="publish">Publicadas</option>
            <option value="draft">Borradores</option>
            <option value="future">Programadas</option>
          </Select>
        </Field>
        <Field label="Categoría">
          <Select value={categoria} onChange={(e) => { setCategoria(e.target.value); setPage(1) }}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      {cargando && !data ? (
        <p className="py-3 text-sm">Cargando noticias…</p>
      ) : noticias.length === 0 ? (
        <p className="py-3 text-sm">
          {buscar || estado || categoria ? 'No hay noticias que coincidan con los filtros.' : 'Aún no hay noticias.'}
        </p>
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th className="w-16">Imagen</Th>
              <Th>Título</Th>
              <Th>Categoría</Th>
              <Th>Estado</Th>
              <Th>Fecha</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {noticias.map((n) => (
              <tr key={n.id} className="panel-row">
                <Td className="w-16">
                  {n.imagenUrl ? (
                    <img src={n.imagenUrl} alt="" loading="lazy" className="h-6 w-10 rounded-sm object-cover" />
                  ) : (
                    '–'
                  )}
                </Td>
                <Td className="max-w-md">
                  <span className="block truncate" title={n.titulo}>{n.titulo || '(sin título)'}</span>
                  {n.destacada && <span className="text-xs font-semibold">Destacada</span>}
                </Td>
                <Td className="whitespace-nowrap">
                  {n.categorias.map((id) => nombreCategoria(id)).filter(Boolean).slice(0, 2).join(', ') || '–'}
                </Td>
                <Td className="whitespace-nowrap"><Badge valor={COLOR_ESTADO[n.estado]} label={ETIQUETA_ESTADO[n.estado] || n.estado} /></Td>
                <Td className="whitespace-nowrap">
                  {n.estado === 'future' ? `Se publica: ${fmtFechaHora(n.fecha)}` : fmtFechaHora(n.modificada)}
                </Td>
                <Td className="whitespace-nowrap text-right">
                  <Btn variante="fantasma" onClick={() => setFormulario(n)}>Editar</Btn>
                  {n.estado === 'publish' && (
                    <a href={n.enlace} target="_blank" rel="noopener noreferrer" className="panel-btn-fantasma inline-flex items-center rounded-lg px-3 py-1 text-sm font-medium">
                      Ver en el sitio
                    </a>
                  )}
                  <Btn variante="fantasma" className="!text-red-600 dark:!text-red-400" onClick={() => setPorEliminar(n)}>Eliminar</Btn>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Pager page={page} pages={data?.totalPaginas || 1} onPage={setPage} />

      {formulario !== undefined && (
        <FormularioNoticia
          key={formulario?.id || 'nueva'}
          noticia={formulario}
          categorias={categorias}
          onCerrar={() => setFormulario(undefined)}
          onGuardado={() => {
            setFormulario(undefined)
            recargar()
          }}
        />
      )}

      <ConfirmDialog
        abierto={Boolean(porEliminar)}
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={confirmarEliminar}
        cargando={eliminando}
        titulo={`¿Eliminar "${porEliminar?.titulo}"?`}
        descripcion="Deja de mostrarse en el sitio web. Queda en la papelera de WordPress, así que se puede restaurar desde allí."
        confirmarLabel="Eliminar"
      />
    </div>
  )
}
