import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Wrench, Camera, Images, X } from 'lucide-react'
import { ordenesApi, mantenimientoApi, indicadoresApi } from '../../api/mantenimiento.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { normalizarFoto } from '../../utils/normalizarFoto.js'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Input, Select, Textarea,
  TablaWrap, Th, Td, EmptyState, Pager, fmtFechaHora,
} from '../../components/ui.jsx'
import { ChipTabs, FAB, BottomSheet } from '../../components/mobileUi.jsx'

// Pantalla del ciclo de vida de la Orden de Trabajo (CMMS Fase 1). Cubre las
// 16 transiciones ya implementadas en el backend (ordenes.service.js); el
// Panel del Técnico dedicado (con carga de trabajo, calendario, etc.) es la
// Fase 3, todavía no implementada — esta pantalla es la vista operativa
// mínima para poder usar el ciclo de vida completo desde ya.

const ESTADOS = [
  { value: '', label: 'Todas' },
  { value: 'reportado', label: 'Reportadas' },
  { value: 'programada', label: 'Programadas' },
  { value: 'asignada', label: 'Asignadas' },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'en_espera', label: 'En espera' },
  { value: 'resuelta', label: 'Resueltas' },
  { value: 'pendiente_aprobacion', label: 'Pend. aprobación' },
  { value: 'cerrada', label: 'Cerradas' },
  { value: 'cancelada', label: 'Canceladas' },
]

const PRIORIDADES = [
  { value: 'baja', label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
]

const MOTIVOS_ESPERA = [
  { value: 'repuestos', label: 'Esperando repuestos' },
  { value: 'aprobacion', label: 'Esperando aprobación' },
  { value: 'informacion', label: 'Esperando información' },
  { value: 'apoyo', label: 'Esperando apoyo de otro técnico' },
]

const ESTADOS_ACTIVOS = [
  'reportado', 'programada', 'asignada', 'en_progreso', 'en_espera',
  'resuelta', 'pendiente_aprobacion',
]

const CONFIG_MOTIVO = {
  rechazar: { titulo: 'Rechazar asignación', label: 'Motivo del rechazo', requerido: true, tipo: 'texto', fn: (id, v) => ordenesApi.rechazar(id, v) },
  pausar: { titulo: 'Poner en espera', label: 'Motivo de la espera', requerido: true, tipo: 'select', opciones: MOTIVOS_ESPERA, fn: (id, v) => ordenesApi.pausar(id, v) },
  resolver: { titulo: 'Marcar como solucionada', label: 'Descripción de la solución', requerido: true, tipo: 'textarea', conFoto: true, fn: (id, v, foto) => ordenesApi.resolver(id, v, foto) },
  aprobar: { titulo: 'Aprobar y cerrar', label: 'Comentario (opcional)', requerido: false, tipo: 'textarea', fn: (id, v) => ordenesApi.aprobar(id, v) },
  rechazar_cierre: { titulo: 'Rechazar cierre', label: 'Motivo del rechazo', requerido: true, tipo: 'textarea', fn: (id, v) => ordenesApi.rechazarCierre(id, v) },
  reabrir: { titulo: 'Reabrir orden', label: 'Motivo de la reapertura', requerido: true, tipo: 'textarea', fn: (id, v) => ordenesApi.reabrir(id, v) },
  cancelar: { titulo: 'Cancelar orden', label: 'Motivo de la cancelación', requerido: true, tipo: 'textarea', fn: (id, v) => ordenesApi.cancelar(id, v) },
  escalar: { titulo: 'Escalar orden', label: 'Motivo del escalamiento', requerido: true, tipo: 'textarea', fn: (id, v) => ordenesApi.escalar(id, v) },
}

// Buscador de equipo con debounce, igual patrón que MantenimientosPage.jsx.
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
          <option key={eq._id} value={eq._id}>
            {eq.numero_inventario} — {eq.tipo?.nombre} {eq.marca?.nombre} {eq.modelo} ({eq.serial})
          </option>
        ))}
      </select>
    </div>
  )
}

function slaInfo(orden) {
  const limite = orden?.sla?.fecha_limite_solucion
  if (!limite || !ESTADOS_ACTIVOS.includes(orden.estado)) return null
  const restanteMs = new Date(limite).getTime() - Date.now()
  if (restanteMs < 0) return { texto: 'SLA vencido', clase: 'text-red-600 dark:text-red-400' }
  if (restanteMs < 2 * 3600_000) return { texto: `Vence ${fmtFechaHora(limite)}`, clase: 'text-amber-600 dark:text-amber-400' }
  return { texto: `Vence ${fmtFechaHora(limite)}`, clase: 'text-slate-500 dark:text-slate-400' }
}

function accionesPorOrden(orden, { usuario, tienePermiso }) {
  const mia = orden.tecnico_asignado && String(orden.tecnico_asignado._id) === String(usuario.id_usuario)
  const acciones = []

  if (orden.estado === 'reportado' && tienePermiso('mantenimiento:asignar')) {
    acciones.push({ label: 'Asignar', tipo: 'asignar' })
  }
  if (orden.estado === 'asignada' && mia) {
    acciones.push({ label: 'Aceptar', tipo: 'aceptar' })
    acciones.push({ label: 'Rechazar', tipo: 'rechazar' })
  }
  if (orden.estado === 'en_progreso' && mia) {
    acciones.push({ label: 'Pausar', tipo: 'pausar' })
    acciones.push({ label: 'Resolver', tipo: 'resolver' })
  }
  if (orden.estado === 'en_espera' && mia) {
    acciones.push({ label: 'Reanudar', tipo: 'reanudar' })
  }
  if (orden.estado === 'pendiente_aprobacion' && tienePermiso('mantenimiento:aprobar_cerrar')) {
    acciones.push({ label: 'Aprobar', tipo: 'aprobar' })
    acciones.push({ label: 'Rechazar cierre', tipo: 'rechazar_cierre' })
  }
  if (orden.estado === 'cerrada' && tienePermiso('mantenimiento:reabrir')) {
    acciones.push({ label: 'Reabrir', tipo: 'reabrir' })
  }
  if (ESTADOS_ACTIVOS.includes(orden.estado)) {
    if (tienePermiso('mantenimiento:cancelar')) acciones.push({ label: 'Cancelar', tipo: 'cancelar' })
    if (mia || tienePermiso('mantenimiento:escalar')) acciones.push({ label: 'Escalar', tipo: 'escalar' })
  }
  return acciones
}

const FORM_REPORTAR_VACIO = { equipoId: '', descripcion: '', prioridad: 'media' }
const FORM_PROGRAMAR_VACIO = { equipoId: '', fecha: '', tipo: '', tecnicoId: '', descripcion: '' }

// Indicadores Personales del Técnico (Fase 3.1) — panel de desarrollo, no de
// sanción: solo se muestran los propios, nunca comparados con otros técnicos.
function TarjetaIndicadoresPersonales() {
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    indicadoresApi.mios().then(setDatos).catch(() => {})
  }, [])

  if (!datos) return null

  const items = [
    ['OT cerradas', datos.ot_cerradas],
    ['Cumplimiento SLA', datos.cumplimiento_sla !== null ? `${Math.round(datos.cumplimiento_sla * 100)}%` : '—'],
    ['Tiempo prom. solución', datos.tiempo_promedio_solucion_horas !== null ? `${datos.tiempo_promedio_solucion_horas} h` : '—'],
    ['Horas trabajadas', `${datos.horas_trabajadas} h`],
    ['Retrabajos', datos.retrabajos],
    ['Hallazgos (encontrados/resueltos)', `${datos.hallazgos_encontrados}/${datos.hallazgos_resueltos}`],
  ]

  return (
    <Card className="mb-4">
      <p className="panel-mono mb-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Mis indicadores</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {items.map(([label, valor]) => (
          <div key={label}>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{valor}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function OrdenesTrabajoPage() {
  const { usuario, tienePermiso } = useAuth()
  const [datos, setDatos] = useState({ ordenes: [], total: 0, pages: 1, page: 1 })
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [page, setPage] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [tecnicos, setTecnicos] = useState([])

  const [modalReportar, setModalReportar] = useState(false)
  const [formReportar, setFormReportar] = useState(FORM_REPORTAR_VACIO)
  const [modalProgramar, setModalProgramar] = useState(false)
  const [formProgramar, setFormProgramar] = useState(FORM_PROGRAMAR_VACIO)
  const [modalAsignar, setModalAsignar] = useState(null)
  const [tecnicoElegido, setTecnicoElegido] = useState('')
  const [modalMotivo, setModalMotivo] = useState(null)
  const [valorMotivo, setValorMotivo] = useState('')
  const [fotoMotivo, setFotoMotivo] = useState(null)
  const [procesandoFoto, setProcesandoFoto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')
  const inputCamaraRef = useRef(null)
  const inputGaleriaRef = useRef(null)

  const puedeAsignar = tienePermiso('mantenimiento:asignar')

  async function cargar() {
    setCargando(true)
    try {
      const data = await ordenesApi.listar({ estado: estadoFiltro, page })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoFiltro, page])

  useEffect(() => {
    if (puedeAsignar) {
      ordenesApi.tecnicos().then((d) => setTecnicos(d.tecnicos)).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeAsignar])

  function cambiarFiltro(v) {
    setEstadoFiltro(v)
    setPage(1)
  }

  async function ejecutarSimple(fn, mensajeOk) {
    setError('')
    try {
      await fn()
      setOk(mensajeOk)
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  function abrirAccion(tipo, orden) {
    setErrorForm('')
    if (tipo === 'aceptar') return ejecutarSimple(() => ordenesApi.aceptar(orden._id), 'Orden aceptada')
    if (tipo === 'reanudar') return ejecutarSimple(() => ordenesApi.reanudar(orden._id), 'Orden reanudada')
    if (tipo === 'asignar') {
      setTecnicoElegido('')
      setModalAsignar(orden)
      return
    }
    setValorMotivo(CONFIG_MOTIVO[tipo].tipo === 'select' ? MOTIVOS_ESPERA[0].value : '')
    setFotoMotivo(null)
    setModalMotivo({ tipo, orden })
  }

  async function elegirFotoMotivo(archivo) {
    if (!archivo) return
    setProcesandoFoto(true)
    try {
      setFotoMotivo(await normalizarFoto(archivo))
    } finally {
      setProcesandoFoto(false)
    }
  }

  async function confirmarReportar(e) {
    e.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      await ordenesApi.reportar(formReportar)
      setOk('Problema reportado')
      setModalReportar(false)
      setFormReportar(FORM_REPORTAR_VACIO)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarProgramar(e) {
    e.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      await ordenesApi.programar(formProgramar)
      setOk('Preventivo programado')
      setModalProgramar(false)
      setFormProgramar(FORM_PROGRAMAR_VACIO)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarAsignar(e) {
    e.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      const { advertencias } = await ordenesApi.asignar(modalAsignar._id, tecnicoElegido)
      setOk(advertencias?.length ? `Técnico asignado — ${advertencias.join(' ')}` : 'Técnico asignado')
      setModalAsignar(null)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarMotivo(e) {
    e.preventDefault()
    const cfg = CONFIG_MOTIVO[modalMotivo.tipo]
    if (cfg.requerido && !valorMotivo.trim()) {
      setErrorForm('Este campo es obligatorio')
      return
    }
    setGuardando(true)
    setErrorForm('')
    try {
      await cfg.fn(modalMotivo.orden._id, valorMotivo, fotoMotivo)
      setOk(`${cfg.titulo}: hecho`)
      setModalMotivo(null)
      setFotoMotivo(null)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      {tienePermiso('mantenimiento:ejecutar') && <TarjetaIndicadoresPersonales />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-[var(--mobile-text)] md:text-2xl md:font-semibold md:text-slate-900 md:dark:text-white">
          Órdenes de trabajo
        </h1>
        <div className="flex gap-2">
          {puedeAsignar && (
            <Btn variante="secundario" onClick={() => setModalProgramar(true)}>+ Programar preventivo</Btn>
          )}
          <Btn onClick={() => setModalReportar(true)} className="hidden md:inline-flex">+ Reportar problema</Btn>
        </div>
      </div>

      <ChipTabs opciones={ESTADOS} valor={estadoFiltro} onChange={cambiarFiltro} className="mb-4" />

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <p className="text-sm text-[var(--mobile-text-dim)]">Cargando…</p>
      ) : datos.ordenes.length === 0 ? (
        <EmptyState mensaje="No hay órdenes de trabajo en esta vista" />
      ) : (
        <>
          {/* Móvil: feed de tarjetas táctiles — la tabla de 7 columnas de abajo
              no cabe en un teléfono. Desktop (Administrador, en su rol de
              supervisor) conserva la tabla densa para triage masivo. */}
          <div className="flex flex-col gap-3 md:hidden">
            {datos.ordenes.map((orden) => {
              const sla = slaInfo(orden)
              const acciones = accionesPorOrden(orden, { usuario, tienePermiso })
              const equipoLabel = orden.equipo
                ? `${orden.equipo.numero_inventario} — ${orden.equipo.tipo?.nombre || ''} ${orden.equipo.marca?.nombre || ''}`
                : '(equipo eliminado)'
              return (
                <div key={orden._id} className="m-card flex flex-col gap-2 rounded-2xl p-3">
                  <Link to={`/mantenimiento/ordenes/${orden._id}`} className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--mobile-accent-soft)] text-[var(--mobile-accent)]">
                      <Wrench className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--mobile-text)]">{equipoLabel}</span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--mobile-text-dim)]">{orden.descripcion}</span>
                    </span>
                    <Badge valor={orden.estado} />
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[52px] text-xs text-[var(--mobile-text-dim)]">
                    <Badge valor={orden.prioridad} />
                    {orden.tecnico_asignado && <span>{orden.tecnico_asignado.nombre}</span>}
                    {sla && <span className={sla.clase}>{sla.texto}</span>}
                  </div>
                  {acciones.length > 0 && (
                    <div className="flex flex-wrap gap-2 pl-[52px]">
                      {acciones.map((a) => (
                        <button
                          key={a.tipo}
                          type="button"
                          onClick={() => abrirAccion(a.tipo, orden)}
                          className="m-chip rounded-full px-3 py-1.5 text-xs font-medium"
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="hidden md:block">
            <TablaWrap>
              <thead>
                <tr>
                  <Th>Equipo</Th>
                  <Th>Estado</Th>
                  <Th>Prioridad</Th>
                  <Th>Técnico</Th>
                  <Th>SLA</Th>
                  <Th>Descripción</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {datos.ordenes.map((orden) => {
                  const sla = slaInfo(orden)
                  const acciones = accionesPorOrden(orden, { usuario, tienePermiso })
                  return (
                    <tr key={orden._id} className="panel-row">
                      <Td className="font-medium">
                        {orden.equipo
                          ? `${orden.equipo.numero_inventario} — ${orden.equipo.tipo?.nombre || ''} ${orden.equipo.marca?.nombre || ''}`
                          : '(equipo eliminado)'}
                      </Td>
                      <Td><Badge valor={orden.estado} /></Td>
                      <Td><Badge valor={orden.prioridad} /></Td>
                      <Td>{orden.tecnico_asignado?.nombre || '—'}</Td>
                      <Td>{sla ? <span className={sla.clase}>{sla.texto}</span> : '—'}</Td>
                      <Td className="max-w-xs truncate" title={orden.descripcion}>{orden.descripcion}</Td>
                      <Td className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1 whitespace-nowrap">
                          <Link to={`/mantenimiento/ordenes/${orden._id}`} className="panel-btn-fantasma rounded-lg px-3 py-2 text-sm font-medium">
                            Ver
                          </Link>
                          {acciones.map((a) => (
                            <Btn key={a.tipo} variante="fantasma" onClick={() => abrirAccion(a.tipo, orden)}>
                              {a.label}
                            </Btn>
                          ))}
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </TablaWrap>
          </div>

          <Pager page={datos.page} pages={datos.pages} onPage={setPage} />
        </>
      )}

      <FAB icon={Plus} label="Reportar problema" onClick={() => setModalReportar(true)} className="md:hidden" />

      {/* Reportar problema: acción universal, disponible para cualquier autenticado */}
      <BottomSheet abierto={modalReportar} titulo="Reportar un problema" onCerrar={() => setModalReportar(false)}>
        <form onSubmit={confirmarReportar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Equipo">
            <SelectorEquipo valor={formReportar.equipoId} onChange={(v) => setFormReportar((f) => ({ ...f, equipoId: v }))} />
          </Field>
          <Field label="Prioridad">
            <Select value={formReportar.prioridad} onChange={(e) => setFormReportar((f) => ({ ...f, prioridad: e.target.value }))}>
              {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Descripción del problema">
            <Textarea required value={formReportar.descripcion} onChange={(e) => setFormReportar((f) => ({ ...f, descripcion: e.target.value }))} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalReportar(false)}>Cancelar</Btn>
            <button type="submit" disabled={guardando} className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60">
              {guardando ? 'Enviando…' : 'Reportar'}
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* Programar preventivo */}
      <BottomSheet abierto={modalProgramar} titulo="Programar mantenimiento preventivo" onCerrar={() => setModalProgramar(false)}>
        <form onSubmit={confirmarProgramar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Equipo">
            <SelectorEquipo valor={formProgramar.equipoId} onChange={(v) => setFormProgramar((f) => ({ ...f, equipoId: v }))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha programada">
              <Input type="date" required value={formProgramar.fecha} onChange={(e) => setFormProgramar((f) => ({ ...f, fecha: e.target.value }))} />
            </Field>
            <Field label="Tipo">
              <Input placeholder="Preventivo…" value={formProgramar.tipo} onChange={(e) => setFormProgramar((f) => ({ ...f, tipo: e.target.value }))} />
            </Field>
          </div>
          <Field label="Técnico (opcional)">
            <Select value={formProgramar.tecnicoId} onChange={(e) => setFormProgramar((f) => ({ ...f, tecnicoId: e.target.value }))}>
              <option value="">— Sin asignar aún —</option>
              {tecnicos.map((t) => <option key={t._id} value={t._id}>{t.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Descripción">
            <Textarea value={formProgramar.descripcion} onChange={(e) => setFormProgramar((f) => ({ ...f, descripcion: e.target.value }))} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalProgramar(false)}>Cancelar</Btn>
            <button type="submit" disabled={guardando} className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Programar'}
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* Asignar técnico */}
      <BottomSheet abierto={Boolean(modalAsignar)} titulo="Asignar técnico" onCerrar={() => setModalAsignar(null)}>
        <form onSubmit={confirmarAsignar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Técnico">
            <Select required value={tecnicoElegido} onChange={(e) => setTecnicoElegido(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {tecnicos.map((t) => <option key={t._id} value={t._id}>{t.nombre}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalAsignar(null)}>Cancelar</Btn>
            <button type="submit" disabled={guardando} className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60">
              {guardando ? 'Asignando…' : 'Asignar'}
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* Modal genérico de motivo/comentario para rechazar, pausar, resolver,
          aprobar, rechazar cierre, reabrir, cancelar y escalar */}
      <BottomSheet abierto={Boolean(modalMotivo)} titulo={modalMotivo ? CONFIG_MOTIVO[modalMotivo.tipo].titulo : ''} onCerrar={() => setModalMotivo(null)}>
        {modalMotivo && (
          <form onSubmit={confirmarMotivo} className="space-y-4">
            <ErrorMsg>{errorForm}</ErrorMsg>
            <Field label={CONFIG_MOTIVO[modalMotivo.tipo].label}>
              {CONFIG_MOTIVO[modalMotivo.tipo].tipo === 'select' ? (
                <Select value={valorMotivo} onChange={(e) => setValorMotivo(e.target.value)}>
                  {CONFIG_MOTIVO[modalMotivo.tipo].opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : (
                <Textarea
                  required={CONFIG_MOTIVO[modalMotivo.tipo].requerido}
                  value={valorMotivo}
                  onChange={(e) => setValorMotivo(e.target.value)}
                />
              )}
            </Field>

            {CONFIG_MOTIVO[modalMotivo.tipo].conFoto && (
              <Field label="Foto de evidencia (opcional)">
                <input ref={inputCamaraRef} type="file" accept="image/*" capture="environment"
                  onChange={(e) => { elegirFotoMotivo(e.target.files?.[0]); e.target.value = '' }} className="sr-only" />
                <input ref={inputGaleriaRef} type="file" accept="image/*"
                  onChange={(e) => { elegirFotoMotivo(e.target.files?.[0]); e.target.value = '' }} className="sr-only" />
                <div className="flex gap-2">
                  <Btn type="button" variante="secundario" disabled={procesandoFoto}
                    onClick={() => inputCamaraRef.current?.click()} className="flex flex-1 items-center justify-center gap-2">
                    <Camera className="h-4 w-4" aria-hidden="true" /> Cámara
                  </Btn>
                  <Btn type="button" variante="secundario" disabled={procesandoFoto}
                    onClick={() => inputGaleriaRef.current?.click()} className="flex flex-1 items-center justify-center gap-2">
                    <Images className="h-4 w-4" aria-hidden="true" /> Galería
                  </Btn>
                </div>
                {procesandoFoto && <p className="mt-1.5 text-xs text-[var(--mobile-text-dim)]">Procesando foto…</p>}
                {fotoMotivo && (
                  <div className="relative mt-2 inline-block">
                    <img src={URL.createObjectURL(fotoMotivo)} alt="Evidencia de la solución" className="h-20 w-20 rounded-lg object-cover" />
                    <button type="button" onClick={() => setFotoMotivo(null)} aria-label="Quitar foto"
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-black/60 p-1 text-white">
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </Field>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Btn variante="secundario" onClick={() => setModalMotivo(null)}>Cancelar</Btn>
              <button type="submit" disabled={guardando} className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60">
                {guardando ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </form>
        )}
      </BottomSheet>
    </div>
  )
}
