import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'
import { ordenesApi, supervisorApi, plantillasApi, inventarioApi } from '../../api/mantenimiento.js'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Input, Select, Textarea,
  TablaWrap, Th, Td, EmptyState, fmtFecha,
} from '../../components/ui.jsx'

// recharts pinta SVG con colores fijos (no puede leer clases `dark:` de
// Tailwind) — esta pestaña, igual que el resto de SupervisorPage.jsx, todavía
// no migró al sistema de temas claro/oscuro del panel premium (ver
// [[proyecto_rediseno_panel_admin_premium]], "fases 2+ pendientes"), así que
// se asume el mismo fondo oscuro que ya asumen las tarjetas de arriba
// (`text-white`/`text-slate-400` sin variante `dark:`).
const COLORES_GRAFICA = {
  grid: '#334155',
  eje: '#94a3b8',
  abiertas: '#f59e0b',
  cerradas: '#22d3ee',
  costo: '#34d399',
  sla: '#22d3ee',
  tooltipBg: '#0f172a',
  tooltipBorder: '#334155',
  tooltipText: '#f1f5f9',
}

// Módulo del Supervisor (CMMS Fase 4): centro de control, asignación
// inteligente, balanceador de carga, aprobaciones, kanban, calendario, SLA,
// hallazgos, activos, alertas y dashboard gerencial — todo en una pantalla
// con pestañas, apoyado en las mismas acciones/transiciones ya construidas
// en Fases 1 y 3 (ver supervisor.service.js).

const ESTADOS_KANBAN = ['reportado', 'asignada', 'en_progreso', 'en_espera', 'pendiente_aprobacion', 'cerrada']

// ── Centro de Control ────────────────────────────────────────────────────
function TabCentroControl() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supervisorApi.centroControl().then(setDatos).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!datos) return <Card>Cargando…</Card>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(datos.conteosPorEstado).map(([estado, total]) => (
          <Card key={estado}>
            <p className="panel-mono text-xs uppercase text-slate-400">{estado}</p>
            <p className="mt-1 text-2xl font-semibold text-white">{total}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-xs text-slate-400">SLA vencidas</p><p className="text-2xl font-semibold text-red-400">{datos.slaVencidas}</p></Card>
        <Card><p className="text-xs text-slate-400">SLA próximas a vencer</p><p className="text-2xl font-semibold text-amber-400">{datos.slaProximasAVencer}</p></Card>
        <Card><p className="text-xs text-slate-400">Técnicos disponibles / ocupados</p><p className="text-2xl font-semibold text-white">{datos.tecnicosDisponibles} / {datos.tecnicosOcupados}</p></Card>
      </div>
      <Card>
        <h2 className="mb-2 font-semibold text-white">Alertas destacadas</h2>
        {datos.alertasDestacadas.length ? (
          <ul className="space-y-1 text-sm">
            {datos.alertasDestacadas.map((a, i) => <li key={i} className="text-slate-300">• {a.descripcion}</li>)}
          </ul>
        ) : <p className="text-sm text-slate-400">Sin alertas activas.</p>}
      </Card>
    </div>
  )
}

// ── Tablero Kanban ───────────────────────────────────────────────────────
function TabKanban() {
  const [ordenes, setOrdenes] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    ordenesApi.listar({ page: 1 }).then((d) => setOrdenes(d.ordenes)).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorMsg>{error}</ErrorMsg>

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {ESTADOS_KANBAN.map((estado) => (
        <div key={estado} className="w-64 shrink-0 rounded-xl border border-cyan-400/10 bg-white/[0.02] p-2">
          <p className="panel-mono mb-2 px-1 text-xs uppercase tracking-wide text-slate-400">{estado} ({ordenes.filter((o) => o.estado === estado).length})</p>
          <div className="space-y-2">
            {ordenes.filter((o) => o.estado === estado).map((o) => (
              <Link key={o._id} to={`/mantenimiento/ordenes/${o._id}`} className="block rounded-lg border border-cyan-400/10 bg-white/[0.03] p-2 text-xs hover:border-cyan-400/30">
                <p className="font-medium text-slate-100">{o.equipo?.numero_inventario || '—'}</p>
                <p className="mt-1 text-slate-400 truncate">{o.descripcion}</p>
                <Badge valor={o.prioridad} />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Balance de Carga ─────────────────────────────────────────────────────
function TabBalanceCarga() {
  const [tecnicos, setTecnicos] = useState(null)
  const [error, setError] = useState('')

  function cargar() {
    supervisorApi.balanceCarga().then((d) => setTecnicos(d.tecnicos)).catch((e) => setError(e.message))
  }

  useEffect(cargar, [])

  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!tecnicos) return <Card>Cargando…</Card>
  if (tecnicos.length === 0) return <EmptyState mensaje="Sin técnicos registrados" />

  return (
    <TablaWrap>
      <thead>
        <tr><Th>Técnico</Th><Th>OT activas</Th><Th>Horas asignadas</Th><Th>SLA comprometidos</Th><Th>Preventivos</Th><Th>Correctivos</Th><Th>Retrabajos</Th></tr>
      </thead>
      <tbody>
        {tecnicos.map((t) => (
          <tr key={t.tecnico._id} className="panel-row">
            <Td className="font-medium">{t.tecnico.nombre}</Td>
            <Td>{t.ordenesActivas}</Td>
            <Td>{Math.round(t.horasAsignadasMin / 60)} h</Td>
            <Td>{t.slaComprometidos}</Td>
            <Td>{t.preventivosPendientes}</Td>
            <Td>{t.correctivosPendientes}</Td>
            <Td>{t.retrabajos}</Td>
          </tr>
        ))}
      </tbody>
    </TablaWrap>
  )
}

// ── Centro de Aprobaciones ───────────────────────────────────────────────
function TabAprobaciones() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  function cargar() {
    supervisorApi.aprobaciones().then(setDatos).catch((e) => setError(e.message))
  }

  useEffect(cargar, [])

  async function aprobarCierre(id) {
    try {
      await ordenesApi.aprobar(id, '')
      setOk('Orden aprobada y cerrada')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  async function aprobarRepuesto(otId, solicitudId) {
    try {
      await ordenesApi.aprobarRepuestos(otId, solicitudId)
      setOk('Repuestos aprobados')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!datos) return <Card>Cargando…</Card>

  return (
    <div className="space-y-4">
      <OkMsg>{ok}</OkMsg>
      <Card>
        <h2 className="mb-2 font-semibold text-white">Cierres pendientes de aprobación ({datos.cierresPendientes.length})</h2>
        {datos.cierresPendientes.length ? (
          <ul className="space-y-2">
            {datos.cierresPendientes.map((o) => (
              <li key={o._id} className="flex items-center justify-between text-sm">
                <span>{o.equipo?.numero_inventario} — {o.tecnico_asignado?.nombre} <Badge valor={o.prioridad} /></span>
                <div className="flex gap-1">
                  <Btn variante="fantasma" onClick={() => aprobarCierre(o._id)}>Aprobar</Btn>
                  <Link to={`/mantenimiento/ordenes/${o._id}`} className="panel-btn-fantasma rounded-lg px-3 py-2 text-sm">Ver</Link>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-400">Sin cierres pendientes.</p>}
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold text-white">Solicitudes de repuestos ({datos.solicitudesRepuestos.length})</h2>
        {datos.solicitudesRepuestos.length ? (
          <ul className="space-y-2">
            {datos.solicitudesRepuestos.map((r, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>{r.equipo}: {r.solicitud.items.map((it) => `${it.nombre} x${it.cantidad}`).join(', ')}</span>
                <div className="flex gap-1">
                  <Btn variante="fantasma" onClick={() => aprobarRepuesto(r.ordenTrabajo, r.solicitud._id)}>Aprobar</Btn>
                  <Link to={`/mantenimiento/ordenes/${r.ordenTrabajo}`} className="panel-btn-fantasma rounded-lg px-3 py-2 text-sm">Ver</Link>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-400">Sin solicitudes pendientes.</p>}
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold text-white">Órdenes escaladas ({datos.escalamientos.length})</h2>
        {datos.escalamientos.length ? (
          <ul className="space-y-2">
            {datos.escalamientos.map((o) => (
              <li key={o._id} className="flex items-center justify-between text-sm">
                <span>{o.equipo?.numero_inventario} — {o.escaladoMotivo}</span>
                <Link to={`/mantenimiento/ordenes/${o._id}`} className="panel-btn-fantasma rounded-lg px-3 py-2 text-sm">Ver</Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-400">Sin escalamientos activos.</p>}
      </Card>
    </div>
  )
}

// ── Calendario Operativo ─────────────────────────────────────────────────
function TabCalendario() {
  const [ordenes, setOrdenes] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supervisorApi.calendario().then((d) => setOrdenes(d.ordenes)).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!ordenes) return <Card>Cargando…</Card>
  if (ordenes.length === 0) return <EmptyState mensaje="Sin órdenes programadas" />

  return (
    <TablaWrap>
      <thead><tr><Th>Fecha</Th><Th>Equipo</Th><Th>Técnico</Th><Th>Origen</Th><Th>Estado</Th><Th>Prioridad</Th></tr></thead>
      <tbody>
        {ordenes.map((o) => (
          <tr key={o._id} className="panel-row">
            <Td>{fmtFecha(o.fecha)}</Td><Td>{o.equipo?.numero_inventario}</Td><Td>{o.tecnico_asignado?.nombre || '—'}</Td>
            <Td>{o.origen}</Td><Td><Badge valor={o.estado} /></Td><Td><Badge valor={o.prioridad} /></Td>
          </tr>
        ))}
      </tbody>
    </TablaWrap>
  )
}

// ── Centro de SLA ────────────────────────────────────────────────────────
function TabSLA() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supervisorApi.sla().then(setDatos).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!datos) return <Card>Cargando…</Card>

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-2 font-semibold text-white">Vencidas ({datos.vencidas.length})</h2>
        {datos.vencidas.map((o) => (
          <p key={o._id} className="text-sm text-red-300">{o.equipo?.numero_inventario} — {o.tecnico_asignado?.nombre || 'sin asignar'}</p>
        ))}
        {datos.vencidas.length === 0 && <p className="text-sm text-slate-400">Ninguna.</p>}
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold text-white">Próximas a vencer ({datos.proximasAVencer.length})</h2>
        {datos.proximasAVencer.map((o) => (
          <p key={o._id} className="text-sm text-amber-300">{o.equipo?.numero_inventario} — {o.tecnico_asignado?.nombre || 'sin asignar'}</p>
        ))}
        {datos.proximasAVencer.length === 0 && <p className="text-sm text-slate-400">Ninguna.</p>}
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold text-white">Técnicos comprometidos</h2>
          {datos.tecnicosComprometidos.map((t, i) => <p key={i} className="text-sm text-slate-300">{t.nombre}: {t.total}</p>)}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold text-white">Dependencias con más incumplimientos</h2>
          {datos.dependenciasConMasIncumplimientos.map((d, i) => <p key={i} className="text-sm text-slate-300">{d.dependencia}: {d.total}</p>)}
        </Card>
      </div>
    </div>
  )
}

// ── Centro de Hallazgos ──────────────────────────────────────────────────
function TabHallazgos() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supervisorApi.centroHallazgos().then(setDatos).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!datos) return <Card>Cargando…</Card>

  return (
    <div className="space-y-4">
      {datos.tiposRecurrentes.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold text-white">Tipos recurrentes</h2>
          {datos.tiposRecurrentes.map((t, i) => <p key={i} className="text-sm text-amber-300">{t.tipo}: {t.total} veces</p>)}
        </Card>
      )}
      <Card>
        <h2 className="mb-2 font-semibold text-white">Todos los hallazgos ({datos.hallazgos.length})</h2>
        {datos.hallazgos.length ? (
          <ul className="space-y-2">
            {datos.hallazgos.map((h) => (
              <li key={h._id} className="flex items-center justify-between text-sm">
                <span>{h.descripcion} <Badge valor={h.criticidad} /> <Badge valor={h.estado} /></span>
                <Link to={`/mantenimiento/ordenes/${h.ordenTrabajo?._id || h.ordenTrabajo}`} className="panel-btn-fantasma rounded-lg px-3 py-2 text-sm">Ver OT</Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-400">Sin hallazgos registrados.</p>}
      </Card>
    </div>
  )
}

// ── Centro de Activos ────────────────────────────────────────────────────
function TabActivos() {
  const [problematicos, setProblematicos] = useState(null)
  const [equipoId, setEquipoId] = useState('')
  const [ficha, setFicha] = useState(null)
  const [form, setForm] = useState({ criticidad: 'estandar', garantia_fecha_fin: '', garantia_proveedor: '', vida_util_anios: '' })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    supervisorApi.activosProblematicos().then((d) => setProblematicos(d.activos)).catch((e) => setError(e.message))
  }, [])

  async function verFicha(id) {
    setEquipoId(id)
    try {
      const d = await supervisorApi.fichaActivo(id)
      setFicha(d)
      setForm({
        criticidad: d.equipo.criticidad, garantia_fecha_fin: d.equipo.garantia_fecha_fin?.slice(0, 10) || '',
        garantia_proveedor: d.equipo.garantia_proveedor || '', vida_util_anios: d.equipo.vida_util_anios || '',
      })
    } catch (err) {
      setError(err.message)
    }
  }

  async function guardar() {
    try {
      await supervisorApi.actualizarActivo(equipoId, form)
      setOk('Activo actualizado')
      verFicha(equipoId)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-4">
      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>
      <Card>
        <h2 className="mb-2 font-semibold text-white">Activos con más órdenes</h2>
        {!problematicos ? <p className="text-sm text-slate-400">Cargando…</p> : problematicos.length === 0 ? <p className="text-sm text-slate-400">Sin datos.</p> : (
          <ul className="space-y-1">
            {problematicos.map((p) => (
              <li key={p.equipo._id} className="flex items-center justify-between text-sm">
                <span>{p.equipo.numero_inventario} — {p.totalOrdenes} orden(es), ${p.costoTotal.toLocaleString('es-CO')}, {p.totalHallazgos} hallazgo(s)</span>
                <Btn variante="fantasma" onClick={() => verFicha(p.equipo._id)}>Ver ficha</Btn>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {ficha && (
        <Card>
          <h2 className="mb-2 font-semibold text-white">Ficha — {ficha.equipo.numero_inventario}</h2>
          <dl className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-slate-400">Costo acumulado</dt><dd className="text-slate-100">${ficha.costoAcumulado.toLocaleString('es-CO')}</dd></div>
            <div><dt className="text-slate-400">Horas fuera de servicio</dt><dd className="text-slate-100">{ficha.horasFueraDeServicio} h</dd></div>
            <div><dt className="text-slate-400">Preventivos ejecutados</dt><dd className="text-slate-100">{ficha.preventivosEjecutados}</dd></div>
            <div><dt className="text-slate-400">Correctivos ejecutados</dt><dd className="text-slate-100">{ficha.correctivosEjecutados}</dd></div>
          </dl>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Criticidad">
              <Select value={form.criticidad} onChange={(e) => setForm((f) => ({ ...f, criticidad: e.target.value }))}>
                <option value="estandar">Estándar</option><option value="importante">Importante</option><option value="critico">Crítico</option>
              </Select>
            </Field>
            <Field label="Fin de garantía"><Input type="date" value={form.garantia_fecha_fin} onChange={(e) => setForm((f) => ({ ...f, garantia_fecha_fin: e.target.value }))} /></Field>
            <Field label="Proveedor de garantía"><Input value={form.garantia_proveedor} onChange={(e) => setForm((f) => ({ ...f, garantia_proveedor: e.target.value }))} /></Field>
            <Field label="Vida útil (años)"><Input type="number" min="0" value={form.vida_util_anios} onChange={(e) => setForm((f) => ({ ...f, vida_util_anios: e.target.value }))} /></Field>
          </div>
          <Btn className="mt-3" onClick={guardar}>Guardar</Btn>
        </Card>
      )}
    </div>
  )
}

// ── Alertas Operativas ───────────────────────────────────────────────────
function TabAlertas() {
  const [alertas, setAlertas] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supervisorApi.alertas().then((d) => setAlertas(d.alertas)).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!alertas) return <Card>Cargando…</Card>
  if (alertas.length === 0) return <EmptyState mensaje="Sin alertas activas" />

  return (
    <ul className="space-y-2">
      {alertas.map((a, i) => (
        <li key={i} className="flex items-center justify-between rounded-lg border border-cyan-400/10 p-3 text-sm">
          <span className="text-slate-200">{a.descripcion}</span>
          <Badge valor={a.prioridad} />
        </li>
      ))}
    </ul>
  )
}

// ── Dashboard Gerencial ──────────────────────────────────────────────────
function TabDashboard() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supervisorApi.dashboard().then(setDatos).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!datos) return <Card>Cargando…</Card>

  const c = COLORES_GRAFICA
  const ejeComun = { stroke: c.eje, fontSize: 12, tickLine: false, axisLine: false }
  const tooltipComun = { contentStyle: { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12 }, labelStyle: { color: c.tooltipText }, itemStyle: { color: c.tooltipText } }

  const items = [
    ['Cumplimiento SLA', datos.cumplimiento_sla !== null ? `${Math.round(datos.cumplimiento_sla * 100)}%` : '—'],
    ['Tiempo prom. atención', datos.tiempo_promedio_atencion_horas !== null ? `${datos.tiempo_promedio_atencion_horas} h` : '—'],
    ['Tiempo prom. solución', datos.tiempo_promedio_solucion_horas !== null ? `${datos.tiempo_promedio_solucion_horas} h` : '—'],
    ['MTTR', datos.mttr_horas !== null ? `${datos.mttr_horas} h` : '—'],
    ['Costos totales', `$${datos.costos_totales.toLocaleString('es-CO')}`],
    ['Retrabajos', datos.retrabajos],
    ['Hallazgos (total/resueltos)', `${datos.hallazgos_total}/${datos.hallazgos_resueltos}`],
    ['Preventivos (ejecutados/programados)', `${datos.preventivos_ejecutados}/${datos.preventivos_programados}`],
    ['Correctivos ejecutados', datos.correctivos_ejecutados],
    ['OT totales / cerradas', `${datos.ordenes_totales}/${datos.ordenes_cerradas}`],
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {items.map(([label, valor]) => (
          <Card key={label}>
            <p className="text-xl font-semibold text-white">{valor}</p>
            <p className="text-xs text-slate-400">{label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-white">Órdenes por mes</h2>
          {datos.serieMensual.some((m) => m.otAbiertas || m.otCerradas) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={datos.serieMensual}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeComun} />
                <YAxis allowDecimals={false} {...ejeComun} />
                <Tooltip {...tooltipComun} />
                <Legend wrapperStyle={{ fontSize: 12, color: c.eje }} />
                <Bar dataKey="otAbiertas" name="Abiertas" fill={c.abiertas} radius={[4, 4, 0, 0]} />
                <Bar dataKey="otCerradas" name="Cerradas" fill={c.cerradas} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400">Sin órdenes en los últimos 6 meses.</p>}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-white">Costo de materiales por mes</h2>
          {datos.serieMensual.some((m) => m.costoMateriales) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={datos.serieMensual}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeComun} />
                <YAxis {...ejeComun} tickFormatter={(v) => `$${(v / 1000).toLocaleString('es-CO')}k`} />
                <Tooltip {...tooltipComun} formatter={(v) => [`$${Number(v).toLocaleString('es-CO')}`, 'Costo']} />
                <Bar dataKey="costoMateriales" name="Costo materiales" fill={c.costo} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400">Sin costos registrados en los últimos 6 meses.</p>}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-white">Cumplimiento SLA por mes</h2>
          {datos.serieMensual.some((m) => m.cumplimientoSLA !== null) ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={datos.serieMensual}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeComun} />
                <YAxis domain={[0, 100]} {...ejeComun} tickFormatter={(v) => `${v}%`} />
                <Tooltip {...tooltipComun} formatter={(v) => [`${v}%`, 'Cumplimiento SLA']} />
                <Line type="monotone" dataKey="cumplimientoSLA" name="SLA" stroke={c.sla} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400">Sin OT cerradas con SLA en los últimos 6 meses.</p>}
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold text-white">Activos más problemáticos</h2>
        {datos.activos_mas_problematicos.length ? (
          <ul className="space-y-1 text-sm">
            {datos.activos_mas_problematicos.map((a, i) => (
              <li key={i} className="text-slate-300">{a.numero_inventario}: {a.total} orden(es), ${a.costo.toLocaleString('es-CO')}</li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-400">Sin datos suficientes.</p>}
      </Card>
    </div>
  )
}

// ── Administración: Plantillas ───────────────────────────────────────────
function TabPlantillas() {
  const [items, setItems] = useState([{ texto: '', obligatorioParaCierre: false }])
  const [form, setForm] = useState({ nombre: '', tipoMantenimiento: '', tiempoEstimadoMinutos: '', procedimiento: '' })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function crear(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await plantillasApi.crear({ ...form, checklist: items.filter((i) => i.texto.trim()) })
      setOk('Plantilla creada')
      setForm({ nombre: '', tipoMantenimiento: '', tiempoEstimadoMinutos: '', procedimiento: '' })
      setItems([{ texto: '', obligatorioParaCierre: false }])
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Nueva plantilla de mantenimiento</h2>
      <form onSubmit={crear} className="space-y-3">
        <ErrorMsg>{error}</ErrorMsg>
        <OkMsg>{ok}</OkMsg>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre"><Input required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} /></Field>
          <Field label="Tipo de mantenimiento"><Input value={form.tipoMantenimiento} onChange={(e) => setForm((f) => ({ ...f, tipoMantenimiento: e.target.value }))} /></Field>
        </div>
        <Field label="Procedimiento"><Textarea value={form.procedimiento} onChange={(e) => setForm((f) => ({ ...f, procedimiento: e.target.value }))} /></Field>
        <div>
          <p className="panel-mono mb-1 text-xs uppercase text-cyan-400/80">Checklist</p>
          {items.map((it, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <Input placeholder="Ítem del checklist" value={it.texto} onChange={(e) => setItems((arr) => arr.map((x, j) => j === i ? { ...x, texto: e.target.value } : x))} />
              <label className="flex items-center gap-1 whitespace-nowrap text-xs text-slate-400">
                <input type="checkbox" checked={it.obligatorioParaCierre} onChange={(e) => setItems((arr) => arr.map((x, j) => j === i ? { ...x, obligatorioParaCierre: e.target.checked } : x))} />
                Obligatorio
              </label>
            </div>
          ))}
          <Btn variante="fantasma" onClick={() => setItems((arr) => [...arr, { texto: '', obligatorioParaCierre: false }])}>+ Ítem</Btn>
        </div>
        <Btn onClick={crear} disabled={guardando}>{guardando ? 'Guardando…' : 'Crear plantilla'}</Btn>
      </form>
    </Card>
  )
}

// ── Administración: Inventario ───────────────────────────────────────────
function TabInventarioAdmin() {
  const [form, setForm] = useState({ nombre: '', stock: 0, ubicacion: '', costo_unitario: 0 })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function crear(e) {
    e.preventDefault()
    setError('')
    try {
      await inventarioApi.crear(form)
      setOk(`Material "${form.nombre}" creado`)
      setForm({ nombre: '', stock: 0, ubicacion: '', costo_unitario: 0 })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Nuevo material de inventario</h2>
      <form onSubmit={crear} className="space-y-3">
        <ErrorMsg>{error}</ErrorMsg>
        <OkMsg>{ok}</OkMsg>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre"><Input required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} /></Field>
          <Field label="Stock inicial"><Input type="number" min="0" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} /></Field>
          <Field label="Ubicación"><Input value={form.ubicacion} onChange={(e) => setForm((f) => ({ ...f, ubicacion: e.target.value }))} /></Field>
          <Field label="Costo unitario"><Input type="number" min="0" value={form.costo_unitario} onChange={(e) => setForm((f) => ({ ...f, costo_unitario: e.target.value }))} /></Field>
        </div>
        <Btn onClick={crear}>Crear material</Btn>
      </form>
    </Card>
  )
}

const TABS = [
  { key: 'control', label: 'Centro de Control', Componente: TabCentroControl },
  { key: 'kanban', label: 'Kanban', Componente: TabKanban },
  { key: 'balance', label: 'Balance de Carga', Componente: TabBalanceCarga },
  { key: 'aprobaciones', label: 'Aprobaciones', Componente: TabAprobaciones },
  { key: 'calendario', label: 'Calendario', Componente: TabCalendario },
  { key: 'sla', label: 'SLA', Componente: TabSLA },
  { key: 'hallazgos', label: 'Hallazgos', Componente: TabHallazgos },
  { key: 'activos', label: 'Activos', Componente: TabActivos },
  { key: 'alertas', label: 'Alertas', Componente: TabAlertas },
  { key: 'dashboard', label: 'Panel de Control', Componente: TabDashboard },
  { key: 'plantillas', label: 'Plantillas', Componente: TabPlantillas },
  { key: 'inventario', label: 'Inventario', Componente: TabInventarioAdmin },
]

export default function SupervisorPage() {
  const [tab, setTab] = useState('control')
  const Activo = TABS.find((t) => t.key === tab)?.Componente

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Supervisor de Mantenimiento</h1>
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-cyan-400/10 bg-white/[0.02] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t.key ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {Activo && <Activo />}
    </div>
  )
}
