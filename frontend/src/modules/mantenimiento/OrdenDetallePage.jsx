import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ordenesApi, hallazgosApi, bitacoraApi, plantillasApi, inventarioApi, conocimientoApi, mensajesApi,
} from '../../api/mantenimiento.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Input, Select, Textarea,
  TablaWrap, Th, Td, fmtFechaHora,
} from '../../components/ui.jsx'

function urlEvidencia(archivo) {
  return `/storage/mantenimiento_evidencias/${archivo}`
}

// ── Llegada ──────────────────────────────────────────────────────────────
function SeccionLlegada({ orden, puedoEjecutar, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({ ubicacion: '', lat: '', lng: '', comentario: '' })
  const [foto, setFoto] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  function usarGPS() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude })),
      () => {}
    )
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await ordenesApi.registrarLlegada(orden._id, form, foto)
      setAbierto(false)
      onCambio()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Llegada</h2>
      {orden.llegada?.hora ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div><dt className="text-slate-400">Hora</dt><dd className="text-slate-100">{fmtFechaHora(orden.llegada.hora)}</dd></div>
          <div><dt className="text-slate-400">Ubicación</dt><dd className="text-slate-100">{orden.llegada.ubicacion || '—'}</dd></div>
          {orden.llegada.comentario && <div className="col-span-2"><dt className="text-slate-400">Comentario</dt><dd className="text-slate-100">{orden.llegada.comentario}</dd></div>}
        </dl>
      ) : (
        <p className="text-sm text-slate-400">Sin registrar.</p>
      )}
      {puedoEjecutar && orden.estado === 'en_progreso' && (
        <div className="mt-3">
          {!abierto ? (
            <Btn variante="fantasma" onClick={() => setAbierto(true)}>Registrar llegada</Btn>
          ) : (
            <form onSubmit={guardar} className="space-y-3">
              <ErrorMsg>{error}</ErrorMsg>
              <Field label="Ubicación"><Input value={form.ubicacion} onChange={(e) => setForm((f) => ({ ...f, ubicacion: e.target.value }))} /></Field>
              <div className="flex items-center gap-2">
                <Btn variante="secundario" onClick={usarGPS}>Usar mi ubicación GPS</Btn>
                {form.lat && form.lng && <span className="text-xs text-slate-400">{form.lat.toFixed?.(4) ?? form.lat}, {form.lng.toFixed?.(4) ?? form.lng}</span>}
              </div>
              <Field label="Comentario"><Textarea value={form.comentario} onChange={(e) => setForm((f) => ({ ...f, comentario: e.target.value }))} /></Field>
              <Field label="Fotografía (opcional)">
                <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-300" />
              </Field>
              <div className="flex justify-end gap-2">
                <Btn variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Btn>
                <Btn onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Btn>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Diagnóstico ──────────────────────────────────────────────────────────
function SeccionDiagnostico({ orden, puedoEjecutar, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({
    diagnostico: orden.diagnostico || '',
    causa_raiz: orden.causa_raiz || '',
    nivel_afectacion: orden.nivel_afectacion || 'medio',
    recomendaciones: orden.recomendaciones || '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await ordenesApi.registrarDiagnostico(orden._id, form)
      setAbierto(false)
      onCambio()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Diagnóstico</h2>
      {orden.diagnostico ? (
        <dl className="space-y-2 text-sm">
          <div><dt className="text-slate-400">Diagnóstico</dt><dd className="text-slate-100">{orden.diagnostico}</dd></div>
          <div><dt className="text-slate-400">Causa raíz</dt><dd className="text-slate-100">{orden.causa_raiz}</dd></div>
          <div><dt className="text-slate-400">Nivel de afectación</dt><dd><Badge valor={orden.nivel_afectacion} /></dd></div>
          {orden.recomendaciones && <div><dt className="text-slate-400">Recomendaciones</dt><dd className="text-slate-100">{orden.recomendaciones}</dd></div>}
        </dl>
      ) : (
        <p className="text-sm text-slate-400">Sin registrar.</p>
      )}
      {puedoEjecutar && orden.estado === 'en_progreso' && (
        <div className="mt-3">
          {!abierto ? (
            <Btn variante="fantasma" onClick={() => setAbierto(true)}>{orden.diagnostico ? 'Editar diagnóstico' : 'Registrar diagnóstico'}</Btn>
          ) : (
            <form onSubmit={guardar} className="space-y-3">
              <ErrorMsg>{error}</ErrorMsg>
              <Field label="Diagnóstico técnico"><Textarea required value={form.diagnostico} onChange={(e) => setForm((f) => ({ ...f, diagnostico: e.target.value }))} /></Field>
              <Field label="Causa raíz"><Textarea required value={form.causa_raiz} onChange={(e) => setForm((f) => ({ ...f, causa_raiz: e.target.value }))} /></Field>
              <Field label="Nivel de afectación">
                <Select value={form.nivel_afectacion} onChange={(e) => setForm((f) => ({ ...f, nivel_afectacion: e.target.value }))}>
                  <option value="bajo">Bajo</option>
                  <option value="medio">Medio</option>
                  <option value="alto">Alto</option>
                  <option value="critico">Crítico</option>
                </Select>
              </Field>
              <Field label="Recomendaciones"><Textarea value={form.recomendaciones} onChange={(e) => setForm((f) => ({ ...f, recomendaciones: e.target.value }))} /></Field>
              <div className="flex justify-end gap-2">
                <Btn variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Btn>
                <Btn onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Btn>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Materiales ───────────────────────────────────────────────────────────
function SeccionMateriales({ orden, puedoEjecutar, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({ material: '', cantidad: 1, costo_unitario: 0, proveedor: '', observaciones: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await ordenesApi.registrarMaterial(orden._id, form)
      setForm({ material: '', cantidad: 1, costo_unitario: 0, proveedor: '', observaciones: '' })
      setAbierto(false)
      onCambio()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-white">Materiales</h2>
        <span className="panel-mono text-xs text-slate-400">Total: ${orden.costo_materiales?.toLocaleString('es-CO') || 0}</span>
      </div>
      {orden.materiales?.length ? (
        <TablaWrap>
          <thead><tr><Th>Material</Th><Th>Cant.</Th><Th>Costo unit.</Th><Th>Proveedor</Th></tr></thead>
          <tbody>
            {orden.materiales.map((m) => (
              <tr key={m._id} className="panel-row">
                <Td>{m.material}</Td><Td>{m.cantidad}</Td><Td>${m.costo_unitario?.toLocaleString('es-CO')}</Td><Td>{m.proveedor || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      ) : <p className="text-sm text-slate-400">Sin materiales registrados.</p>}
      {puedoEjecutar && orden.estado === 'en_progreso' && (
        <div className="mt-3">
          {!abierto ? (
            <Btn variante="fantasma" onClick={() => setAbierto(true)}>+ Registrar material</Btn>
          ) : (
            <form onSubmit={guardar} className="space-y-3">
              <ErrorMsg>{error}</ErrorMsg>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Material"><Input required value={form.material} onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))} /></Field>
                <Field label="Cantidad"><Input type="number" min="1" required value={form.cantidad} onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))} /></Field>
                <Field label="Costo unitario"><Input type="number" min="0" value={form.costo_unitario} onChange={(e) => setForm((f) => ({ ...f, costo_unitario: e.target.value }))} /></Field>
                <Field label="Proveedor"><Input value={form.proveedor} onChange={(e) => setForm((f) => ({ ...f, proveedor: e.target.value }))} /></Field>
              </div>
              <Field label="Observaciones"><Textarea value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} /></Field>
              <div className="flex justify-end gap-2">
                <Btn variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Btn>
                <Btn onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Agregar'}</Btn>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Herramientas ─────────────────────────────────────────────────────────
function SeccionHerramientas({ orden, puedoEjecutar, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({ herramienta: '', tiempo_uso_minutos: '', observaciones: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await ordenesApi.registrarHerramienta(orden._id, form)
      setForm({ herramienta: '', tiempo_uso_minutos: '', observaciones: '' })
      setAbierto(false)
      onCambio()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Herramientas</h2>
      {orden.herramientas?.length ? (
        <TablaWrap>
          <thead><tr><Th>Herramienta</Th><Th>Tiempo (min)</Th><Th>Observaciones</Th></tr></thead>
          <tbody>
            {orden.herramientas.map((h) => (
              <tr key={h._id} className="panel-row"><Td>{h.herramienta}</Td><Td>{h.tiempo_uso_minutos ?? '—'}</Td><Td>{h.observaciones || '—'}</Td></tr>
            ))}
          </tbody>
        </TablaWrap>
      ) : <p className="text-sm text-slate-400">Sin herramientas registradas.</p>}
      {puedoEjecutar && orden.estado === 'en_progreso' && (
        <div className="mt-3">
          {!abierto ? (
            <Btn variante="fantasma" onClick={() => setAbierto(true)}>+ Registrar herramienta</Btn>
          ) : (
            <form onSubmit={guardar} className="space-y-3">
              <ErrorMsg>{error}</ErrorMsg>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Herramienta"><Input required value={form.herramienta} onChange={(e) => setForm((f) => ({ ...f, herramienta: e.target.value }))} /></Field>
                <Field label="Tiempo de uso (min)"><Input type="number" min="0" value={form.tiempo_uso_minutos} onChange={(e) => setForm((f) => ({ ...f, tiempo_uso_minutos: e.target.value }))} /></Field>
              </div>
              <Field label="Observaciones"><Textarea value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} /></Field>
              <div className="flex justify-end gap-2">
                <Btn variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Btn>
                <Btn onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Agregar'}</Btn>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Horas trabajadas ─────────────────────────────────────────────────────
function SeccionHoras({ orden, puedoEjecutar, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({ inicio: '', fin: '', pausas_minutos: 0, tiempo_improductivo_minutos: 0, motivo_improductivo: '', es_extra: false })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await ordenesApi.registrarHoras(orden._id, form)
      setForm({ inicio: '', fin: '', pausas_minutos: 0, tiempo_improductivo_minutos: 0, motivo_improductivo: '', es_extra: false })
      setAbierto(false)
      onCambio()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Horas trabajadas</h2>
      {orden.horas?.length ? (
        <TablaWrap>
          <thead><tr><Th>Inicio</Th><Th>Fin</Th><Th>Pausas</Th><Th>Improductivo</Th><Th>Efectivo</Th><Th>Extra</Th></tr></thead>
          <tbody>
            {orden.horas.map((h) => (
              <tr key={h._id} className="panel-row">
                <Td>{fmtFechaHora(h.inicio)}</Td><Td>{fmtFechaHora(h.fin)}</Td><Td>{h.pausas_minutos} min</Td>
                <Td>{h.tiempo_improductivo_minutos} min</Td><Td className="font-medium">{h.tiempo_efectivo_minutos} min</Td><Td>{h.es_extra ? 'Sí' : 'No'}</Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      ) : <p className="text-sm text-slate-400">Sin horas registradas.</p>}
      {puedoEjecutar && orden.estado === 'en_progreso' && (
        <div className="mt-3">
          {!abierto ? (
            <Btn variante="fantasma" onClick={() => setAbierto(true)}>+ Registrar horas</Btn>
          ) : (
            <form onSubmit={guardar} className="space-y-3">
              <ErrorMsg>{error}</ErrorMsg>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Inicio"><Input type="datetime-local" required value={form.inicio} onChange={(e) => setForm((f) => ({ ...f, inicio: e.target.value }))} /></Field>
                <Field label="Fin"><Input type="datetime-local" required value={form.fin} onChange={(e) => setForm((f) => ({ ...f, fin: e.target.value }))} /></Field>
                <Field label="Pausas (min)"><Input type="number" min="0" value={form.pausas_minutos} onChange={(e) => setForm((f) => ({ ...f, pausas_minutos: e.target.value }))} /></Field>
                <Field label="Tiempo improductivo (min)"><Input type="number" min="0" value={form.tiempo_improductivo_minutos} onChange={(e) => setForm((f) => ({ ...f, tiempo_improductivo_minutos: e.target.value }))} /></Field>
              </div>
              <Field label="Motivo del tiempo improductivo (opcional)"><Input value={form.motivo_improductivo} onChange={(e) => setForm((f) => ({ ...f, motivo_improductivo: e.target.value }))} /></Field>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.es_extra} onChange={(e) => setForm((f) => ({ ...f, es_extra: e.target.checked }))} />
                Horas extra
              </label>
              <div className="flex justify-end gap-2">
                <Btn variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Btn>
                <Btn onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Agregar'}</Btn>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Evidencias ───────────────────────────────────────────────────────────
function SeccionEvidencias({ orden, puedoEjecutar, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({ tipo: 'foto', momento: 'general', comentario: '' })
  const [archivo, setArchivo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const activa = ['reportado', 'programada', 'asignada', 'en_progreso', 'en_espera', 'resuelta', 'pendiente_aprobacion'].includes(orden.estado)

  async function guardar(e) {
    e.preventDefault()
    if (!archivo) { setError('Selecciona un archivo'); return }
    setGuardando(true)
    setError('')
    try {
      await ordenesApi.agregarEvidencia(orden._id, form, archivo)
      setArchivo(null)
      setAbierto(false)
      onCambio()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Evidencias</h2>
      {orden.evidencias?.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {orden.evidencias.map((ev) => (
            <li key={ev._id} className="rounded-lg border border-cyan-400/10 p-2 text-xs">
              <a href={urlEvidencia(ev.archivo)} target="_blank" rel="noreferrer" className="font-medium text-cyan-400 hover:underline">
                {ev.tipo} ({ev.momento})
              </a>
              {ev.comentario && <p className="mt-1 text-slate-400">{ev.comentario}</p>}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-400">Sin evidencias adjuntas.</p>}
      {puedoEjecutar && activa && (
        <div className="mt-3">
          {!abierto ? (
            <Btn variante="fantasma" onClick={() => setAbierto(true)}>+ Adjuntar evidencia</Btn>
          ) : (
            <form onSubmit={guardar} className="space-y-3">
              <ErrorMsg>{error}</ErrorMsg>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo">
                  <Select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                    <option value="foto">Foto</option><option value="video">Video</option><option value="pdf">PDF</option>
                    <option value="excel">Excel</option><option value="word">Word</option><option value="audio">Audio</option>
                  </Select>
                </Field>
                <Field label="Momento">
                  <Select value={form.momento} onChange={(e) => setForm((f) => ({ ...f, momento: e.target.value }))}>
                    <option value="antes">Antes</option><option value="durante">Durante</option><option value="despues">Después</option><option value="general">General</option>
                  </Select>
                </Field>
              </div>
              <Field label="Archivo">
                <input type="file" required onChange={(e) => setArchivo(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-300" />
              </Field>
              <Field label="Comentario (opcional)"><Input value={form.comentario} onChange={(e) => setForm((f) => ({ ...f, comentario: e.target.value }))} /></Field>
              <div className="flex justify-end gap-2">
                <Btn variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Btn>
                <Btn onClick={guardar} disabled={guardando}>{guardando ? 'Subiendo…' : 'Adjuntar'}</Btn>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Solicitudes de repuestos ─────────────────────────────────────────────
function SeccionRepuestos({ orden, puedoEjecutar, tienePermiso, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [items, setItems] = useState([{ nombre: '', cantidad: 1 }])
  const [justificacion, setJustificacion] = useState('')
  const [urgencia, setUrgencia] = useState('media')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const puedeAprobar = tienePermiso('mantenimiento:aprobar_repuestos')

  async function accion(fn) {
    setError('')
    try {
      await fn()
      onCambio()
    } catch (err) {
      setError(err.message)
    }
  }

  async function crear(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await ordenesApi.solicitarRepuestos(orden._id, { items, justificacion, urgencia })
      setItems([{ nombre: '', cantidad: 1 }])
      setJustificacion('')
      setAbierto(false)
      onCambio()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Solicitudes de repuestos</h2>
      <ErrorMsg>{error}</ErrorMsg>
      {orden.solicitudesRepuestos?.length ? (
        <ul className="space-y-2">
          {orden.solicitudesRepuestos.map((s) => (
            <li key={s._id} className="rounded-lg border border-cyan-400/10 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-slate-100">{s.items.map((it) => `${it.nombre} x${it.cantidad}`).join(', ')}</span>
                <Badge valor={s.estado} />
              </div>
              {s.justificacion && <p className="text-slate-400">{s.justificacion}</p>}
              {s.motivoRechazo && <p className="text-red-400">Rechazado: {s.motivoRechazo}</p>}
              <div className="mt-2 flex gap-2">
                {s.estado === 'solicitado' && puedeAprobar && (
                  <>
                    <Btn variante="fantasma" onClick={() => accion(() => ordenesApi.aprobarRepuestos(orden._id, s._id))}>Aprobar</Btn>
                    <Btn variante="fantasma" className="!text-red-400" onClick={() => {
                      const motivo = window.prompt('Motivo del rechazo:')
                      if (motivo) accion(() => ordenesApi.rechazarRepuestos(orden._id, s._id, motivo))
                    }}>Rechazar</Btn>
                  </>
                )}
                {s.estado === 'en_alistamiento' && puedeAprobar && (
                  <Btn variante="fantasma" onClick={() => accion(() => ordenesApi.entregarRepuestos(orden._id, s._id))}>Marcar entregado</Btn>
                )}
                {s.estado === 'entregado' && puedoEjecutar && (
                  <Btn variante="fantasma" onClick={() => accion(() => ordenesApi.instalarRepuestos(orden._id, s._id))}>Confirmar instalación</Btn>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-400">Sin solicitudes de repuestos.</p>}
      {puedoEjecutar && orden.estado === 'en_progreso' && (
        <div className="mt-3">
          {!abierto ? (
            <Btn variante="fantasma" onClick={() => setAbierto(true)}>+ Solicitar repuestos</Btn>
          ) : (
            <form onSubmit={crear} className="space-y-3">
              {items.map((it, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="Repuesto" value={it.nombre} onChange={(e) => setItems((arr) => arr.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} />
                  <Input type="number" min="1" className="w-24" value={it.cantidad} onChange={(e) => setItems((arr) => arr.map((x, j) => j === i ? { ...x, cantidad: e.target.value } : x))} />
                </div>
              ))}
              <Btn variante="fantasma" onClick={() => setItems((arr) => [...arr, { nombre: '', cantidad: 1 }])}>+ Otro ítem</Btn>
              <Field label="Justificación"><Textarea value={justificacion} onChange={(e) => setJustificacion(e.target.value)} /></Field>
              <Field label="Urgencia">
                <Select value={urgencia} onChange={(e) => setUrgencia(e.target.value)}>
                  <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
                </Select>
              </Field>
              <div className="flex justify-end gap-2">
                <Btn variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Btn>
                <Btn onClick={crear} disabled={guardando}>{guardando ? 'Enviando…' : 'Solicitar'}</Btn>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Apoyo entre técnicos ─────────────────────────────────────────────────
function SeccionApoyo({ orden, esAsignado, usuario, tecnicos, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [tecnicoId, setTecnicoId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')

  async function invitar(e) {
    e.preventDefault()
    setError('')
    try {
      await ordenesApi.invitarApoyo(orden._id, tecnicoId, motivo)
      setAbierto(false)
      setTecnicoId('')
      setMotivo('')
      onCambio()
    } catch (err) {
      setError(err.message)
    }
  }

  async function responder(invitacionId, aceptar) {
    setError('')
    try {
      if (aceptar) await ordenesApi.aceptarApoyo(orden._id, invitacionId)
      else await ordenesApi.rechazarApoyo(orden._id, invitacionId)
      onCambio()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Apoyo entre técnicos</h2>
      <ErrorMsg>{error}</ErrorMsg>
      {orden.tecnicos_apoyo?.length > 0 && (
        <p className="mb-2 text-sm text-slate-300">Apoyando: {orden.tecnicos_apoyo.map((t) => t.nombre).join(', ')}</p>
      )}
      {orden.invitacionesApoyo?.length ? (
        <ul className="space-y-1">
          {orden.invitacionesApoyo.map((inv) => (
            <li key={inv._id} className="flex items-center justify-between text-sm">
              <span>{inv.tecnico?.nombre} — <Badge valor={inv.estado} /></span>
              {inv.estado === 'pendiente' && String(inv.tecnico?._id) === String(usuario.id_usuario) && (
                <span className="flex gap-1">
                  <Btn variante="fantasma" onClick={() => responder(inv._id, true)}>Aceptar</Btn>
                  <Btn variante="fantasma" className="!text-red-400" onClick={() => responder(inv._id, false)}>Rechazar</Btn>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-400">Sin invitaciones de apoyo.</p>}
      {esAsignado && ['en_progreso', 'en_espera'].includes(orden.estado) && (
        <div className="mt-3">
          {!abierto ? (
            <Btn variante="fantasma" onClick={() => setAbierto(true)}>+ Solicitar apoyo</Btn>
          ) : (
            <form onSubmit={invitar} className="space-y-3">
              <Field label="Técnico">
                <Select required value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {tecnicos.filter((t) => t._id !== usuario.id_usuario).map((t) => <option key={t._id} value={t._id}>{t.nombre}</option>)}
                </Select>
              </Field>
              <Field label="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
              <div className="flex justify-end gap-2">
                <Btn variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Btn>
                <Btn onClick={invitar}>Invitar</Btn>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Hallazgos ────────────────────────────────────────────────────────────
function SeccionHallazgos({ orden, puedoEjecutar, tienePermiso, hallazgos, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({ categoria: '', tipo: '', criticidad: 'media', riesgo: '', descripcion: '', recomendacion: '', accion_correctiva: '', accion_preventiva: '', fecha_limite: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const puedeAceptarRiesgo = tienePermiso('mantenimiento:asignar')

  async function accion(fn) {
    setError('')
    try {
      await fn()
      onCambio()
    } catch (err) {
      setError(err.message)
    }
  }

  async function crear(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await hallazgosApi.registrar(orden._id, form)
      setForm({ categoria: '', tipo: '', criticidad: 'media', riesgo: '', descripcion: '', recomendacion: '', accion_correctiva: '', accion_preventiva: '', fecha_limite: '' })
      setAbierto(false)
      onCambio()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Hallazgos</h2>
      <ErrorMsg>{error}</ErrorMsg>
      {hallazgos?.length ? (
        <ul className="space-y-2">
          {hallazgos.map((h) => (
            <li key={h._id} className="rounded-lg border border-cyan-400/10 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-100">{h.descripcion}</span>
                <span className="flex gap-1"><Badge valor={h.criticidad} /><Badge valor={h.estado} /></span>
              </div>
              {h.fecha_limite && <p className="text-xs text-slate-400">Fecha límite: {fmtFechaHora(h.fecha_limite)}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {h.estado === 'abierto' && puedoEjecutar && (
                  <Btn variante="fantasma" onClick={() => accion(() => hallazgosApi.marcarSeguimiento(h._id))}>En seguimiento</Btn>
                )}
                {['abierto', 'en_seguimiento'].includes(h.estado) && puedoEjecutar && (
                  <Btn variante="fantasma" onClick={() => accion(() => hallazgosApi.marcarResuelto(h._id))}>Marcar resuelto</Btn>
                )}
                {['abierto', 'en_seguimiento'].includes(h.estado) && puedeAceptarRiesgo && (
                  <Btn variante="fantasma" onClick={() => {
                    const justificacion = window.prompt('Justificación para aceptar el riesgo:')
                    if (!justificacion) return
                    const reevaluarEn = window.prompt('Fecha de reevaluación (YYYY-MM-DD):')
                    if (!reevaluarEn) return
                    accion(() => hallazgosApi.aceptarRiesgo(h._id, justificacion, reevaluarEn))
                  }}>Aceptar riesgo</Btn>
                )}
                {h.estado !== 'convertido_en_ot' && puedoEjecutar && (
                  <Btn variante="fantasma" onClick={() => accion(() => hallazgosApi.convertir(h._id))}>Convertir en OT</Btn>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-400">Sin hallazgos registrados.</p>}
      {puedoEjecutar && ['en_progreso', 'en_espera'].includes(orden.estado) && (
        <div className="mt-3">
          {!abierto ? (
            <Btn variante="fantasma" onClick={() => setAbierto(true)}>+ Registrar hallazgo</Btn>
          ) : (
            <form onSubmit={crear} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Categoría"><Input value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} /></Field>
                <Field label="Tipo"><Input value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))} /></Field>
                <Field label="Criticidad">
                  <Select value={form.criticidad} onChange={(e) => setForm((f) => ({ ...f, criticidad: e.target.value }))}>
                    <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option>
                  </Select>
                </Field>
                <Field label="Fecha límite"><Input type="date" value={form.fecha_limite} onChange={(e) => setForm((f) => ({ ...f, fecha_limite: e.target.value }))} /></Field>
              </div>
              <Field label="Riesgo"><Input value={form.riesgo} onChange={(e) => setForm((f) => ({ ...f, riesgo: e.target.value }))} /></Field>
              <Field label="Descripción"><Textarea required value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} /></Field>
              <Field label="Recomendación"><Textarea value={form.recomendacion} onChange={(e) => setForm((f) => ({ ...f, recomendacion: e.target.value }))} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Acción correctiva"><Textarea value={form.accion_correctiva} onChange={(e) => setForm((f) => ({ ...f, accion_correctiva: e.target.value }))} /></Field>
                <Field label="Acción preventiva"><Textarea value={form.accion_preventiva} onChange={(e) => setForm((f) => ({ ...f, accion_preventiva: e.target.value }))} /></Field>
              </div>
              <div className="flex justify-end gap-2">
                <Btn variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Btn>
                <Btn onClick={crear} disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar'}</Btn>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Checklist (Fase 3.1) ─────────────────────────────────────────────────
function SeccionChecklist({ orden, puedoEjecutar, onCambio }) {
  const [plantillasDisp, setPlantillasDisp] = useState([])
  const [plantillaId, setPlantillaId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (puedoEjecutar && !orden.checklist?.plantilla) {
      plantillasApi.listar(orden.equipo?.tipo?.nombre).then((d) => setPlantillasDisp(d.plantillas)).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden.checklist?.plantilla])

  async function aplicar() {
    if (!plantillaId) return
    setError('')
    try {
      await plantillasApi.aplicar(orden._id, plantillaId)
      onCambio()
    } catch (err) {
      setError(err.message)
    }
  }

  async function marcar(item, cambios) {
    setError('')
    try {
      await plantillasApi.marcarItem(orden._id, item._id, {
        completado: cambios.completado ?? item.completado,
        omitido: cambios.omitido ?? item.omitido,
        motivoOmision: cambios.motivoOmision,
        comentario: item.comentario,
      })
      onCambio()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!orden.checklist?.plantilla) {
    if (!puedoEjecutar || orden.estado !== 'en_progreso' || !plantillasDisp.length) return null
    return (
      <Card>
        <h2 className="mb-2 font-semibold text-white">Checklist</h2>
        <ErrorMsg>{error}</ErrorMsg>
        <div className="flex gap-2">
          <Select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)}>
            <option value="">— Aplicar una plantilla —</option>
            {plantillasDisp.map((p) => <option key={p._id} value={p._id}>{p.nombre}</option>)}
          </Select>
          <Btn onClick={aplicar} disabled={!plantillaId}>Aplicar</Btn>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Checklist — {orden.checklist.plantillaNombre}</h2>
      <ErrorMsg>{error}</ErrorMsg>
      <ul className="space-y-2">
        {orden.checklist.items.map((item) => (
          <li key={item._id} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={item.completado}
              disabled={!puedoEjecutar || orden.estado !== 'en_progreso' || item.omitido}
              onChange={(e) => marcar(item, { completado: e.target.checked })}
              className="mt-1"
            />
            <span className={item.completado ? 'text-slate-400 line-through' : item.omitido ? 'text-amber-400' : 'text-slate-200'}>
              {item.texto} {item.obligatorioParaCierre && <span className="text-cyan-400">*</span>}
              {item.omitido && item.motivoOmision && <span className="block text-xs text-slate-400">Omitido: {item.motivoOmision}</span>}
            </span>
            {puedoEjecutar && orden.estado === 'en_progreso' && !item.completado && !item.omitido && (
              <Btn variante="fantasma" onClick={() => {
                const motivo = window.prompt('Motivo de la omisión:')
                if (motivo) marcar(item, { omitido: true, motivoOmision: motivo })
              }}>Omitir</Btn>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ── Bitácora Operativa (Work Log, Fase 3.1) ─────────────────────────────
function SeccionBitacora({ orden, puedoEjecutar, onCambio }) {
  const [entradas, setEntradas] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({ tipo: 'nota', texto: '', etiquetas: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const activa = ['reportado', 'programada', 'asignada', 'en_progreso', 'en_espera', 'resuelta', 'pendiente_aprobacion'].includes(orden.estado)

  useEffect(() => {
    bitacoraApi.listar(orden._id).then((d) => setEntradas(d.entradas)).catch(() => {})
  }, [orden._id])

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await bitacoraApi.agregar(orden._id, form)
      setForm({ tipo: 'nota', texto: '', etiquetas: '' })
      setAbierto(false)
      const d = await bitacoraApi.listar(orden._id)
      setEntradas(d.entradas)
      onCambio()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Bitácora operativa</h2>
      {entradas.length ? (
        <ul className="space-y-2">
          {entradas.map((e) => (
            <li key={e._id} className="border-l-2 border-cyan-400/20 pl-3 text-sm">
              <span className="text-slate-500">{fmtFechaHora(e.creado_en)} — {e.usuarioNombre} ({e.tipo})</span>
              {e.texto && <p className="text-slate-200">{e.texto}</p>}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-400">Sin entradas.</p>}
      {puedoEjecutar && activa && (
        <div className="mt-3">
          {!abierto ? (
            <Btn variante="fantasma" onClick={() => setAbierto(true)}>+ Nueva entrada</Btn>
          ) : (
            <form onSubmit={guardar} className="space-y-3">
              <ErrorMsg>{error}</ErrorMsg>
              <Field label="Tipo">
                <Select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                  <option value="nota">Nota</option><option value="observacion">Observación</option><option value="incidente">Incidente</option>
                  <option value="llamada">Llamada</option><option value="visita_externa">Visita externa</option>
                  <option value="prueba">Prueba</option><option value="resultado">Resultado</option>
                </Select>
              </Field>
              <Field label="Texto"><Textarea value={form.texto} onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))} /></Field>
              <Field label="Etiquetas (separadas por coma)"><Input value={form.etiquetas} onChange={(e) => setForm((f) => ({ ...f, etiquetas: e.target.value }))} /></Field>
              <div className="flex justify-end gap-2">
                <Btn variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Btn>
                <Btn onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Agregar'}</Btn>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Inventario (Fase 3.1) ────────────────────────────────────────────────
function SeccionInventario({ orden, puedoEjecutar, onCambio }) {
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim()) inventarioApi.buscar(q).then((d) => setResultados(d.materiales)).catch(() => {})
      else setResultados([])
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  async function consumir(material) {
    const cantidad = window.prompt(`¿Cuántas unidades de "${material.nombre}" (stock: ${material.stock})?`, '1')
    if (!cantidad) return
    setError('')
    try {
      await inventarioApi.consumir(orden._id, material._id, Number(cantidad))
      setQ('')
      setResultados([])
      onCambio()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!puedoEjecutar || orden.estado !== 'en_progreso') return null

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Consumir del inventario</h2>
      <ErrorMsg>{error}</ErrorMsg>
      <Input placeholder="Buscar material en inventario…" value={q} onChange={(e) => setQ(e.target.value)} />
      {resultados.length > 0 && (
        <ul className="mt-2 divide-y divide-cyan-400/10">
          {resultados.map((m) => (
            <li key={m._id} className="flex items-center justify-between py-2 text-sm">
              <span>{m.nombre} — stock: {m.stock}</span>
              <Btn variante="fantasma" onClick={() => consumir(m)}>Consumir</Btn>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ── Base de Conocimiento (Fase 3.1) ──────────────────────────────────────
function SeccionConocimiento({ orden, puedoEjecutar, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [palabrasClave, setPalabrasClave] = useState('')
  const [nivelComplejidad, setNivelComplejidad] = useState('media')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function convertir(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await conocimientoApi.convertir(orden._id, { palabrasClave, nivelComplejidad })
      setOk('Artículo de conocimiento creado')
      setAbierto(false)
      onCambio()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (orden.estado !== 'cerrada' || !puedoEjecutar) return null

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-white">Base de conocimiento</h2>
      <OkMsg>{ok}</OkMsg>
      {!abierto ? (
        <Btn variante="fantasma" onClick={() => setAbierto(true)}>Convertir en artículo de conocimiento</Btn>
      ) : (
        <form onSubmit={convertir} className="space-y-3">
          <ErrorMsg>{error}</ErrorMsg>
          <Field label="Palabras clave (separadas por coma)"><Input value={palabrasClave} onChange={(e) => setPalabrasClave(e.target.value)} /></Field>
          <Field label="Nivel de complejidad">
            <Select value={nivelComplejidad} onChange={(e) => setNivelComplejidad(e.target.value)}>
              <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Btn>
            <Btn onClick={convertir} disabled={guardando}>{guardando ? 'Guardando…' : 'Crear artículo'}</Btn>
          </div>
        </form>
      )}
    </Card>
  )
}

// ── Comunicación interna (Fase 3.1) ──────────────────────────────────────
function SeccionMensajes({ orden, usuario }) {
  const [canal, setCanal] = useState('interno')
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const esReportante = orden.reportadoPor && String(orden.reportadoPor) === String(usuario.id_usuario)

  async function cargar(c) {
    try {
      const d = await mensajesApi.listar(orden._id, c)
      setMensajes(d.mensajes)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    cargar(canal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canal, orden._id])

  async function enviar(e) {
    e.preventDefault()
    if (!texto.trim()) return
    setError('')
    try {
      await mensajesApi.enviar(orden._id, canal, texto)
      setTexto('')
      cargar(canal)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-white">Comunicación</h2>
        <div className="flex gap-1 rounded-lg border border-cyan-400/10 p-1">
          <button onClick={() => setCanal('interno')} className={`rounded px-2 py-1 text-xs ${canal === 'interno' ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-400'}`}>Interno</button>
          <button onClick={() => setCanal('solicitante')} className={`rounded px-2 py-1 text-xs ${canal === 'solicitante' ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-400'}`}>Con el solicitante</button>
        </div>
      </div>
      <ErrorMsg>{error}</ErrorMsg>
      <ul className="mb-3 max-h-56 space-y-2 overflow-y-auto">
        {mensajes.map((m, i) => (
          <li key={i} className="text-sm"><span className="font-medium text-slate-200">{m.autorNombre}:</span> <span className="text-slate-300">{m.texto}</span></li>
        ))}
        {mensajes.length === 0 && <p className="text-sm text-slate-400">Sin mensajes en este canal.</p>}
      </ul>
      <form onSubmit={enviar} className="flex gap-2">
        <Input placeholder="Escribe un mensaje…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Btn onClick={enviar}>Enviar</Btn>
      </form>
      {canal === 'solicitante' && esReportante && <p className="mt-1 text-xs text-slate-500">Estás viendo esto porque reportaste esta orden.</p>}
    </Card>
  )
}

export default function OrdenDetallePage() {
  const { id } = useParams()
  const { usuario, tienePermiso } = useAuth()
  const [orden, setOrden] = useState(null)
  const [hallazgos, setHallazgos] = useState([])
  const [tecnicos, setTecnicos] = useState([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function cargar() {
    try {
      const [{ orden: o }, { hallazgos: h }] = await Promise.all([
        ordenesApi.obtener(id),
        hallazgosApi.listarDeOrden(id).catch(() => ({ hallazgos: [] })),
      ])
      setOrden(o)
      setHallazgos(h)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (tienePermiso('mantenimiento:asignar')) {
      ordenesApi.tecnicos().then((d) => setTecnicos(d.tecnicos)).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onCambio() {
    setOk('Cambios guardados')
    cargar()
  }

  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!orden) return <Card>Cargando…</Card>

  const esAsignado = orden.tecnico_asignado && String(orden.tecnico_asignado._id) === String(usuario.id_usuario)
  const esApoyo = orden.tecnicos_apoyo?.some((t) => String(t._id) === String(usuario.id_usuario))
  const puedoEjecutar = esAsignado || esApoyo

  return (
    <div className="space-y-4">
      <div>
        <Link to="/mantenimiento/ordenes" className="text-sm text-cyan-400 hover:underline">← Volver a órdenes de trabajo</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-white">
            {orden.equipo ? `${orden.equipo.numero_inventario} — ${orden.equipo.tipo?.nombre || ''} ${orden.equipo.marca?.nombre || ''}` : '(equipo eliminado)'}
          </h1>
          <Badge valor={orden.estado} />
          <Badge valor={orden.prioridad} />
        </div>
      </div>

      <OkMsg>{ok}</OkMsg>

      <Card>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="text-slate-400">Origen</dt><dd className="text-slate-100">{orden.origen}</dd></div>
          <div><dt className="text-slate-400">Técnico</dt><dd className="text-slate-100">{orden.tecnico_asignado?.nombre || '—'}</dd></div>
          <div><dt className="text-slate-400">Creada</dt><dd className="text-slate-100">{fmtFechaHora(orden.creado_en)}</dd></div>
          <div><dt className="text-slate-400">SLA solución</dt><dd className="text-slate-100">{orden.sla?.fecha_limite_solucion ? fmtFechaHora(orden.sla.fecha_limite_solucion) : '—'}</dd></div>
        </dl>
        <p className="mt-3 text-sm text-slate-300">{orden.descripcion}</p>
        {orden.descripcion_solucion && (
          <p className="mt-2 rounded-lg bg-emerald-400/5 p-2 text-sm text-emerald-300">Solución: {orden.descripcion_solucion}</p>
        )}
      </Card>

      <SeccionChecklist orden={orden} puedoEjecutar={puedoEjecutar} onCambio={onCambio} />
      <SeccionLlegada orden={orden} puedoEjecutar={puedoEjecutar} onCambio={onCambio} />
      <SeccionDiagnostico orden={orden} puedoEjecutar={puedoEjecutar} onCambio={onCambio} />
      <SeccionInventario orden={orden} puedoEjecutar={puedoEjecutar} onCambio={onCambio} />
      <SeccionMateriales orden={orden} puedoEjecutar={puedoEjecutar} onCambio={onCambio} />
      <SeccionHerramientas orden={orden} puedoEjecutar={puedoEjecutar} onCambio={onCambio} />
      <SeccionHoras orden={orden} puedoEjecutar={puedoEjecutar} onCambio={onCambio} />
      <SeccionEvidencias orden={orden} puedoEjecutar={puedoEjecutar} onCambio={onCambio} />
      <SeccionRepuestos orden={orden} puedoEjecutar={puedoEjecutar} tienePermiso={tienePermiso} onCambio={onCambio} />
      <SeccionApoyo orden={orden} esAsignado={esAsignado} usuario={usuario} tecnicos={tecnicos} onCambio={onCambio} />
      <SeccionHallazgos orden={orden} puedoEjecutar={puedoEjecutar} tienePermiso={tienePermiso} hallazgos={hallazgos} onCambio={onCambio} />
      <SeccionConocimiento orden={orden} puedoEjecutar={puedoEjecutar} onCambio={onCambio} />
      <SeccionBitacora orden={orden} puedoEjecutar={puedoEjecutar} onCambio={onCambio} />
      <SeccionMensajes orden={orden} usuario={usuario} />
    </div>
  )
}
