import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flag } from 'lucide-react'
import { sigittnApi } from '../../api/sigittn.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  Btn, Badge, Card, ErrorMsg, Field, Input, Select, Textarea, Modal,
  EmptyState, Pager, fmtFechaHora,
} from '../../components/ui.jsx'

const FORM_VACIO = {
  titulo_ticket: '',
  descripcion_ticket: '',
  id_modulo_origen: '',
  id_nivel_urgencia: '',
  id_usuario_asignado: '',
}

const URGENCIA_COLORES = {
  alta: 'text-red-700 dark:text-red-400',
  media: 'text-amber-700 dark:text-amber-400',
  baja: 'text-emerald-700 dark:text-emerald-400',
}

function colorUrgencia(nivel) {
  return URGENCIA_COLORES[(nivel || '').toLowerCase()] || 'text-slate-600 dark:text-slate-300'
}

export default function TicketsPage() {
  const { usuario, tieneModulo } = useAuth()
  const [datos, setDatos] = useState({ tickets: [], total: 0, pages: 1, page: 1 })
  const [contadores, setContadores] = useState(null)
  const [noLeidos, setNoLeidos] = useState([])
  const [catalogos, setCatalogos] = useState(null)
  const [page, setPage] = useState(1)
  const [filtroEstados, setFiltroEstados] = useState('')
  const [filtroModulo, setFiltroModulo] = useState('')
  const [soloMios, setSoloMios] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const data = await sigittnApi.tickets.listar({
        page,
        id_modulo_origen: filtroModulo || undefined,
        estados: filtroEstados ? [filtroEstados] : undefined,
        id_usuario: soloMios ? usuario.id_usuario : undefined,
      })
      setDatos(data)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [page, filtroEstados, filtroModulo, soloMios])

  useEffect(() => {
    sigittnApi.tickets.contadores().then(setContadores).catch(() => {})
    sigittnApi.catalogos.obtener().then(setCatalogos).catch(() => {})
    sigittnApi.notificaciones.noLeidos().then((d) => setNoLeidos(d.tickets.map(String))).catch(() => {})
  }, [])

  async function crear(e) {
    e.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      const datos = { ...form }
      if (!datos.id_usuario_asignado) delete datos.id_usuario_asignado
      await sigittnApi.tickets.crear(datos)
      setModalAbierto(false)
      setForm(FORM_VACIO)
      setPage(1)
      cargar()
      sigittnApi.tickets.contadores().then(setContadores).catch(() => {})
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const upd = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Tickets</h1>
        <Btn onClick={() => { setForm(FORM_VACIO); setErrorForm(''); setModalAbierto(true) }}>+ Nuevo ticket</Btn>
      </div>

      {contadores && (
        <div className="mb-4 grid grid-cols-2 gap-4 sm:max-w-sm">
          <Card>
            <p className="text-sm text-slate-500 dark:text-slate-400">Creados por mí (abiertos)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{contadores.creados}</p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500 dark:text-slate-400">Asignados a mí (abiertos)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{contadores.asignados}</p>
          </Card>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Estado" className="w-40">
          <Select value={filtroEstados} onChange={(e) => { setPage(1); setFiltroEstados(e.target.value) }}>
            <option value="">Todos</option>
            {(catalogos?.estados_ticket || []).map((est) => (
              <option key={est} value={est}>{est}</option>
            ))}
          </Select>
        </Field>
        <Field label="Módulo origen" className="w-48">
          <Select value={filtroModulo} onChange={(e) => { setPage(1); setFiltroModulo(e.target.value) }}>
            <option value="">Todos</option>
            {(catalogos?.modulos_origen || []).map((m) => (
              <option key={m._id} value={m.nombre}>{m.nombre}</option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={soloMios} onChange={(e) => { setPage(1); setSoloMios(e.target.checked) }} />
          Solo asignados a mí
        </label>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : datos.tickets.length === 0 ? (
        <EmptyState mensaje="No hay tickets con estos filtros" />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {datos.tickets.map((t) => (
              <Link
                key={t._id}
                to={`/sigittn/tickets/${t._id}`}
                className="panel-card relative rounded-xl p-4 transition hover:!border-cyan-400/40"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {noLeidos.includes(String(t._id)) && (
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-cyan-400" title="Mensajes nuevos" />
                    )}
                    {t.titulo_ticket}
                  </h3>
                  <Badge valor={t.estado} />
                </div>
                {t.descripcion_ticket && (
                  <p className="mb-3 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{t.descripcion_ticket}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`inline-flex items-center gap-1 font-medium ${colorUrgencia(t.nivel_urgencia)}`}>
                    <Flag className="h-3 w-3" aria-hidden="true" /> {t.nivel_urgencia}
                  </span>
                  <span>{t.modulo_origen}</span>
                  <span>{fmtFechaHora(t.fecha_creacion_ticket)}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t.usuario_creador?.nombre || '—'}
                  {t.usuario_asignado && <> → <span className="font-medium">{t.usuario_asignado.nombre}</span></>}
                </div>
              </Link>
            ))}
          </div>
          <Pager page={datos.page} pages={datos.pages} onPage={setPage} />
        </>
      )}

      <Modal abierto={modalAbierto} titulo="Nuevo ticket" onCerrar={() => setModalAbierto(false)}>
        <form onSubmit={crear} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>

          <Field label="Título">
            <Input required value={form.titulo_ticket} onChange={upd('titulo_ticket')} />
          </Field>

          <Field label="Descripción">
            <Textarea value={form.descripcion_ticket} onChange={upd('descripcion_ticket')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Módulo de origen">
              <Select required value={form.id_modulo_origen} onChange={upd('id_modulo_origen')}>
                <option value="">— Seleccionar —</option>
                {(catalogos?.modulos_origen || []).map((m) => (
                  <option key={m._id} value={m.nombre}>{m.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Nivel de urgencia">
              <Select required value={form.id_nivel_urgencia} onChange={upd('id_nivel_urgencia')}>
                <option value="">— Seleccionar —</option>
                {(catalogos?.niveles_urgencia || []).map((n) => (
                  <option key={n._id} value={n.nombre}>{n.nombre}</option>
                ))}
              </Select>
            </Field>
          </div>

          {tieneModulo('sigittn') && (
            <Field label="Asignar a (opcional)">
              <Select value={form.id_usuario_asignado} onChange={upd('id_usuario_asignado')}>
                <option value="">— Sin asignar —</option>
                {(catalogos?.usuarios || []).map((u) => (
                  <option key={u._id} value={u._id}>{u.nombre} ({u.nombre_usuario})</option>
                ))}
              </Select>
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalAbierto(false)}>Cancelar</Btn>
            <button
              type="submit"
              disabled={guardando}
              className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60"
            >
              {guardando ? 'Creando…' : 'Crear ticket'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
