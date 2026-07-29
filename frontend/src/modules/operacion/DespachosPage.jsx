import { useEffect, useState } from 'react'
import { Send, Flag, TimerReset } from 'lucide-react'
import { despachos as api } from '../../api/operacion.js'
import { rutas as rutasApi } from '../../api/operacion.js'
import { vehiculos as vehiculosApi, conductores as conductoresApi, plataformas as plataformasApi } from '../../api/flota.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Input, Select, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFechaHora,
} from '../../components/ui.jsx'

const FORM_VACIO = { vehiculo: '', conductor: '', ruta: '', plataforma: '', pasajeros: '' }

export default function DespachosPage() {
  const { tienePermiso } = useAuth()
  const puedeSalida = tienePermiso('despachos:registrar_salida')
  const puedeLlegada = tienePermiso('despachos:registrar_llegada')
  const puedeRetraso = tienePermiso('despachos:registrar_retraso')

  const [lista, setLista] = useState([])
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [catalogos, setCatalogos] = useState({ vehiculos: [], conductores: [], rutas: [], plataformas: [] })
  const [modalSalida, setModalSalida] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [errorForm, setErrorForm] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [retrasoDe, setRetrasoDe] = useState(null)
  const [formRetraso, setFormRetraso] = useState({ minutos: '', motivo: '' })

  async function cargar() {
    setCargando(true)
    try {
      const data = await api.listar({ fecha })
      setLista(data.despachos)
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
  }, [fecha])

  useEffect(() => {
    if (!puedeSalida) return
    Promise.all([
      vehiculosApi.listar().catch(() => ({ vehiculos: [] })),
      conductoresApi.listar().catch(() => ({ conductores: [] })),
      rutasApi.listar().catch(() => ({ rutas: [] })),
      plataformasApi.listar().catch(() => ({ plataformas: [] })),
    ]).then(([v, c, r, p]) =>
      setCatalogos({ vehiculos: v.vehiculos, conductores: c.conductores, rutas: r.rutas, plataformas: p.plataformas })
    )
  }, [puedeSalida])

  async function registrarSalida(ev) {
    ev.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      const datos = { ...form, pasajeros: form.pasajeros ? Number(form.pasajeros) : 0 }
      if (!datos.plataforma) delete datos.plataforma
      const { despacho } = await api.registrarSalida(datos)
      setOk(`Salida registrada: ${despacho.consecutivo}`)
      setModalSalida(false)
      setForm(FORM_VACIO)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function llegada(d) {
    try {
      await api.registrarLlegada(d._id)
      setOk(`Llegada registrada: ${d.consecutivo}`)
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  async function retraso(ev) {
    ev.preventDefault()
    setErrorForm('')
    try {
      await api.registrarRetraso(retrasoDe._id, {
        minutos: Number(formRetraso.minutos),
        motivo: formRetraso.motivo,
      })
      setOk(`Retraso registrado: ${retrasoDe.consecutivo}`)
      setRetrasoDe(null)
      setFormRetraso({ minutos: '', motivo: '' })
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <Send className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" /> Despachos
        </h1>
        <div className="flex items-center gap-2">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40" />
          {puedeSalida && (
            <Btn onClick={() => { setForm(FORM_VACIO); setErrorForm(''); setModalSalida(true) }} className="flex items-center gap-2">
              <Send className="h-4 w-4" aria-hidden="true" /> Registrar salida
            </Btn>
          )}
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay despachos en esta fecha" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Consecutivo</Th><Th>Salida</Th><Th>Vehículo</Th><Th>Conductor</Th>
              <Th>Ruta</Th><Th>Pasajeros</Th><Th>Estado</Th><Th>Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((d) => (
              <tr key={d._id}>
                <Td className="panel-mono !text-cyan-700 dark:!text-cyan-300">{d.consecutivo}</Td>
                <Td className="whitespace-nowrap">{fmtFechaHora(d.horaSalida)}</Td>
                <Td className="panel-mono">{d.vehiculo?.placa}</Td>
                <Td>{d.conductor?.nombre}</Td>
                <Td>{d.ruta ? `${d.ruta.origen} → ${d.ruta.destino}` : '—'}</Td>
                <Td>{d.pasajeros ?? '—'}</Td>
                <Td>
                  <Badge valor={d.estado} />
                  {d.estado === 'retrasado' && d.retraso?.minutos && (
                    <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">{d.retraso.minutos} min — {d.retraso.motivo}</p>
                  )}
                </Td>
                <Td>
                  <div className="flex gap-1.5">
                    {puedeLlegada && ['despachado', 'retrasado'].includes(d.estado) && (
                      <Btn className="flex items-center gap-1.5 !px-2.5" onClick={() => llegada(d)} title="Registrar llegada">
                        <Flag className="h-3.5 w-3.5" aria-hidden="true" /> Llegada
                      </Btn>
                    )}
                    {puedeRetraso && ['despachado', 'retrasado'].includes(d.estado) && (
                      <Btn variante="secundario" className="flex items-center gap-1.5 !px-2.5" onClick={() => { setRetrasoDe(d); setErrorForm(''); setFormRetraso({ minutos: '', motivo: '' }) }} title="Registrar retraso">
                        <TimerReset className="h-3.5 w-3.5" aria-hidden="true" /> Retraso
                      </Btn>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Modal abierto={modalSalida} titulo="Registrar salida" onCerrar={() => setModalSalida(false)}>
        <form onSubmit={registrarSalida} className="grid gap-3">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Vehículo">
            <Select value={form.vehiculo} onChange={(e) => setForm({ ...form, vehiculo: e.target.value })} required>
              <option value="">Selecciona…</option>
              {catalogos.vehiculos.filter((v) => v.estado === 'activo').map((v) => (
                <option key={v._id} value={v._id}>{v.placa} — {v.empresa?.nombre} (cap. {v.capacidad})</option>
              ))}
            </Select>
          </Field>
          <Field label="Conductor">
            <Select value={form.conductor} onChange={(e) => setForm({ ...form, conductor: e.target.value })} required>
              <option value="">Selecciona…</option>
              {catalogos.conductores.filter((c) => c.estado === 'activo').map((c) => (
                <option key={c._id} value={c._id}>{c.nombre} — {c.empresa?.nombre}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ruta">
            <Select value={form.ruta} onChange={(e) => setForm({ ...form, ruta: e.target.value })} required>
              <option value="">Selecciona…</option>
              {catalogos.rutas.filter((r) => r.estado === 'activa').map((r) => (
                <option key={r._id} value={r._id}>{r.origen} → {r.destino}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plataforma (opcional)">
              <Select value={form.plataforma} onChange={(e) => setForm({ ...form, plataforma: e.target.value })}>
                <option value="">Sin plataforma</option>
                {catalogos.plataformas.map((p) => (
                  <option key={p._id} value={p._id}>Plataforma {p.numero}</option>
                ))}
              </Select>
            </Field>
            <Field label="Pasajeros">
              <Input type="number" min="0" value={form.pasajeros} onChange={(e) => setForm({ ...form, pasajeros: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setModalSalida(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={guardando}>{guardando ? 'Registrando…' : 'Registrar salida'}</Btn>
          </div>
        </form>
      </Modal>

      <Modal abierto={Boolean(retrasoDe)} titulo={`Retraso — ${retrasoDe?.consecutivo || ''}`} onCerrar={() => setRetrasoDe(null)}>
        <form onSubmit={retraso} className="grid gap-3">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Minutos de retraso">
            <Input type="number" min="1" value={formRetraso.minutos} onChange={(e) => setFormRetraso({ ...formRetraso, minutos: e.target.value })} required />
          </Field>
          <Field label="Motivo">
            <Input value={formRetraso.motivo} onChange={(e) => setFormRetraso({ ...formRetraso, motivo: e.target.value })} required />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setRetrasoDe(null)}>Cancelar</Btn>
            <Btn type="submit">Registrar retraso</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
