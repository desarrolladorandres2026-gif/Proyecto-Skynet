import { useState } from 'react'
import { ShieldAlert, Pencil, Play } from 'lucide-react'
import { toast } from 'sonner'
import { sig } from '../../api/sig.js'
import { catalogosApi } from '../../api/catalogos.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import {
  Card,
  ErrorMsg,
  Badge,
  TablaWrap,
  Th,
  Td,
  EmptyState,
  fmtFecha,
  Modal,
  Field,
  Select,
  Input,
  Textarea,
  Btn,
} from '../../components/ui.jsx'
import FiltrosDashboardSig from '../../components/sig/FiltrosDashboardSig.jsx'

const FILTROS_VACIOS = { desde: '', hasta: '', dependencia: '', cargo: '', componenteSig: '', tema: '' }

const ESTADO_LABEL = { pendiente: 'Pendiente', en_progreso: 'En progreso', completado: 'Completado', descartado: 'Descartado' }

// Identifica automáticamente a quién le hace falta refuerzo (nivel Bajo o
// Crítico) según los umbrales configurados. La gestión (acción de
// capacitación, fecha programada, observaciones, estado) se hace desde el
// modal de edición: quien la registra queda como responsable del plan
// (ver actualizarPlanRefuerzo en el backend).
function ModalGestionPlan({ plan, onCerrar, onGuardado }) {
  const [form, setForm] = useState({
    estado: plan.estado,
    accionCapacitacion: plan.accionCapacitacion || '',
    fechaProgramada: plan.fechaProgramada ? plan.fechaProgramada.slice(0, 10) : '',
    observaciones: plan.observaciones || '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      const { plan: actualizado } = await sig.actualizarPlanRefuerzo(plan._id, {
        ...form,
        fechaProgramada: form.fechaProgramada || null,
      })
      onGuardado(actualizado)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto titulo={`Gestionar refuerzo — ${plan.usuario?.nombre || '(usuario eliminado)'}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <ErrorMsg>{error}</ErrorMsg>
        <div className="text-sm text-slate-600 dark:text-slate-300">
          {plan.componenteSig}
          {plan.tema ? ` · ${plan.tema}` : ''} — {plan.porcentajeAcierto}% de acierto
        </div>
        <Field label="Estado">
          <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
            {Object.entries(ESTADO_LABEL).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Acción de capacitación">
          <Input
            value={form.accionCapacitacion}
            onChange={(e) => setForm({ ...form, accionCapacitacion: e.target.value })}
            placeholder="Ej. Charla de refuerzo, capacitación puntual…"
          />
        </Field>
        <Field label="Fecha programada">
          <Input
            type="date"
            value={form.fechaProgramada}
            onChange={(e) => setForm({ ...form, fechaProgramada: e.target.value })}
          />
        </Field>
        <Field label="Observaciones">
          <Textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Btn variante="secundario" onClick={onCerrar}>
            Cancelar
          </Btn>
          <Btn onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

export default function PlanRefuerzoPage() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [planEditando, setPlanEditando] = useState(null)
  const [iniciando, setIniciando] = useState(null)

  // Componentes/catálogos casi no cambian entre sesiones: caché de 5 minutos
  // aparte de los planes, que sí dependen del filtro aplicado.
  const { data: configYCatalogos } = useDatosConCache(
    'sig:planRefuerzo:configYCatalogos',
    () => Promise.all([sig.configuracion.obtener(), catalogosApi.obtener()])
      .then(([config, cat]) => ({ componentes: config.configuracion.componentes, catalogos: cat })),
    { ttlMs: 5 * 60_000 },
  )
  const componentes = configYCatalogos?.componentes || []
  const catalogos = configYCatalogos?.catalogos || { dependencias: [], cargos: [] }

  // Clave por filtro: cada combinación de filtros tiene su propia entrada de
  // caché, así que volver a un filtro ya consultado no repite la petición.
  const {
    data: planes,
    cargando,
    error,
    recargar,
    actualizarLocal: actualizarPlanes,
  } = useDatosConCache(
    `sig:planRefuerzo:planes:${JSON.stringify(filtros)}`,
    () => sig.planRefuerzo(filtros).then((p) => p.planes),
    { ttlMs: 30_000 },
  )

  // Atajo para el caso más común: pasar de 'pendiente' a 'en_progreso' sin
  // abrir el modal completo de gestión (que sigue disponible para cargar
  // acción de capacitación, fecha y observaciones).
  async function iniciarRefuerzo(plan) {
    setIniciando(plan._id)
    try {
      const { plan: actualizado } = await sig.actualizarPlanRefuerzo(plan._id, { estado: 'en_progreso' })
      actualizarPlanes((lista) => lista.map((p) => (p._id === actualizado._id ? actualizado : p)))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setIniciando(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <ShieldAlert className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">Plan de refuerzo</h1>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <FiltrosDashboardSig
        filtros={filtros}
        onChange={setFiltros}
        onAplicar={recargar}
        componentes={componentes}
        catalogos={catalogos}
        mostrarResultado={false}
      />

      {cargando || !planes ? (
        <Card>Cargando…</Card>
      ) : planes.length === 0 ? (
        <EmptyState mensaje="Nadie está en nivel Bajo o Crítico en el rango filtrado" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Trabajador</Th>
              <Th>Área</Th>
              <Th>Componente</Th>
              <Th>Tema con dificultad</Th>
              <Th>Nivel</Th>
              <Th>Acierto</Th>
              <Th>Detectado</Th>
              <Th>Estado</Th>
              <Th>Acción</Th>
            </tr>
          </thead>
          <tbody>
            {planes.map((p) => (
              <tr key={p._id}>
                <Td>{p.usuario?.nombre || '(usuario eliminado)'}</Td>
                <Td>{p.usuario?.dependencia || '—'}</Td>
                <Td>{p.componenteSig}</Td>
                <Td>{p.tema || '—'}</Td>
                <Td><Badge valor={p.nivelDetectado} label={p.nivelDetectado} /></Td>
                <Td>{p.porcentajeAcierto}%</Td>
                <Td className="whitespace-nowrap">{fmtFecha(p.fechaDeteccion)}</Td>
                <Td><Badge valor={p.estado} label={ESTADO_LABEL[p.estado]} /></Td>
                <Td className="whitespace-nowrap">
                  {p.estado === 'pendiente' && (
                    <Btn variante="fantasma" onClick={() => iniciarRefuerzo(p)} disabled={iniciando === p._id}>
                      <Play className="h-4 w-4" aria-hidden="true" />
                      {iniciando === p._id ? 'Iniciando…' : 'Iniciar refuerzo'}
                    </Btn>
                  )}
                  <Btn variante="fantasma" onClick={() => setPlanEditando(p)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Gestionar
                  </Btn>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      {planEditando && (
        <ModalGestionPlan
          plan={planEditando}
          onCerrar={() => setPlanEditando(null)}
          onGuardado={(actualizado) => {
            actualizarPlanes((lista) => lista.map((p) => (p._id === actualizado._id ? actualizado : p)))
            setPlanEditando(null)
          }}
        />
      )}
    </div>
  )
}
