import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { mantenimientoApi } from '../../api/mantenimiento.js'
import { useDatosConCache, invalidarCachePorPrefijo } from '../../hooks/useDatosConCache.js'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Input, Textarea, Modal,
  TablaWrap, Th, Td, EmptyState, Pager, fmtFecha, aInputFecha,
} from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'

// Endpoint autorizado por-recurso (reemplaza /storage servido con
// express.static — ver auditoría de producción 2026-08-22, Fase 2).
function urlPdf(id, filename) {
  return `/api/mantenimiento/mantenimientos/${id}/archivo/${filename}`
}

// Las dos acciones de la tabla que piden confirmación. Un solo diálogo las
// atiende a ambas: el estado `confirmacion` guarda cuál se pidió y sobre qué
// mantenimiento, y de aquí sale el texto.
const CONFIRMACIONES = {
  finalizar: {
    titulo: '¿Marcar como finalizado?',
    descripcion: 'Se registrará la fecha de hoy como fecha de realización del mantenimiento.',
    confirmarLabel: 'Finalizar',
    variante: 'primario',
    ejecutar: (id) => mantenimientoApi.mantenimientos.finalizar(id),
    exito: 'Mantenimiento finalizado',
  },
  eliminar: {
    titulo: '¿Eliminar este mantenimiento?',
    descripcion: 'Desaparecerá del historial del equipo. Esta acción no se puede deshacer.',
    confirmarLabel: 'Eliminar',
    variante: 'peligro',
    ejecutar: (id) => mantenimientoApi.mantenimientos.eliminar(id),
    exito: 'Mantenimiento eliminado',
  },
}

const TABS = [
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'proximos', label: 'Próximos 7 días' },
  { key: 'programados', label: 'Programados' },
  { key: 'finalizados', label: 'Finalizados' },
]

// Selector de equipo con búsqueda (para los modales de programar/registrar)
function SelectorEquipo({ valor, onChange }) {
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState([])
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      mantenimientoApi.equipos
        .listar({ page: 1, q })
        .then((d) => setResultados(d.equipos))
        .catch(() => setResultados([]))
    }, 300)
    return () => clearTimeout(timeoutRef.current)
  }, [q])

  return (
    <div>
      <Input placeholder="Buscar equipo por serial, marca, modelo…" value={q} onChange={(e) => setQ(e.target.value)} />
      <select
        required
        size={5}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="panel-input mt-2 w-full rounded-lg text-sm"
      >
        {resultados.map((eq) => (
          <option key={eq._id} value={eq._id} className="px-2 py-1">
            {eq.numero_inventario} — {eq.tipo?.nombre} {eq.marca?.nombre} {eq.modelo} ({eq.serial})
          </option>
        ))}
      </select>
    </div>
  )
}

const FORM_PROGRAMAR = { equipo_id: '', fecha_programada: '', tipo: '', tecnico: '', observaciones: '' }
const FORM_REALIZADO = { equipo_id: '', fecha_realizado: '', tipo: '', tecnico: '', observaciones: '' }
const FORM_EDITAR = { fecha: '', tipo: '', tecnico: '', descripcion: '', fecha_realizacion: '' }

export default function MantenimientosPage() {
  const [tab, setTab] = useState('pendientes')
  const [pagInfo, setPagInfo] = useState({ page: 1, pages: 1 })
  const [page, setPage] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [q, setQ] = useState('')
  const [ok, setOk] = useState('')

  const [modal, setModal] = useState(null) // 'programar' | 'realizado' | 'editar'
  const [form, setForm] = useState({})
  const [editandoId, setEditandoId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  const [confirmacion, setConfirmacion] = useState(null) // { accion, item }
  const [ejecutando, setEjecutando] = useState(false)

  // Clave por pestaña+página+búsqueda: cambiar de pestaña y volver ya no
  // repite la petición si la caché sigue vigente.
  const { data: lista, cargando, error, recargar } = useDatosConCache(
    `mantenimiento:mantenimientos:${tab}:${page}:${busqueda}`,
    async () => {
      if (tab === 'programados') {
        const data = await mantenimientoApi.mantenimientos.programados({ page, busqueda })
        setPagInfo({ page: data.page, pages: data.pages })
        return data.mantenimientos
      }
      const data = await mantenimientoApi.mantenimientos[tab]()
      setPagInfo({ page: 1, pages: 1 })
      return data.mantenimientos
    },
    { ttlMs: 30_000 },
  )

  // Las mutaciones (programar/registrar/editar/finalizar/eliminar/PDF) pueden
  // mover un ítem entre pestañas (ej. pendiente → finalizado) — se invalida
  // todo el prefijo en vez de solo la pestaña/página actual.
  function recargarTodo() {
    invalidarCachePorPrefijo('mantenimiento:mantenimientos:')
    recargar()
  }

  function cambiarTab(t) {
    setTab(t)
    setPage(1)
    setBusqueda('')
    setQ('')
    setOk('')
  }

  function abrirModal(tipo, mantenimiento = null) {
    setErrorForm('')
    if (tipo === 'programar') setForm(FORM_PROGRAMAR)
    if (tipo === 'realizado') setForm(FORM_REALIZADO)
    if (tipo === 'editar' && mantenimiento) {
      setEditandoId(mantenimiento._id)
      setForm({
        fecha: aInputFecha(mantenimiento.fecha),
        tipo: mantenimiento.tipo,
        tecnico: mantenimiento.tecnico,
        descripcion: mantenimiento.descripcion,
        fecha_realizacion: aInputFecha(mantenimiento.fecha_realizacion),
      })
    }
    setModal(tipo)
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      if (modal === 'programar') {
        await mantenimientoApi.mantenimientos.programar(form)
        setOk('Mantenimiento programado')
      } else if (modal === 'realizado') {
        await mantenimientoApi.mantenimientos.registrarRealizado({ ...form, mantenimiento_extra: 'si' })
        setOk('Mantenimiento registrado como realizado')
      } else if (modal === 'editar') {
        await mantenimientoApi.mantenimientos.editar(editandoId, form)
        setOk('Mantenimiento actualizado')
      }
      setModal(null)
      recargarTodo()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarAccion() {
    if (!confirmacion) return
    const { ejecutar, exito } = CONFIRMACIONES[confirmacion.accion]
    setOk('')
    setEjecutando(true)
    try {
      await ejecutar(confirmacion.item._id)
      setOk(exito)
      recargarTodo()
    } catch (err) {
      toast.error(err.message)
    } finally {
      // Se cierra pase lo que pase: el aviso vive en la página y el overlay
      // del diálogo lo taparía.
      setEjecutando(false)
      setConfirmacion(null)
    }
  }

  async function subirPdf(m, file) {
    if (!file) return
    try {
      if (m.estado === 'finalizado') {
        await mantenimientoApi.mantenimientos.agregarInforme(m._id, file)
      } else {
        await mantenimientoApi.mantenimientos.subirPdf(m._id, file)
      }
      setOk('PDF adjuntado correctamente')
      recargarTodo()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const upd = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Mantenimientos</h1>
        <div className="flex gap-2">
          <Btn variante="secundario" onClick={() => abrirModal('realizado')}>Registrar realizado</Btn>
          <Btn onClick={() => abrirModal('programar')}>+ Programar</Btn>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-cyan-600/15 bg-slate-900/[0.02] p-1 dark:border-cyan-400/10 dark:bg-white/[0.02]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => cambiarTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? 'bg-cyan-600/15 text-cyan-800 dark:bg-cyan-400/15 dark:text-cyan-200'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'programados' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setBusqueda(q.trim())
          }}
          className="mb-4 flex gap-2"
        >
          <Input
            placeholder="Buscar por técnico, tipo, marca, modelo o dependencia…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-md"
          />
          <Btn variante="secundario" type="submit">Buscar</Btn>
        </form>
      )}

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : !lista || lista.length === 0 ? (
        <EmptyState mensaje="No hay mantenimientos en esta vista" />
      ) : (
        <>
          <TablaWrap>
            <thead>
              <tr>
                <Th>Equipo</Th>
                <Th>Fecha</Th>
                {tab === 'finalizados' && <Th>Realizado</Th>}
                <Th>Tipo</Th>
                <Th>Técnico</Th>
                <Th>Descripción</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m._id} className="panel-row">
                  <Td className="font-medium">
                    {m.equipo
                      ? `${m.equipo.numero_inventario} — ${m.equipo.tipo?.nombre || ''} ${m.equipo.marca?.nombre || ''}`
                      : '(equipo eliminado)'}
                  </Td>
                  <Td>{fmtFecha(m.fecha)}</Td>
                  {tab === 'finalizados' && <Td>{fmtFecha(m.fecha_realizacion)}</Td>}
                  <Td>{m.tipo}</Td>
                  <Td>{m.tecnico}</Td>
                  <Td className="max-w-xs truncate" title={m.descripcion}>{m.descripcion}</Td>
                  <Td><Badge valor={m.estado} /></Td>
                  <Td className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1 whitespace-nowrap">
                      {m.archivo_pdf && (
                        <a
                          href={urlPdf(m._id, m.archivo_pdf)}
                          target="_blank"
                          rel="noreferrer"
                          className="panel-btn-fantasma rounded-lg px-2 py-1.5 text-sm font-medium"
                        >
                          PDF
                        </a>
                      )}
                      <label className="panel-btn-fantasma cursor-pointer rounded-lg px-2 py-1.5 text-sm font-medium">
                        {m.archivo_pdf ? 'Reemplazar PDF' : 'Adjuntar PDF'}
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            subirPdf(m, e.target.files?.[0])
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {m.estado !== 'finalizado' && (
                        <>
                          <Btn variante="fantasma" onClick={() => setConfirmacion({ accion: 'finalizar', item: m })}>Finalizar</Btn>
                          <Btn variante="fantasma" onClick={() => abrirModal('editar', m)}>Editar</Btn>
                        </>
                      )}
                      <Btn
                        variante="fantasma"
                        className="!text-red-600 dark:!text-red-400"
                        onClick={() => setConfirmacion({ accion: 'eliminar', item: m })}
                      >
                        Eliminar
                      </Btn>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TablaWrap>
          {tab === 'programados' && <Pager page={pagInfo.page} pages={pagInfo.pages} onPage={setPage} />}
        </>
      )}

      {/* Modal programar */}
      <Modal abierto={modal === 'programar'} titulo="Programar mantenimiento" onCerrar={() => setModal(null)}>
        <form onSubmit={guardar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Equipo">
            <SelectorEquipo valor={form.equipo_id} onChange={(v) => setForm((f) => ({ ...f, equipo_id: v }))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha programada">
              <Input type="date" required value={form.fecha_programada || ''} onChange={upd('fecha_programada')} />
            </Field>
            <Field label="Tipo">
              <Input required placeholder="Preventivo / Correctivo…" value={form.tipo || ''} onChange={upd('tipo')} />
            </Field>
          </div>
          <Field label="Técnico">
            <Input required value={form.tecnico || ''} onChange={upd('tecnico')} />
          </Field>
          <Field label="Observaciones">
            <Textarea required value={form.observaciones || ''} onChange={upd('observaciones')} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModal(null)}>Cancelar</Btn>
            <button type="submit" disabled={guardando} className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Programar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal registrar realizado */}
      <Modal abierto={modal === 'realizado'} titulo="Registrar mantenimiento realizado" onCerrar={() => setModal(null)}>
        <form onSubmit={guardar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Equipo">
            <SelectorEquipo valor={form.equipo_id} onChange={(v) => setForm((f) => ({ ...f, equipo_id: v }))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha en que se realizó">
              <Input type="date" required value={form.fecha_realizado || ''} onChange={upd('fecha_realizado')} />
            </Field>
            <Field label="Tipo">
              <Input required placeholder="Preventivo / Correctivo…" value={form.tipo || ''} onChange={upd('tipo')} />
            </Field>
          </div>
          <Field label="Técnico">
            <Input required value={form.tecnico || ''} onChange={upd('tecnico')} />
          </Field>
          <Field label="Observaciones">
            <Textarea required value={form.observaciones || ''} onChange={upd('observaciones')} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModal(null)}>Cancelar</Btn>
            <button type="submit" disabled={guardando} className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Registrar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal editar */}
      <Modal abierto={modal === 'editar'} titulo="Editar mantenimiento" onCerrar={() => setModal(null)}>
        <form onSubmit={guardar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha">
              <Input type="date" value={form.fecha || ''} onChange={upd('fecha')} />
            </Field>
            <Field label="Fecha realización (marca como finalizado)">
              <Input type="date" value={form.fecha_realizacion || ''} onChange={upd('fecha_realizacion')} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo">
              <Input value={form.tipo || ''} onChange={upd('tipo')} />
            </Field>
            <Field label="Técnico">
              <Input value={form.tecnico || ''} onChange={upd('tecnico')} />
            </Field>
          </div>
          <Field label="Descripción">
            <Textarea value={form.descripcion || ''} onChange={upd('descripcion')} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModal(null)}>Cancelar</Btn>
            <button type="submit" disabled={guardando} className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        abierto={Boolean(confirmacion)}
        onCancelar={() => setConfirmacion(null)}
        onConfirmar={confirmarAccion}
        cargando={ejecutando}
        titulo={confirmacion ? CONFIRMACIONES[confirmacion.accion].titulo : ''}
        descripcion={confirmacion ? CONFIRMACIONES[confirmacion.accion].descripcion : ''}
        confirmarLabel={confirmacion ? CONFIRMACIONES[confirmacion.accion].confirmarLabel : ''}
        variante={confirmacion ? CONFIRMACIONES[confirmacion.accion].variante : 'peligro'}
      />
    </div>
  )
}
