import { useState } from 'react'
import { CalendarDays, Plus, ExternalLink, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { sitioWebApi } from '../../api/sitioWeb.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { useValorDiferido } from '../../hooks/useValorDiferido.js'
import { Badge, Btn, ErrorMsg, Field, Input, Modal, Pager, Select, fmtFechaHora } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'
import { EditorTexto, esContenidoEditable } from './EditorTexto.jsx'
import { CampoImagen } from './SelectorImagen.jsx'
import { COLOR_ESTADO, ETIQUETA_ESTADO, EncabezadoSeccion, aInputFechaHora } from './comun.jsx'

const POR_PAGINA = 12

function FormularioEvento({ evento, sedes, onCerrar, onGuardado }) {
  const editando = Boolean(evento)
  const cuerpoEditable = !editando || esContenidoEditable(evento.descripcion)
  const [titulo, setTitulo] = useState(evento?.titulo || '')
  const [descripcion, setDescripcion] = useState(evento?.descripcion || '')
  const [inicio, setInicio] = useState(aInputFechaHora(evento?.inicio))
  const [fin, setFin] = useState(aInputFechaHora(evento?.fin))
  const [sedeId, setSedeId] = useState(evento?.sedeId ? String(evento.sedeId) : '')
  const [costo, setCosto] = useState(evento?.costo || '')
  const [sitioWeb, setSitioWeb] = useState(evento?.sitioWeb || '')
  const [estado, setEstado] = useState(evento?.estado === 'publish' ? 'publish' : 'draft')
  const [imagen, setImagen] = useState(evento?.imagenId ? { id: evento.imagenId, url: evento.imagenUrl } : null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function enviar(e) {
    e.preventDefault()
    setError('')
    if (!titulo.trim()) return setError('El título es obligatorio')
    if (!inicio || !fin) return setError('Indica cuándo empieza y cuándo termina')
    if (fin < inicio) return setError('El evento no puede terminar antes de empezar')
    const datos = {
      titulo: titulo.trim(),
      inicio,
      fin,
      costo,
      sitioWeb,
      estado,
      sedeId: sedeId ? Number(sedeId) : null,
      imagenId: imagen?.id ?? null,
      ...(cuerpoEditable ? { descripcion } : {}),
    }
    setGuardando(true)
    try {
      if (editando) await sitioWebApi.actualizarEvento(evento.id, datos)
      else await sitioWebApi.crearEvento(datos)
      toast.success(estado === 'publish' ? 'Evento publicado en el sitio web' : 'Borrador guardado')
      onGuardado()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto titulo={editando ? 'Editar evento' : 'Nuevo evento'} onCerrar={guardando ? () => {} : onCerrar} ancho="max-w-3xl">
      <form onSubmit={enviar} className="space-y-4">
        <ErrorMsg>{error}</ErrorMsg>
        <Field label="Nombre del evento">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} disabled={guardando} autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Empieza">
            <Input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} disabled={guardando} />
          </Field>
          <Field label="Termina">
            <Input type="datetime-local" value={fin} min={inicio || undefined} onChange={(e) => setFin(e.target.value)} disabled={guardando} />
          </Field>
        </div>
        <p className="-mt-2 text-[11px] text-slate-500 dark:text-slate-400">Las horas son del Terminal (Neiva).</p>

        <div>
          <span className="panel-mono mb-1.5 block text-[11px] tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">Imagen</span>
          <CampoImagen imagenUrl={imagen?.url || imagen?.miniatura} onCambiar={setImagen} onQuitar={() => setImagen(null)} deshabilitado={guardando} />
        </div>

        {cuerpoEditable ? (
          <div>
            <span className="panel-mono mb-1.5 block text-[11px] tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">Descripción</span>
            <EditorTexto valorInicial={descripcion} onChange={setDescripcion} deshabilitado={guardando} alto="min-h-32" />
          </div>
        ) : (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            La descripción tiene una maquetación avanzada hecha en WordPress; edítala allá para no dañarla.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lugar">
            <Select value={sedeId} onChange={(e) => setSedeId(e.target.value)} disabled={guardando}>
              <option value="">Sin lugar</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </Select>
          </Field>
          <Field label="Costo (opcional)">
            <Input value={costo} onChange={(e) => setCosto(e.target.value)} maxLength={60} placeholder="Gratis, $20.000…" disabled={guardando} />
          </Field>
          <Field label="Enlace del evento (opcional)">
            <Input type="url" value={sitioWeb} onChange={(e) => setSitioWeb(e.target.value)} placeholder="https://…" disabled={guardando} />
          </Field>
          <Field label="Estado">
            <Select value={estado} onChange={(e) => setEstado(e.target.value)} disabled={guardando}>
              <option value="draft">Borrador (no visible en el sitio)</option>
              <option value="publish">Publicado (visible para todos)</option>
            </Select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Btn variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Btn>
          <Btn type="submit" disabled={guardando}>{guardando ? 'Guardando…' : estado === 'publish' ? 'Guardar y publicar' : 'Guardar borrador'}</Btn>
        </div>
      </form>
    </Modal>
  )
}

export default function EventosPage() {
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')
  const [page, setPage] = useState(1)
  const [formulario, setFormulario] = useState(undefined)
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  const buscar = useValorDiferido(busqueda.trim())
  const { data, cargando, error, recargar } = useDatosConCache(
    `sitioweb:eventos:${JSON.stringify({ buscar, estado, page })}`,
    () => sitioWebApi.listarEventos({ page, limit: POR_PAGINA, buscar, estado }),
    { ttlMs: 30_000 }
  )
  const { data: dataSedes } = useDatosConCache('sitioweb:sedes', () => sitioWebApi.sedes(), { ttlMs: 300_000 })
  const eventos = data?.eventos || []
  const sedes = dataSedes?.sedes || []

  async function confirmarEliminar() {
    if (!porEliminar) return
    setEliminando(true)
    try {
      await sitioWebApi.eliminarEvento(porEliminar.id)
      toast.success('Evento enviado a la papelera del sitio web')
      setPorEliminar(null)
      await recargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <EncabezadoSeccion
        icono={CalendarDays}
        titulo="Eventos"
        descripcion="Eventos del calendario de elterminalneiva.com. Los nuevos nacen como borrador hasta que los publiques."
      >
        <Btn onClick={() => setFormulario(null)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo evento
        </Btn>
      </EncabezadoSeccion>

      <ErrorMsg>{error}</ErrorMsg>

      <div className="mb-4 grid gap-3 border-b border-slate-200/80 pb-4 sm:grid-cols-[minmax(0,1fr)_12rem] dark:border-slate-800/80">
        <Field label="Buscar por nombre">
          <Input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPage(1) }} placeholder="Nombre…" />
        </Field>
        <Field label="Estado">
          <Select value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1) }}>
            <option value="">Todos</option>
            <option value="publish">Publicados</option>
            <option value="draft">Borradores</option>
            <option value="future">Programados</option>
          </Select>
        </Field>
      </div>

      {cargando && !data ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Cargando eventos…</p>
      ) : eventos.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {buscar || estado ? 'No hay eventos que coincidan con los filtros.' : 'Aún no hay eventos.'}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {eventos.map((ev) => (
            <li key={ev.id} className="panel-card flex flex-col overflow-hidden rounded-xl">
              <div className="aspect-video w-full bg-slate-100 dark:bg-slate-900">
                {ev.imagenUrl ? (
                  <img src={ev.imagenUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400"><CalendarDays className="h-8 w-8" aria-hidden="true" /></div>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <Badge valor={COLOR_ESTADO[ev.estado]} label={ETIQUETA_ESTADO[ev.estado] || ev.estado} />
                <h2 className="mt-1.5 line-clamp-2 text-base font-semibold leading-snug text-slate-900 dark:text-white">{ev.titulo || '(sin nombre)'}</h2>
                <p className="panel-mono mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {ev.inicio ? fmtFechaHora(ev.inicio.replace(' ', 'T')) : 'Sin fecha'}
                </p>
                {ev.sede && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin className="h-3 w-3" aria-hidden="true" /> {ev.sede}
                  </p>
                )}
                <div className="-ml-3 mt-auto flex flex-wrap gap-x-1 pt-3">
                  <Btn variante="fantasma" className="!py-1" onClick={() => setFormulario(ev)} disabled={!ev.inicio && !ev.fin}>Editar</Btn>
                  {ev.estado === 'publish' && ev.enlace && (
                    <a href={ev.enlace} target="_blank" rel="noopener noreferrer" className="panel-btn-fantasma inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-medium">
                      Ver <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  )}
                  <Btn variante="fantasma" className="!py-1 !text-red-600 dark:!text-red-400" onClick={() => setPorEliminar(ev)}>Eliminar</Btn>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} pages={data?.totalPaginas || 1} onPage={setPage} />

      {formulario !== undefined && (
        <FormularioEvento
          key={formulario?.id || 'nuevo'}
          evento={formulario}
          sedes={sedes}
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
        descripcion="Deja de mostrarse en el calendario del sitio web. Queda en la papelera de WordPress y se puede restaurar desde allí."
        confirmarLabel="Eliminar"
      />
    </div>
  )
}
