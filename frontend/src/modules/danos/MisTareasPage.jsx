import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Wrench, Camera, Images, X, History, RefreshCw, MapPin,
} from 'lucide-react'
import { danos as danosApi } from '../../api/danos.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { normalizarFoto } from '../../utils/normalizarFoto.js'
import {
  Btn, Badge, ErrorMsg, OkMsg, Field, Select, Input, Textarea,
  EmptyState, fmtFechaHora,
} from '../../components/ui.jsx'
import { ListRow, BottomSheet, ChipTabs, SectionHeader } from '../../components/mobileUi.jsx'

// "Mis tareas": la única pantalla de daños que ve el personal de
// mantenimiento (rol con mantenimiento:ejecutar sin danos:gestionar). No hay
// botón de crear, asignar, reasignar ni eliminar — el backend ya lo bloquea
// (ver danos.routes.js/danos.service.js), esta página simplemente no ofrece
// esos controles. El listado ya viene recortado a "lo mío" por el backend
// (puedeVerTodo() en danos.service.js), pase lo que pase en los filtros.

// Espejo recortado de TRANSICIONES en danos.service.js: un técnico nunca
// puede volver un reporte a 'pendiente' (eso es liberar/reasignar, exclusivo
// de supervisión) — el resto de los 4 estados de la regla de negocio
// ("En proceso", "Reparado", "Solicitar apoyo", "Cancelado") sí están aquí.
const TRANSICIONES_TECNICO = {
  asignado: ['en_proceso', 'cancelado'],
  en_proceso: ['en_espera', 'resuelto', 'cancelado'],
  en_espera: ['en_proceso', 'cancelado'],
  resuelto: ['en_proceso'],
  cancelado: [],
}

const ESTADO_LABELS = {
  en_proceso: 'En proceso',
  resuelto: 'Reparado',
  en_espera: 'Solicitar apoyo',
  cancelado: 'Cancelado',
}

const MOTIVOS_ESPERA = [
  { valor: 'apoyo', label: 'Necesito apoyo de un compañero' },
  { valor: 'repuestos', label: 'Esperando repuestos' },
  { valor: 'aprobacion', label: 'Esperando aprobación' },
  { valor: 'informacion', label: 'Falta información' },
]

const MODULOS_TRABAJO = [
  { valor: 'regional', label: 'Regional' },
  { valor: 'centenario', label: 'Centenario' },
  { valor: 'modulo_mixto', label: 'Módulo Mixto' },
]

const TABS = [
  { value: '', label: 'Todas' },
  { value: 'asignado', label: 'Por iniciar' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'en_espera', label: 'En espera' },
  { value: 'resuelto', label: 'Reparadas' },
  { value: 'cancelado', label: 'Canceladas' },
]

// "YYYY-MM-DDTHH:mm" local para el value por defecto de datetime-local.
function ahoraLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// ── Hoja: cambiar estado ─────────────────────────────────────────────────

function HojaEstado({ reporte, onCerrar, onConfirmar }) {
  const [estado, setEstado] = useState('')
  const [nota, setNota] = useState('')
  const [motivoEspera, setMotivoEspera] = useState('apoyo')
  const [fechaReparacion, setFechaReparacion] = useState(ahoraLocal())
  const [modulo, setModulo] = useState('')
  const [fotos, setFotos] = useState([])
  const [procesandoFoto, setProcesandoFoto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorLocal, setErrorLocal] = useState('')
  const inputCamaraRef = useRef(null)
  const inputGaleriaRef = useRef(null)

  const opciones = TRANSICIONES_TECNICO[reporte.estado] || []
  const esReparado = estado === 'resuelto'
  const esApoyo = estado === 'en_espera'
  const notaObligatoria = ['en_espera', 'cancelado', 'resuelto'].includes(estado)

  async function agregarFotos(archivos) {
    if (!archivos?.length) return
    setProcesandoFoto(true)
    try {
      const normalizadas = await Promise.all([...archivos].slice(0, 5 - fotos.length).map(normalizarFoto))
      setFotos((f) => [...f, ...normalizadas].slice(0, 5))
    } finally {
      setProcesandoFoto(false)
    }
  }

  function quitarFoto(i) {
    setFotos((f) => f.filter((_, idx) => idx !== i))
  }

  async function confirmar() {
    setErrorLocal('')
    if (esReparado) {
      if (!fechaReparacion) return setErrorLocal('La fecha de la reparación es obligatoria')
      if (!modulo) return setErrorLocal('Selecciona el módulo donde se hizo el trabajo')
      if (fotos.length === 0) return setErrorLocal('Adjunta al menos una foto de evidencia')
    }
    if (notaObligatoria && !nota.trim()) return setErrorLocal('Escribe una nota explicando este cambio')

    setEnviando(true)
    try {
      await onConfirmar(reporte, {
        estado,
        nota,
        motivoEspera: esApoyo ? motivoEspera : undefined,
        reparacionFecha: esReparado ? new Date(fechaReparacion).toISOString() : undefined,
        reparacionModulo: esReparado ? modulo : undefined,
        evidencias: esReparado ? fotos : undefined,
      })
    } catch (err) {
      setErrorLocal(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <BottomSheet abierto titulo="Cambiar estado" onCerrar={onCerrar}>
      <p className="mb-1 text-sm text-[var(--mobile-text-dim)]">{reporte.descripcion}</p>
      <p className="mb-4 flex items-center gap-1.5 text-xs">
        Estado actual: <Badge valor={reporte.estado} />
      </p>

      <ErrorMsg>{errorLocal}</ErrorMsg>

      <Field label="Nuevo estado">
        <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Selecciona…</option>
          {opciones.map((e) => (
            <option key={e} value={e}>{ESTADO_LABELS[e]}</option>
          ))}
        </Select>
      </Field>

      {esApoyo && (
        <Field label="¿Qué necesitas?" className="mt-3">
          <Select value={motivoEspera} onChange={(e) => setMotivoEspera(e.target.value)}>
            {MOTIVOS_ESPERA.map((m) => (
              <option key={m.valor} value={m.valor}>{m.label}</option>
            ))}
          </Select>
        </Field>
      )}

      {esReparado && (
        <>
          <Field label="Fecha de la reparación" className="mt-3">
            <Input type="datetime-local" value={fechaReparacion} max={ahoraLocal()} onChange={(e) => setFechaReparacion(e.target.value)} />
          </Field>
          <Field label="Módulo donde se hizo el trabajo" className="mt-3">
            <Select value={modulo} onChange={(e) => setModulo(e.target.value)}>
              <option value="">Selecciona…</option>
              {MODULOS_TRABAJO.map((m) => (
                <option key={m.valor} value={m.valor}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label={`Evidencia fotográfica (${fotos.length}/5)`} className="mt-3">
            <input ref={inputCamaraRef} type="file" accept="image/*" capture="environment" multiple
              onChange={(e) => { agregarFotos(e.target.files); e.target.value = '' }} className="sr-only" />
            <input ref={inputGaleriaRef} type="file" accept="image/*" multiple
              onChange={(e) => { agregarFotos(e.target.files); e.target.value = '' }} className="sr-only" />
            <div className="flex gap-2">
              <Btn type="button" variante="secundario" disabled={procesandoFoto || fotos.length >= 5}
                onClick={() => inputCamaraRef.current?.click()} className="flex flex-1 items-center justify-center gap-2">
                <Camera className="h-4 w-4" aria-hidden="true" /> Cámara
              </Btn>
              <Btn type="button" variante="secundario" disabled={procesandoFoto || fotos.length >= 5}
                onClick={() => inputGaleriaRef.current?.click()} className="flex flex-1 items-center justify-center gap-2">
                <Images className="h-4 w-4" aria-hidden="true" /> Galería
              </Btn>
            </div>
            {fotos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {fotos.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} alt="Evidencia" className="h-16 w-16 rounded-lg object-cover" />
                    <button type="button" onClick={() => quitarFoto(i)} aria-label="Quitar foto"
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-black/60 p-1 text-white">
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Field>
        </>
      )}

      <Field label={`Nota${notaObligatoria ? '' : ' (opcional)'}`} className="mt-3">
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)}
          placeholder={notaObligatoria ? 'Explica el motivo de este cambio…' : 'Detalle de lo que hiciste…'} />
      </Field>

      <div className="mt-4 flex justify-end gap-2">
        <Btn variante="secundario" onClick={onCerrar}>Cancelar</Btn>
        <Btn onClick={confirmar} disabled={!estado || enviando || procesandoFoto}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </Btn>
      </div>
    </BottomSheet>
  )
}

// ── Hoja: detalle (solo lectura + historial) ────────────────────────────

function HojaDetalle({ reporte, onCerrar, onCambiarEstado }) {
  return (
    <BottomSheet abierto titulo="Detalle" onCerrar={onCerrar}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge valor={reporte.estado} />
          <Badge valor={reporte.prioridad} />
        </div>
        <p className="text-sm text-[var(--mobile-text)]">{reporte.descripcion}</p>
        <p className="text-xs text-[var(--mobile-text-dim)]">Ocurrió: {fmtFechaHora(reporte.fecha)}</p>
        {reporte.reportadoPor?.nombre && (
          <p className="text-xs text-[var(--mobile-text-dim)]">
            Reportado por {reporte.reportadoPor.nombre}
            {reporte.reportadoPor.dependencia ? ` · ${reporte.reportadoPor.dependencia}` : ''}
          </p>
        )}
        {reporte.foto?.url && (
          <a href={reporte.foto.url} target="_blank" rel="noreferrer">
            <img src={reporte.foto.url} alt="Evidencia del reporte" className="max-h-56 w-full rounded-xl object-contain" />
          </a>
        )}

        {reporte.reparacion?.fecha && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Reparación registrada
            </p>
            <p className="mt-1 text-xs text-[var(--mobile-text-dim)]">
              {fmtFechaHora(reporte.reparacion.fecha)} · {MODULOS_TRABAJO.find((m) => m.valor === reporte.reparacion.modulo)?.label || reporte.reparacion.modulo}
            </p>
            {reporte.reparacion.evidencias?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {reporte.reparacion.evidencias.map((ev, i) => (
                  <a key={i} href={ev.url} target="_blank" rel="noreferrer">
                    <img src={ev.url} alt="Evidencia de la reparación" className="h-14 w-14 rounded-lg object-cover" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        <SectionHeader className="mt-4 flex items-center gap-2">
          <History className="h-3.5 w-3.5" aria-hidden="true" /> Historial
        </SectionHeader>
        <ol className="space-y-2 border-l border-[var(--mobile-accent-soft)] pl-4">
          {[...(reporte.historial || [])].reverse().map((h, i) => (
            <li key={i} className="text-sm">
              <p className="text-[var(--mobile-text)]">
                <span className="text-xs tracking-wide text-[var(--mobile-accent)] uppercase">{h.accion}</span>
                {h.de && h.a && <span className="text-[var(--mobile-text-dim)]"> · {h.de} → {h.a}</span>}
              </p>
              {h.nota && <p className="text-[var(--mobile-text-dim)]">{h.nota}</p>}
              <p className="text-xs text-[var(--mobile-text-dim)]">{h.nombrePor} · {fmtFechaHora(h.fecha)}</p>
            </li>
          ))}
        </ol>
      </div>

      {(TRANSICIONES_TECNICO[reporte.estado] || []).length > 0 && (
        <div className="mt-5 flex justify-end">
          <Btn onClick={() => onCambiarEstado(reporte)} className="flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Cambiar estado
          </Btn>
        </div>
      )}
    </BottomSheet>
  )
}

// ── Página ───────────────────────────────────────────────────────────────

export default function MisTareasPage() {
  const [tab, setTab] = useState('')
  const [ok, setOk] = useState('')
  const [detalle, setDetalle] = useState(null)
  const [cambiando, setCambiando] = useState(null)

  // asignado:'mi' es solo un gesto de intención — el backend fuerza este
  // alcance de todas formas para quien no tiene danos:gestionar.
  const { data, cargando, error, recargar } = useDatosConCache(
    `danos:misTareas:${tab}`,
    () => danosApi.listar({ estado: tab || undefined, asignado: 'mi' }),
    { ttlMs: 20_000 },
  )
  const reportes = data?.reportes || []
  const resumen = data?.resumen || {}

  async function confirmarEstado(reporte, cambios) {
    setOk('')
    await danosApi.cambiarEstado(reporte._id, cambios)
    setOk(`Actualizado a "${ESTADO_LABELS[cambios.estado] || cambios.estado}".`)
    setCambiando(null)
    setDetalle(null)
    recargar()
  }

  async function abrirDetalle(reporte) {
    try {
      const { reporte: completo } = await danosApi.detalle(reporte._id)
      setDetalle(completo)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const tabsConContador = TABS.map((t) => ({
    ...t,
    count: t.value ? resumen[t.value] : undefined,
  }))

  return (
    <div className="mx-auto max-w-md md:max-w-2xl">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold text-[var(--mobile-text)]">
        <Wrench className="h-5 w-5 text-[var(--mobile-accent)]" aria-hidden="true" /> Mis tareas
      </h1>
      <p className="mb-4 text-sm text-[var(--mobile-text-dim)]">
        Solo ves lo que tienes asignado a ti.
      </p>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      <ChipTabs opciones={tabsConContador} valor={tab} onChange={setTab} className="mb-4" />

      {cargando ? (
        <p className="text-sm text-[var(--mobile-text-dim)]">Cargando…</p>
      ) : reportes.length === 0 ? (
        <EmptyState mensaje="No tienes tareas con este filtro" />
      ) : (
        <div className="flex flex-col gap-2">
          {reportes.map((r) => (
            <ListRow
              key={r._id}
              leading={
                r.foto?.url ? (
                  <img src={r.foto.url} alt="Foto adjunta" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                ) : undefined
              }
              icon={r.foto?.url ? undefined : Wrench}
              title={r.descripcion}
              subtitle={`${fmtFechaHora(r.fecha)} · ${r.prioridad}`}
              badge={<Badge valor={r.estado} />}
              onClick={() => abrirDetalle(r)}
            />
          ))}
        </div>
      )}

      {detalle && (
        <HojaDetalle reporte={detalle} onCerrar={() => setDetalle(null)} onCambiarEstado={setCambiando} />
      )}
      {cambiando && (
        <HojaEstado reporte={cambiando} onCerrar={() => setCambiando(null)} onConfirmar={confirmarEstado} />
      )}
    </div>
  )
}
