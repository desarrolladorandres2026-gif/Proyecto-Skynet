import { useState } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardList, Users, UserPlus, RefreshCw, Eye, Trash2, PackagePlus,
  CircleCheck, CircleDot, ChevronDown, Bot, History,
} from 'lucide-react'
import { danos as danosApi } from '../../api/danos.js'
import { useDatosConCache, invalidarCachePorPrefijo } from '../../hooks/useDatosConCache.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Select, Field, Textarea, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFechaHora,
} from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'

// Espejo de TRANSICIONES en Backend/src/modules/danos/danos.service.js — el
// backend sigue siendo la autoridad (valida cada cambio); esto solo evita
// ofrecerle al usuario un botón que iba a fallar con 409.
const TRANSICIONES = {
  pendiente: ['asignado', 'cancelado'],
  asignado: ['en_proceso', 'pendiente', 'cancelado'],
  en_proceso: ['en_espera', 'resuelto', 'pendiente', 'cancelado'],
  en_espera: ['en_proceso', 'pendiente', 'cancelado'],
  resuelto: ['en_proceso'],
  cancelado: ['pendiente'],
}

// 'asignado' no se ofrece como cambio de estado suelto: se llega ahí por el
// modal de Asignar, que es el que sabe a quién.
const ESTADO_LABELS = {
  pendiente: 'Pendiente (liberar)',
  asignado: 'Asignado',
  en_proceso: 'En proceso',
  en_espera: 'En espera',
  resuelto: 'Resuelto',
  cancelado: 'Cancelado',
}

const MOTIVOS_ESPERA = [
  { valor: 'repuestos', label: 'Esperando repuestos' },
  { valor: 'aprobacion', label: 'Esperando aprobación' },
  { valor: 'informacion', label: 'Falta información' },
  { valor: 'apoyo', label: 'Esperando apoyo' },
]

const FILTROS_ESTADO = [
  { valor: '', label: 'Todos los estados' },
  { valor: 'pendiente', label: 'Pendientes' },
  { valor: 'asignado', label: 'Asignados' },
  { valor: 'en_proceso', label: 'En proceso' },
  { valor: 'en_espera', label: 'En espera' },
  { valor: 'resuelto', label: 'Resueltos' },
  { valor: 'cancelado', label: 'Cancelados' },
]

const TIPOS = [
  { valor: '', label: 'Todos los tipos' },
  { valor: 'dano', label: 'Daño' },
  { valor: 'novedad', label: 'Novedad' },
  { valor: 'sugerencia', label: 'Sugerencia' },
  { valor: 'otro', label: 'Otro' },
]
const TIPO_LABELS = Object.fromEntries(TIPOS.filter((t) => t.valor).map((t) => [t.valor, t.label]))

const PRIORIDADES = ['baja', 'media', 'alta', 'critica']

// Espejo de la regla de listarTecnicosConCarga en el backend: un técnico está
// disponible si no tiene trabajo pendiente, y las tareas de baja prioridad no
// cuentan como pendientes. Vive en un solo lugar para que el panel del equipo y
// el modal de asignación nunca digan cosas distintas del mismo técnico.
function textoDisponibilidad(t) {
  if (!t.libre) {
    return `${t.activosPrioritarios} tarea${t.activosPrioritarios === 1 ? '' : 's'} pendiente${t.activosPrioritarios === 1 ? '' : 's'}`
  }
  if (t.activos === 0) return 'Disponible · sin tareas'
  return `Disponible · ${t.activos} de baja prioridad`
}

function Contador({ etiqueta, valor, resaltado = false }) {
  return (
    <Card className="flex-1 text-center">
      <p className={`text-2xl font-bold ${resaltado ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>{valor}</p>
      <p className="panel-mono text-[11px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">{etiqueta}</p>
    </Card>
  )
}

// ── Panel del equipo de mantenimiento ────────────────────────────────────

function PanelEquipo({ tecnicos, cargando }) {
  const [abierto, setAbierto] = useState(true)
  const libres = tecnicos.filter((t) => t.libre).length

  return (
    <Card className="mb-6">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 text-left"
      >
        <Users className="h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <span className="panel-mono text-sm font-semibold tracking-wide text-slate-900 dark:text-white">
          Equipo de mantenimiento
        </span>
        <span className="panel-mono text-[11px] text-slate-500 dark:text-slate-400">
          {cargando ? 'cargando…' : `${tecnicos.length} en total · ${libres} disponible${libres === 1 ? '' : 's'}`}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-slate-500 transition-transform duration-150 ${abierto ? '' : '-rotate-90'}`}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Un daño nuevo se asigna solo al técnico disponible que esté más suelto. Disponible = sin trabajo
          pendiente, o solo con tareas de baja prioridad. Si nadie lo está, el reporte queda sin asignar
          esperándote.
        </p>
      )}

      {abierto && (
        tecnicos.length === 0 && !cargando ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No hay usuarios activos con el permiso <code className="panel-mono">mantenimiento:ejecutar</code>.
            Asígnalo a un rol desde Roles y permisos para que aparezcan aquí.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tecnicos.map((t) => (
              <div key={t._id} className="rounded-lg border border-cyan-600/15 p-3 dark:border-cyan-400/10">
                <div className="flex items-center gap-2">
                  {t.libre ? (
                    <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  ) : (
                    <CircleDot className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  )}
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{t.nombre}</p>
                </div>
                <p className="panel-mono mt-1 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {textoDisponibilidad(t)}
                </p>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {t.asignados} asignada(s) · {t.enProceso} en proceso · {t.enEspera} en espera
                </p>
                {t.activosBaja > 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {t.activosBaja} de baja prioridad (no cuenta como carga)
                  </p>
                )}
                <p className="text-xs text-slate-400 dark:text-slate-500">{t.resueltos} resuelta(s) en total</p>
              </div>
            ))}
          </div>
        )
      )}
    </Card>
  )
}

// ── Modal: asignar ───────────────────────────────────────────────────────

function ModalAsignar({ reporte, tecnicos, puedeAsignarAOtros, miId, onCerrar, onConfirmar }) {
  const [tecnicoId, setTecnicoId] = useState('')
  const [nota, setNota] = useState('')
  const [forzar, setForzar] = useState(false)
  const [enviando, setEnviando] = useState(false)

  if (!reporte) return null
  const actual = reporte.asignadoA?._id
  const elegido = tecnicos.find((t) => t._id === tecnicoId)
  // Espejo de MAX_ACTIVAS_TECNICO en danos.service.js: solo es informativo,
  // el backend es quien realmente bloquea sin `forzar` (ver el mensaje de
  // error que sube confirmarAsignacion si se intenta sin marcar la casilla).
  const superaTope = elegido && elegido.activos >= 5

  async function confirmar() {
    if (!tecnicoId) return
    setEnviando(true)
    try {
      await onConfirmar(reporte, tecnicoId, nota, forzar)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal abierto titulo={actual ? 'Reasignar reporte' : 'Asignar reporte'} onCerrar={onCerrar} ancho="max-w-xl">
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{reporte.descripcion}</p>

      {!puedeAsignarAOtros && (
        <p className="mb-3 rounded-lg border border-cyan-600/25 bg-cyan-500/5 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
          Puedes tomar esta tarea para ti. Repartirla a otro compañero lo hace un supervisor.
        </p>
      )}

      <div className="max-h-72 space-y-2 overflow-y-auto">
        {tecnicos.map((t) => {
          const esYo = String(t._id) === String(miId)
          const bloqueado = !puedeAsignarAOtros && !esYo
          const yaLoTiene = String(t._id) === String(actual)
          return (
            <label
              key={t._id}
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                bloqueado || yaLoTiene
                  ? 'cursor-not-allowed border-slate-400/20 opacity-50'
                  : 'cursor-pointer border-cyan-600/20 hover:bg-cyan-600/5 dark:border-cyan-400/15 dark:hover:bg-cyan-400/5'
              }`}
            >
              <input
                type="radio"
                name="tecnico"
                value={t._id}
                disabled={bloqueado || yaLoTiene}
                checked={tecnicoId === t._id}
                onChange={(e) => setTecnicoId(e.target.value)}
                className="accent-cyan-600"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {t.nombre}{esYo ? ' (tú)' : ''}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {yaLoTiene ? 'Ya tiene este reporte' : textoDisponibilidad(t)}
                </p>
              </div>
              {t.libre && !yaLoTiene && (
                <span className="panel-mono shrink-0 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-700 ring-1 ring-inset ring-emerald-400/30 dark:text-emerald-300">
                  libre
                </span>
              )}
            </label>
          )
        })}
      </div>

      <Field label="Nota (opcional)" className="mt-4">
        <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Instrucciones para quien repara…" />
      </Field>

      {superaTope && (
        <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} className="mt-0.5 accent-cyan-600" />
          <span>
            {elegido.nombre} ya tiene {elegido.activos} órdenes activas (máximo 5 sin autorización). Marca esto
            para asignarle de todas formas.
          </span>
        </label>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Btn variante="secundario" onClick={onCerrar}>Cancelar</Btn>
        <Btn onClick={confirmar} disabled={!tecnicoId || enviando}>
          {enviando ? 'Asignando…' : 'Asignar'}
        </Btn>
      </div>
    </Modal>
  )
}

// ── Modal: cambiar estado ────────────────────────────────────────────────

function ModalEstado({ reporte, onCerrar, onConfirmar }) {
  const [estado, setEstado] = useState('')
  const [nota, setNota] = useState('')
  const [motivoEspera, setMotivoEspera] = useState('repuestos')
  const [prioridad, setPrioridad] = useState(reporte?.prioridad || 'media')
  const [enviando, setEnviando] = useState(false)

  if (!reporte) return null
  const opciones = TRANSICIONES[reporte.estado] || []
  // Misma regla que exigeNota en el service: si el backend la va a rechazar
  // sin nota, no dejamos que el botón se envíe vacío.
  const notaObligatoria =
    ['en_espera', 'cancelado', 'resuelto'].includes(estado) || reporte.estado === 'resuelto'

  async function confirmar() {
    setEnviando(true)
    try {
      await onConfirmar(reporte, {
        estado,
        nota,
        motivoEspera: estado === 'en_espera' ? motivoEspera : undefined,
        prioridad: prioridad !== reporte.prioridad ? prioridad : undefined,
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal abierto titulo="Cambiar estado" onCerrar={onCerrar} ancho="max-w-lg">
      <p className="mb-1 text-sm text-slate-600 dark:text-slate-300">{reporte.descripcion}</p>
      <p className="panel-mono mb-4 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Estado actual: <Badge valor={reporte.estado} />
      </p>

      <Field label="Nuevo estado">
        <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Selecciona…</option>
          {opciones.map((e) => (
            <option key={e} value={e}>{ESTADO_LABELS[e]}</option>
          ))}
        </Select>
      </Field>

      {estado === 'en_espera' && (
        <Field label="¿Qué está esperando?" className="mt-3">
          <Select value={motivoEspera} onChange={(e) => setMotivoEspera(e.target.value)}>
            {MOTIVOS_ESPERA.map((m) => (
              <option key={m.valor} value={m.valor}>{m.label}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Prioridad" className="mt-3">
        <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
          {PRIORIDADES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
      </Field>

      <Field label={`Nota${notaObligatoria ? '' : ' (opcional)'}`} className="mt-3">
        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder={notaObligatoria ? 'Explica el motivo de este cambio…' : 'Detalle de lo que hiciste…'}
        />
      </Field>

      {estado === 'en_espera' && motivoEspera === 'repuestos' && (
        <p className="mt-3 rounded-lg border border-cyan-600/25 bg-cyan-500/5 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
          Después de guardar, usa <strong>Solicitar repuesto</strong> en el detalle del reporte para crear el
          requerimiento del componente que necesitas.
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Btn variante="secundario" onClick={onCerrar}>Cancelar</Btn>
        <Btn onClick={confirmar} disabled={!estado || enviando || (notaObligatoria && !nota.trim())}>
          {enviando ? 'Guardando…' : 'Guardar cambio'}
        </Btn>
      </div>
    </Modal>
  )
}

// ── Modal: detalle ───────────────────────────────────────────────────────

function ModalDetalle({ reporte, onCerrar, onSolicitarRepuesto }) {
  if (!reporte) return null
  return (
    <Modal abierto titulo="Detalle del reporte" onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <Dato etiqueta="Tipo" valor={TIPO_LABELS[reporte.tipo] || 'Daño'} />
        <Dato etiqueta="Ocurrió" valor={fmtFechaHora(reporte.fecha)} />
        <Dato etiqueta="Estado"><Badge valor={reporte.estado} /></Dato>
        <Dato etiqueta="Prioridad"><Badge valor={reporte.prioridad} /></Dato>
        <Dato etiqueta="Reportado por" valor={reporte.reportadoPor?.nombre} />
        <Dato etiqueta="Dependencia" valor={reporte.reportadoPor?.dependencia} />
        <Dato etiqueta="Encargado de reparar">
          {reporte.asignadoA ? (
            <span className="flex items-center gap-1.5 text-sm text-slate-800 dark:text-slate-100">
              {reporte.asignadoA.nombre}
              {reporte.asignacionAutomatica && (
                <Bot className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" aria-label="Asignación automática" />
              )}
            </span>
          ) : (
            <span className="text-sm text-amber-700 dark:text-amber-300">Sin asignar</span>
          )}
        </Dato>
        <Dato
          etiqueta="Asignado"
          valor={reporte.asignadoEn
            ? `${fmtFechaHora(reporte.asignadoEn)}${reporte.asignacionAutomatica ? ' (automático)' : reporte.asignadoPor ? ` por ${reporte.asignadoPor.nombre}` : ''}`
            : '—'}
        />
        {reporte.motivoEspera && <Dato etiqueta="Esperando" valor={reporte.motivoEspera} />}
        {reporte.fechaResolucion && <Dato etiqueta="Resuelto" valor={fmtFechaHora(reporte.fechaResolucion)} />}
      </div>

      <Dato etiqueta="Descripción" className="mt-3">
        <p className="text-sm text-slate-700 dark:text-slate-200">{reporte.descripcion}</p>
      </Dato>

      {reporte.foto?.url && (
        <a href={reporte.foto.url} target="_blank" rel="noreferrer" className="mt-3 block">
          <img src={reporte.foto.url} alt="Evidencia del reporte" className="max-h-64 rounded-lg object-contain" />
        </a>
      )}

      {reporte.reparacion?.fecha && (
        <div className="mt-4 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
          <p className="panel-mono text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Reparación registrada
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
            {fmtFechaHora(reporte.reparacion.fecha)} ·{' '}
            {{ regional: 'Regional', centenario: 'Centenario', modulo_mixto: 'Módulo Mixto' }[reporte.reparacion.modulo] || reporte.reparacion.modulo}
          </p>
          {reporte.reparacion.evidencias?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {reporte.reparacion.evidencias.map((ev, i) => (
                <a key={i} href={ev.url} target="_blank" rel="noreferrer">
                  <img src={ev.url} alt="Evidencia de la reparación" className="h-16 w-16 rounded object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <p className="panel-mono flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-cyan-700/80 dark:text-cyan-400/80">
          <PackagePlus className="h-3.5 w-3.5" aria-hidden="true" />
          Requerimientos ({reporte.requerimientos?.length || 0})
        </p>
        <Btn variante="secundario" onClick={() => onSolicitarRepuesto(reporte)} className="flex items-center gap-1.5">
          <PackagePlus className="h-3.5 w-3.5" aria-hidden="true" /> Solicitar repuesto
        </Btn>
      </div>
      {reporte.requerimientos?.length > 0 && (
        <ul className="mt-2 space-y-1">
          {reporte.requerimientos.map((r) => (
            <li key={r._id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <Badge valor={r.estado} />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {r.tipo} · {fmtFechaHora(r.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="panel-mono mt-5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-cyan-700/80 dark:text-cyan-400/80">
        <History className="h-3.5 w-3.5" aria-hidden="true" /> Historial
      </p>
      <ol className="mt-2 space-y-2 border-l border-cyan-600/20 pl-4 dark:border-cyan-400/15">
        {[...(reporte.historial || [])].reverse().map((h, i) => (
          <li key={i} className="text-sm">
            <p className="text-slate-700 dark:text-slate-200">
              <span className="panel-mono text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-400">{h.accion}</span>
              {h.de && h.a && <span className="text-slate-500 dark:text-slate-400"> · {h.de} → {h.a}</span>}
            </p>
            {h.nota && <p className="text-slate-600 dark:text-slate-300">{h.nota}</p>}
            <p className="text-xs text-slate-400 dark:text-slate-500">{h.nombrePor} · {fmtFechaHora(h.fecha)}</p>
          </li>
        ))}
      </ol>
    </Modal>
  )
}

function Dato({ etiqueta, valor, children, className = '' }) {
  return (
    <div className={className}>
      <p className="panel-mono text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{etiqueta}</p>
      {children || <p className="text-sm text-slate-800 dark:text-slate-100">{valor || '—'}</p>}
    </div>
  )
}

// ── Página ───────────────────────────────────────────────────────────────

export default function TareasDanosPage() {
  const { usuario, tienePermiso } = useAuth()
  const navigate = useNavigate()
  const puedeAsignarAOtros = tienePermiso('mantenimiento:asignar')

  const [filtros, setFiltros] = useState({ estado: '', tipo: '', asignado: '' })
  const [ok, setOk] = useState('')

  const [asignando, setAsignando] = useState(null)
  const [cambiando, setCambiando] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  // Clave por filtro: cambiar de pestaña de filtro y volver ya no repite la
  // petición si la caché sigue vigente.
  const { data, cargando, error, recargar } = useDatosConCache(
    `danos:tareas:${filtros.estado}:${filtros.tipo}:${filtros.asignado}`,
    () => danosApi.listar(filtros),
    { ttlMs: 20_000 },
  )
  const reportes = data?.reportes || []
  const resumen = data?.resumen || {}

  // La carga del equipo va aparte de la de reportes: cambiar un filtro no
  // debería volver a pedir la plantilla entera, pero sí hay que refrescarla
  // después de asignar (cambian los contadores de carga).
  const { data: tecnicosData, cargando: cargandoTecnicos, recargar: recargarTecnicos } = useDatosConCache(
    'danos:tecnicos',
    () => danosApi.tecnicos().then((d) => d.tecnicos),
    { ttlMs: 30_000 },
  )
  const tecnicos = tecnicosData || []

  function recargarTodo() {
    invalidarCachePorPrefijo('danos:tareas:')
    recargar()
    recargarTecnicos()
  }

  function setFiltro(clave, valor) {
    setFiltros((f) => ({ ...f, [clave]: valor }))
  }

  async function confirmarAsignacion(reporte, tecnicoId, nota, forzar) {
    setOk('')
    try {
      const { reporte: actualizado } = await danosApi.asignar(reporte._id, tecnicoId, nota, forzar)
      setOk(`Reporte asignado a ${actualizado.asignadoA?.nombre}. Se le envió una notificación.`)
      setAsignando(null)
      recargarTodo()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function confirmarEstado(reporte, cambios) {
    setOk('')
    try {
      await danosApi.cambiarEstado(reporte._id, cambios)
      setOk(`Reporte actualizado a "${cambios.estado}".`)
      setCambiando(null)
      recargarTodo()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function verDetalle(reporte) {
    setErrorDetalle('')
    try {
      const { reporte: completo } = await danosApi.detalle(reporte._id)
      setDetalle(completo)
    } catch (err) {
      toast.error(err.message)
    }
  }

  // El requerimiento nace enlazado al daño: NuevoRequerimientoPage lee ?dano=
  // y lo manda como origenDano, y el backend cierra el vínculo por los dos
  // lados (ver Backend/src/modules/requerimientos/requerimientos.service.js).
  function solicitarRepuesto(reporte) {
    navigate(`/requerimientos/nuevo?dano=${reporte._id}`)
  }

  async function confirmarEliminar() {
    if (!porEliminar) return
    setOk('')
    setEliminando(true)
    try {
      await danosApi.eliminar(porEliminar._id)
      setOk('Reporte eliminado')
      recargarTodo()
    } catch (err) {
      toast.error(err.message)
    } finally {
      // Se cierra pase lo que pase: el aviso de error vive en la página
      // (ErrorMsg) y el overlay del diálogo lo taparía.
      setEliminando(false)
      setPorEliminar(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <ClipboardList className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Reportes de usuarios
        </h1>
        <div className="flex flex-wrap gap-2">
          <Select value={filtros.asignado} onChange={(e) => setFiltro('asignado', e.target.value)} className="w-48">
            <option value="">Todo el equipo</option>
            <option value="sin">Sin asignar</option>
            <option value="mi">Mis tareas</option>
            {tecnicos.map((t) => (
              <option key={t._id} value={t._id}>{t.nombre}</option>
            ))}
          </Select>
          <Select value={filtros.tipo} onChange={(e) => setFiltro('tipo', e.target.value)} className="w-44">
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>{t.label}</option>
            ))}
          </Select>
          <Select value={filtros.estado} onChange={(e) => setFiltro('estado', e.target.value)} className="w-44">
            {FILTROS_ESTADO.map((f) => (
              <option key={f.valor} value={f.valor}>{f.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Contador etiqueta="Sin asignar" valor={resumen.sinAsignar || 0} resaltado />
        <Contador etiqueta="Asignados" valor={resumen.asignado || 0} />
        <Contador etiqueta="En proceso" valor={resumen.en_proceso || 0} />
        <Contador etiqueta="En espera" valor={resumen.en_espera || 0} />
        <Contador etiqueta="Resueltos" valor={resumen.resuelto || 0} />
      </div>

      <PanelEquipo tecnicos={tecnicos} cargando={cargandoTecnicos} />

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : reportes.length === 0 ? (
        <EmptyState mensaje="No hay reportes con estos filtros" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Tipo</Th>
              <Th>Prioridad</Th>
              <Th>Reportado por</Th>
              <Th>Descripción</Th>
              <Th>Foto</Th>
              <Th>Estado</Th>
              <Th>Encargado</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {reportes.map((r) => (
              <tr key={r._id}>
                <Td className="whitespace-nowrap">{fmtFechaHora(r.fecha)}</Td>
                <Td className="whitespace-nowrap">{TIPO_LABELS[r.tipo] || 'Daño'}</Td>
                <Td><Badge valor={r.prioridad} /></Td>
                <Td>
                  <p className="text-slate-700 dark:text-slate-200">{r.reportadoPor?.nombre || '—'}</p>
                  {r.reportadoPor?.dependencia && (
                    <p className="text-xs text-slate-500">{r.reportadoPor.dependencia}</p>
                  )}
                </Td>
                <Td className="max-w-xs">{r.descripcion}</Td>
                <Td>
                  {r.foto?.url ? (
                    <a href={r.foto.url} target="_blank" rel="noreferrer" title="Ver foto completa">
                      <img src={r.foto.url} alt="Foto adjunta" className="h-14 w-14 rounded object-cover" />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Td>
                <Td>
                  <Badge valor={r.estado} />
                  {r.motivoEspera && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.motivoEspera}</p>
                  )}
                </Td>
                <Td>
                  {r.asignadoA ? (
                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                      {r.asignadoA.nombre}
                      {r.asignacionAutomatica && (
                        <Bot className="h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" aria-label="Asignado automáticamente" />
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700 dark:text-amber-300">Sin asignar</span>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <Btn
                      variante="fantasma"
                      onClick={() => verDetalle(r)}
                      title="Ver detalle e historial"
                      className="!px-2"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    </Btn>
                    {!['resuelto', 'cancelado'].includes(r.estado) && (
                      <Btn
                        variante="secundario"
                        onClick={() => setAsignando(r)}
                        title="Asignar a un técnico de mantenimiento"
                        className="flex items-center gap-1.5 !px-2.5"
                      >
                        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Asignar
                      </Btn>
                    )}
                    <Btn
                      onClick={() => setCambiando(r)}
                      title="Cambiar el estado del reporte"
                      className="flex items-center gap-1.5 !px-2.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Cambiar estado
                    </Btn>
                    {puedeAsignarAOtros && (
                      <Btn variante="peligro" onClick={() => setPorEliminar(r)} title="Eliminar reporte" className="!px-2.5">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Btn>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      {asignando && (
        <ModalAsignar
          reporte={asignando}
          tecnicos={tecnicos}
          puedeAsignarAOtros={puedeAsignarAOtros}
          miId={usuario?.id_usuario}
          onCerrar={() => setAsignando(null)}
          onConfirmar={confirmarAsignacion}
        />
      )}
      {cambiando && (
        <ModalEstado reporte={cambiando} onCerrar={() => setCambiando(null)} onConfirmar={confirmarEstado} />
      )}
      {detalle && (
        <ModalDetalle reporte={detalle} onCerrar={() => setDetalle(null)} onSolicitarRepuesto={solicitarRepuesto} />
      )}

      <ConfirmDialog
        abierto={Boolean(porEliminar)}
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={confirmarEliminar}
        cargando={eliminando}
        titulo="¿Eliminar este reporte?"
        descripcion={`Se borrará el reporte${porEliminar?.foto?.url ? ' junto con su foto' : ''}. Esta acción no se puede deshacer.`}
        confirmarLabel="Eliminar"
      />
    </div>
  )
}
