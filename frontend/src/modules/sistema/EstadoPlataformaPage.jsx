import { useCallback, useEffect, useState } from 'react'
import { Activity, CalendarClock, Power, PlayCircle, StopCircle, Trash2, History, ShieldAlert } from 'lucide-react'
import { plataforma } from '../../api/plataforma.js'
import {
  usePlataforma,
  useCuentaRegresiva,
  formatearRestante,
  formatearFechaHora,
} from '../../plataforma/PlataformaContext.jsx'
import { Btn, Card, ErrorMsg, OkMsg, Field, Input, Textarea, Modal, EmptyState, TablaWrap, Th, Td, Pager } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'

// ── Fechas para <input type="datetime-local"> ───────────────────────────────
// El input NO acepta offset: espera "YYYY-MM-DDTHH:mm" en hora local. Se
// formatea explícitamente en la zona del Terminal en vez de dejar que el
// navegador use la suya, para que un equipo con el huso mal configurado (algo
// que sí pasa en el parque de máquinas del Terminal) no muestre ni mande una
// hora distinta a la que verá el resto de la gente. El backend hace la
// conversión simétrica con instanteLocal() (utils/fechas.js).
function aInputDateTime(valor) {
  if (!valor) return ''
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // h23 y no hour12:false: este último devuelve "24" para la medianoche en
    // algunos motores, y "2026-08-22T24:00" es un valor inválido para el input.
    hourCycle: 'h23',
  }).formatToParts(new Date(valor))
  const g = (tipo) => partes.find((p) => p.type === tipo)?.value || '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

const ESTILO_ESTADO = {
  operativa: {
    punto: 'bg-emerald-500',
    halo: 'bg-emerald-500/20',
    texto: 'text-emerald-700 dark:text-emerald-300',
    borde: 'border-emerald-500/30',
    fondo: 'bg-emerald-500/[0.06]',
    etiqueta: 'Plataforma operativa',
  },
  programado: {
    punto: 'bg-amber-500',
    halo: 'bg-amber-500/20',
    texto: 'text-amber-700 dark:text-amber-300',
    borde: 'border-amber-500/30',
    fondo: 'bg-amber-500/[0.07]',
    etiqueta: 'Mantenimiento programado',
  },
  en_mantenimiento: {
    punto: 'bg-red-500',
    halo: 'bg-red-500/25',
    texto: 'text-red-700 dark:text-red-300',
    borde: 'border-red-500/35',
    fondo: 'bg-red-500/[0.08]',
    etiqueta: 'Mantenimiento activo',
  },
}

const ETIQUETA_EVENTO = {
  programado: 'Programado',
  editado: 'Editado',
  cancelado: 'Cancelado',
  iniciado: 'Activado manualmente',
  iniciado_automatico: 'Inicio automático',
  finalizado: 'Finalizado manualmente',
  finalizado_automatico: 'Fin automático',
}

const FORM_VACIO = { scheduledStart: '', scheduledEnd: '', reason: '', message: '' }

export default function EstadoPlataformaPage() {
  const { estado: estadoGlobal, aplicarEstado, refrescar } = usePlataforma()
  const [estado, setEstado] = useState(null)
  const [historial, setHistorial] = useState({ eventos: [], pagina: 1, paginas: 1 })
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [form, setForm] = useState(FORM_VACIO)
  const [modalProgramar, setModalProgramar] = useState(false)
  const [modalActivar, setModalActivar] = useState(false)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [confirmarFinalizar, setConfirmarFinalizar] = useState(false)
  const [textoConfirmacion, setTextoConfirmacion] = useState('')
  const [formActivar, setFormActivar] = useState({ reason: '', message: '', scheduledEnd: '' })

  const editando = estado?.status === 'programado'

  const cargarHistorial = useCallback(async (pagina = 1) => {
    try {
      const data = await plataforma.historial(pagina)
      setHistorial(data)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const { estado: nuevo } = await plataforma.estadoAdmin()
      setEstado(nuevo)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
    cargarHistorial(1)
  }, [cargar, cargarHistorial])

  // El sondeo global es la fuente de verdad del estado: cuando detecta un
  // cambio (p. ej. el inicio automático a la hora programada) esta pantalla se
  // recarga sola, sin que el administrador tenga que refrescar para ver que su
  // mantenimiento ya arrancó.
  useEffect(() => {
    if (estadoGlobal && estado && estadoGlobal.status !== estado.status) {
      cargar()
      cargarHistorial(1)
    }
  }, [estadoGlobal?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tras cualquier acción se propaga el estado nuevo al contexto global: así
  // el banner de aviso (o la propia pantalla de mantenimiento) reacciona al
  // instante en la pestaña del administrador, sin esperar al próximo sondeo.
  function aplicar(resultado, mensaje) {
    setEstado(resultado.estado)
    aplicarEstado(resultado.estado)
    setOk(mensaje)
    setError('')
    cargarHistorial(1)
    refrescar()
  }

  async function accion(fn, mensaje) {
    setGuardando(true)
    setOk('')
    setError('')
    try {
      aplicar(await fn(), mensaje)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setGuardando(false)
    }
  }

  function abrirProgramar() {
    setForm(
      editando
        ? {
            scheduledStart: aInputDateTime(estado.scheduledStart),
            scheduledEnd: aInputDateTime(estado.scheduledEnd),
            reason: estado.reason || '',
            message: estado.message || '',
          }
        : FORM_VACIO
    )
    setModalProgramar(true)
  }

  async function guardarProgramacion(e) {
    e.preventDefault()
    const exito = await accion(
      () => (editando ? plataforma.editar(form) : plataforma.programar(form)),
      editando ? 'Mantenimiento reprogramado correctamente.' : 'Mantenimiento programado. Se notificó al personal.'
    )
    if (exito) setModalProgramar(false)
  }

  async function activarAhora() {
    const exito = await accion(
      () => plataforma.activar(formActivar),
      'Mantenimiento activado. Los usuarios fueron expulsados y notificados.'
    )
    if (exito) {
      setModalActivar(false)
      setTextoConfirmacion('')
      setFormActivar({ reason: '', message: '', scheduledEnd: '' })
    }
  }

  const estilo = ESTILO_ESTADO[estado?.status] || ESTILO_ESTADO.operativa
  const objetivoCuenta = estado?.status === 'programado' ? estado.scheduledStart : estado?.scheduledEnd
  const restante = useCuentaRegresiva(objetivoCuenta)

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Activity className="h-6 w-6 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <div>
          <h1 className="panel-mono text-xl font-semibold tracking-wide text-slate-900 dark:text-white">
            Estado de plataforma
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Programa ventanas de mantenimiento, actívalas y finalízalas. Durante un mantenimiento
            activo nadie más que tú puede usar Skynet.
          </p>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : (
        <>
          {/* ── Tarjeta de estado ──────────────────────────────────────── */}
          <div className={`mb-6 rounded-2xl border p-5 sm:p-6 ${estilo.borde} ${estilo.fondo}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3 shrink-0">
                  {estado.status !== 'operativa' && (
                    <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${estilo.halo}`} />
                  )}
                  <span className={`relative inline-flex h-3 w-3 rounded-full ${estilo.punto}`} />
                </span>
                <div>
                  <p className={`text-lg font-semibold ${estilo.texto}`}>{estilo.etiqueta}</p>
                  {estado.status !== 'operativa' && estado.reason && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">{estado.reason}</p>
                  )}
                </div>
              </div>

              {restante !== null && restante !== undefined && (
                <div className="text-right">
                  <p className="panel-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {estado.status === 'programado' ? 'Comienza en' : 'Finaliza en'}
                  </p>
                  <p className={`panel-mono text-2xl font-bold tabular-nums ${estilo.texto}`}>
                    {formatearRestante(restante)}
                  </p>
                </div>
              )}
            </div>

            {estado.status !== 'operativa' && (
              <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-current/10 pt-4 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">Inicio</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-100">
                    {formatearFechaHora(estado.scheduledStart)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">Finalización</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-100">
                    {estado.scheduledEnd ? formatearFechaHora(estado.scheduledEnd) : 'Sin definir'}
                  </dd>
                </div>
                {estado.message && (
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500 dark:text-slate-400">Mensaje para los usuarios</dt>
                    <dd className="mt-0.5 text-slate-700 dark:text-slate-200">{estado.message}</dd>
                  </div>
                )}
                {estado.createdByNombre && (
                  <div className="flex justify-between gap-3 sm:col-span-2">
                    <dt className="text-slate-500 dark:text-slate-400">Configurado por</dt>
                    <dd className="text-slate-700 dark:text-slate-200">{estado.createdByNombre}</dd>
                  </div>
                )}
              </dl>
            )}

            {/* ── Acciones ─────────────────────────────────────────────── */}
            <div className="mt-5 flex flex-wrap gap-2">
              {estado.status === 'en_mantenimiento' ? (
                <Btn variante="primario" disabled={guardando} onClick={() => setConfirmarFinalizar(true)}>
                  <StopCircle className="h-4 w-4" aria-hidden="true" />
                  Finalizar mantenimiento
                </Btn>
              ) : (
                <>
                  <Btn variante={editando ? 'secundario' : 'primario'} disabled={guardando} onClick={abrirProgramar}>
                    <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    {editando ? 'Editar programación' : 'Programar mantenimiento'}
                  </Btn>
                  {editando && (
                    <Btn variante="secundario" disabled={guardando} onClick={() => setConfirmarCancelar(true)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Cancelar
                    </Btn>
                  )}
                  <Btn variante="peligro" disabled={guardando} onClick={() => setModalActivar(true)}>
                    <Power className="h-4 w-4" aria-hidden="true" />
                    Activar ahora
                  </Btn>
                </>
              )}
            </div>
          </div>

          {/* ── Historial ──────────────────────────────────────────────── */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <h2 className="panel-mono text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">
                Historial de mantenimientos
              </h2>
            </div>

            {historial.eventos.length === 0 ? (
              <EmptyState mensaje="Todavía no hay eventos de mantenimiento registrados" />
            ) : (
              <>
                <TablaWrap>
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr>
                        <Th>Evento</Th>
                        <Th>Responsable</Th>
                        <Th>Ventana</Th>
                        <Th>Motivo</Th>
                        <Th>Registrado</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {historial.eventos.map((ev) => (
                        <tr key={ev.id}>
                          <Td>
                            <span className="font-medium text-slate-800 dark:text-slate-100">
                              {ETIQUETA_EVENTO[ev.tipo] || ev.tipo}
                            </span>
                            {ev.duracionMinutos !== null && ev.duracionMinutos !== undefined && (
                              <span className="panel-mono ml-2 text-[11px] text-slate-500">
                                duró {ev.duracionMinutos} min
                              </span>
                            )}
                          </Td>
                          <Td>{ev.usuarioNombre}</Td>
                          <Td className="panel-mono text-[11px]">
                            {ev.scheduledStart ? formatearFechaHora(ev.scheduledStart) : '—'}
                            {ev.scheduledEnd && <> → {formatearFechaHora(ev.scheduledEnd)}</>}
                          </Td>
                          <Td>{ev.reason || '—'}</Td>
                          <Td className="panel-mono text-[11px]">{formatearFechaHora(ev.creadoEn)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TablaWrap>
                <Pager page={historial.pagina} pages={historial.paginas} onPage={cargarHistorial} />
              </>
            )}
          </Card>
        </>
      )}

      {/* ── Modal: programar / editar ────────────────────────────────── */}
      <Modal
        abierto={modalProgramar}
        titulo={editando ? 'Editar mantenimiento programado' : 'Programar mantenimiento'}
        onCerrar={() => setModalProgramar(false)}
      >
        <form onSubmit={guardarProgramacion} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Inicio">
              <Input
                type="datetime-local"
                required
                value={form.scheduledStart}
                onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })}
              />
            </Field>
            <Field label="Finalización (opcional)">
              <Input
                type="datetime-local"
                value={form.scheduledEnd}
                onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })}
              />
            </Field>
          </div>
          <p className="panel-mono -mt-2 text-[11px] text-slate-500">
            Sin hora de finalización, el mantenimiento solo termina con el botón «Finalizar».
          </p>

          <Field label="Motivo">
            <Input
              maxLength={200}
              placeholder="Mejora de rendimiento y estabilidad"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </Field>

          <Field label="Mensaje para los usuarios">
            <Textarea
              rows={3}
              maxLength={1000}
              placeholder="Skynet realizará mantenimiento programado para mejorar el rendimiento y la estabilidad de la plataforma."
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalProgramar(false)}>
              Cancelar
            </Btn>
            <button type="submit" className="hidden" aria-hidden="true" />
            <Btn variante="primario" disabled={guardando} onClick={guardarProgramacion}>
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Programar y notificar'}
            </Btn>
          </div>
        </form>
      </Modal>

      {/* ── Modal: activación inmediata (confirmación fuerte) ─────────── */}
      {/* No es un ConfirmDialog normal a propósito: esta acción expulsa a todo
          el personal del Terminal en el acto. Escribir la palabra obliga a un
          gesto deliberado que un clic por inercia no puede producir. */}
      <Modal abierto={modalActivar} titulo="Activar mantenimiento ahora" onCerrar={() => setModalActivar(false)}>
        <div className="mb-4 flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
          <div className="text-sm text-red-700 dark:text-red-300">
            <p className="font-semibold">Esta acción es inmediata y afecta a todo el Terminal.</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red-700/90 dark:text-red-300/90">
              <li>Todas las sesiones activas dejan de funcionar al instante.</li>
              <li>Nadie podrá iniciar sesión hasta que finalices el mantenimiento.</li>
              <li>Se enviará una notificación a todo el personal.</li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <Field label="Finalización estimada (opcional)">
            <Input
              type="datetime-local"
              value={formActivar.scheduledEnd}
              onChange={(e) => setFormActivar({ ...formActivar, scheduledEnd: e.target.value })}
            />
          </Field>
          <Field label="Motivo">
            <Input
              maxLength={200}
              value={formActivar.reason}
              onChange={(e) => setFormActivar({ ...formActivar, reason: e.target.value })}
            />
          </Field>
          <Field label="Mensaje para los usuarios">
            <Textarea
              rows={2}
              maxLength={1000}
              value={formActivar.message}
              onChange={(e) => setFormActivar({ ...formActivar, message: e.target.value })}
            />
          </Field>
          <Field label="Escribe MANTENIMIENTO para confirmar">
            <Input
              value={textoConfirmacion}
              onChange={(e) => setTextoConfirmacion(e.target.value)}
              placeholder="MANTENIMIENTO"
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Btn variante="secundario" onClick={() => setModalActivar(false)}>
            Cancelar
          </Btn>
          <Btn
            variante="peligro"
            disabled={guardando || textoConfirmacion.trim().toUpperCase() !== 'MANTENIMIENTO'}
            onClick={activarAhora}
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {guardando ? 'Activando…' : 'Activar mantenimiento'}
          </Btn>
        </div>
      </Modal>

      <ConfirmDialog
        abierto={confirmarCancelar}
        titulo="¿Cancelar el mantenimiento programado?"
        descripcion="La plataforma volverá al estado operativo y el aviso desaparecerá para todos los usuarios."
        confirmarLabel="Sí, cancelar"
        cancelarLabel="Volver"
        cargando={guardando}
        onCancelar={() => setConfirmarCancelar(false)}
        onConfirmar={async () => {
          await accion(() => plataforma.cancelar(), 'Mantenimiento programado cancelado.')
          setConfirmarCancelar(false)
        }}
      />

      <ConfirmDialog
        abierto={confirmarFinalizar}
        titulo="¿Finalizar el mantenimiento?"
        descripcion="Skynet volverá a estar disponible de inmediato y se notificará a todo el personal que ya puede ingresar."
        confirmarLabel="Finalizar ahora"
        variante="primario"
        cargando={guardando}
        onCancelar={() => setConfirmarFinalizar(false)}
        onConfirmar={async () => {
          await accion(() => plataforma.finalizar(), 'Mantenimiento finalizado. Se notificó al personal.')
          setConfirmarFinalizar(false)
        }}
      />
    </div>
  )
}
