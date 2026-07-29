import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Route as RouteIcon, Clock } from 'lucide-react'
import { rutas as rutasApi, horarios as horariosApi } from '../../api/operacion.js'
import { empresas as empresasApi } from '../../api/flota.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  Btn, Badge, ErrorMsg, OkMsg, Field, Input, Select, Modal,
  TablaWrap, Th, Td, EmptyState,
} from '../../components/ui.jsx'

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const RUTA_VACIA = { origen: 'Neiva', destino: '', paradas: '', duracionEstimadaMin: '', estado: 'activa' }
const HORARIO_VACIO = { empresa: '', ruta: '', horaSalida: '', dias: [...DIAS], estado: 'activo' }

export default function RutasHorariosPage() {
  const { usuario, tienePermiso } = useAuth()
  const puedeRutas = tienePermiso('rutas:gestionar')
  const puedeHorarios = tienePermiso('horarios:gestionar')
  const esScoped = usuario?.rol?.ambito === 'empresa'

  const [rutas, setRutas] = useState([])
  const [horarios, setHorarios] = useState([])
  const [listaEmpresas, setListaEmpresas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [modalRuta, setModalRuta] = useState(false)
  const [rutaId, setRutaId] = useState(null)
  const [formRuta, setFormRuta] = useState(RUTA_VACIA)

  const [modalHorario, setModalHorario] = useState(false)
  const [horarioId, setHorarioId] = useState(null)
  const [formHorario, setFormHorario] = useState(HORARIO_VACIO)

  const [errorForm, setErrorForm] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const [r, h] = await Promise.all([rutasApi.listar(), horariosApi.listar()])
      setRutas(r.rutas)
      setHorarios(h.horarios)
      if (puedeHorarios && !esScoped) {
        const e = await empresasApi.listar().catch(() => ({ empresas: [] }))
        setListaEmpresas(e.empresas)
      }
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
  }, [])

  async function guardarRuta(ev) {
    ev.preventDefault()
    setErrorForm('')
    try {
      const datos = {
        ...formRuta,
        paradas: formRuta.paradas ? formRuta.paradas.split(',').map((p) => p.trim()).filter(Boolean) : [],
        duracionEstimadaMin: formRuta.duracionEstimadaMin ? Number(formRuta.duracionEstimadaMin) : undefined,
      }
      if (rutaId) await rutasApi.actualizar(rutaId, datos)
      else await rutasApi.crear(datos)
      setOk(rutaId ? 'Ruta actualizada' : 'Ruta creada')
      setModalRuta(false)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    }
  }

  async function guardarHorario(ev) {
    ev.preventDefault()
    setErrorForm('')
    try {
      const datos = { ...formHorario }
      if (esScoped || !datos.empresa) delete datos.empresa
      if (horarioId) await horariosApi.actualizar(horarioId, datos)
      else await horariosApi.crear(datos)
      setOk(horarioId ? 'Horario actualizado' : 'Horario creado')
      setModalHorario(false)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    }
  }

  function toggleDia(d) {
    setFormHorario((f) => ({
      ...f,
      dias: f.dias.includes(d) ? f.dias.filter((x) => x !== d) : [...f.dias, d],
    }))
  }

  return (
    <div className="mx-auto max-w-6xl">
      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {/* ── Rutas ── */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <RouteIcon className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" /> Rutas
        </h1>
        {puedeRutas && (
          <Btn onClick={() => { setRutaId(null); setFormRuta(RUTA_VACIA); setErrorForm(''); setModalRuta(true) }} className="flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nueva ruta
          </Btn>
        )}
      </div>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : rutas.length === 0 ? (
        <EmptyState mensaje="No hay rutas" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Origen</Th><Th>Destino</Th><Th>Paradas</Th><Th>Duración</Th><Th>Estado</Th>
              {puedeRutas && <Th>Acciones</Th>}
            </tr>
          </thead>
          <tbody>
            {rutas.map((r) => (
              <tr key={r._id}>
                <Td>{r.origen}</Td>
                <Td className="font-medium">{r.destino}</Td>
                <Td className="!text-slate-500 dark:!text-slate-400">{r.paradas?.join(', ') || '—'}</Td>
                <Td>{r.duracionEstimadaMin ? `${Math.floor(r.duracionEstimadaMin / 60)}h ${r.duracionEstimadaMin % 60}m` : '—'}</Td>
                <Td><Badge valor={r.estado} /></Td>
                {puedeRutas && (
                  <Td>
                    <div className="flex gap-1.5">
                      <Btn variante="fantasma" className="!px-2" title="Editar" onClick={() => {
                        setRutaId(r._id)
                        setFormRuta({ origen: r.origen, destino: r.destino, paradas: r.paradas?.join(', ') || '', duracionEstimadaMin: r.duracionEstimadaMin || '', estado: r.estado })
                        setErrorForm('')
                        setModalRuta(true)
                      }}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Btn>
                      <Btn variante="peligro" className="!px-2" title="Eliminar" onClick={async () => {
                        if (!window.confirm(`¿Eliminar la ruta a ${r.destino}?`)) return
                        try { await rutasApi.eliminar(r._id); setOk('Ruta eliminada'); cargar() } catch (err) { setError(err.message) }
                      }}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Btn>
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      {/* ── Horarios ── */}
      <div className="mb-4 mt-8 flex items-center justify-between">
        <h2 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <Clock className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" /> Horarios
        </h2>
        {puedeHorarios && (
          <Btn onClick={() => { setHorarioId(null); setFormHorario(HORARIO_VACIO); setErrorForm(''); setModalHorario(true) }} className="flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo horario
          </Btn>
        )}
      </div>

      {!cargando && (horarios.length === 0 ? (
        <EmptyState mensaje="No hay horarios programados" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Hora</Th><Th>Ruta</Th><Th>Empresa</Th><Th>Días</Th><Th>Estado</Th>
              {puedeHorarios && <Th>Acciones</Th>}
            </tr>
          </thead>
          <tbody>
            {horarios.map((h) => (
              <tr key={h._id}>
                <Td className="panel-mono font-semibold !text-slate-800 dark:!text-slate-100">{h.horaSalida}</Td>
                <Td>{h.ruta ? `${h.ruta.origen} → ${h.ruta.destino}` : '—'}</Td>
                <Td>{h.empresa?.nombre || '—'}</Td>
                <Td className="text-xs !text-slate-500 dark:!text-slate-400">{h.dias?.map((d) => d.slice(0, 3)).join(', ')}</Td>
                <Td><Badge valor={h.estado} /></Td>
                {puedeHorarios && (
                  <Td>
                    <div className="flex gap-1.5">
                      <Btn variante="fantasma" className="!px-2" title="Editar" onClick={() => {
                        setHorarioId(h._id)
                        setFormHorario({ empresa: h.empresa?._id || '', ruta: h.ruta?._id || '', horaSalida: h.horaSalida, dias: h.dias || [], estado: h.estado })
                        setErrorForm('')
                        setModalHorario(true)
                      }}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Btn>
                      <Btn variante="peligro" className="!px-2" title="Eliminar" onClick={async () => {
                        if (!window.confirm('¿Eliminar este horario?')) return
                        try { await horariosApi.eliminar(h._id); setOk('Horario eliminado'); cargar() } catch (err) { setError(err.message) }
                      }}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Btn>
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      ))}

      <Modal abierto={modalRuta} titulo={rutaId ? 'Editar ruta' : 'Nueva ruta'} onCerrar={() => setModalRuta(false)}>
        <form onSubmit={guardarRuta} className="grid gap-3 sm:grid-cols-2">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Origen">
            <Input value={formRuta.origen} onChange={(e) => setFormRuta({ ...formRuta, origen: e.target.value })} required />
          </Field>
          <Field label="Destino">
            <Input value={formRuta.destino} onChange={(e) => setFormRuta({ ...formRuta, destino: e.target.value })} required />
          </Field>
          <Field label="Paradas (separadas por coma)" className="sm:col-span-2">
            <Input value={formRuta.paradas} onChange={(e) => setFormRuta({ ...formRuta, paradas: e.target.value })} placeholder="Espinal, Girardot" />
          </Field>
          <Field label="Duración estimada (min)">
            <Input type="number" min="1" value={formRuta.duracionEstimadaMin} onChange={(e) => setFormRuta({ ...formRuta, duracionEstimadaMin: e.target.value })} />
          </Field>
          <Field label="Estado">
            <Select value={formRuta.estado} onChange={(e) => setFormRuta({ ...formRuta, estado: e.target.value })}>
              <option value="activa">Activa</option>
              <option value="inactiva">Inactiva</option>
            </Select>
          </Field>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setModalRuta(false)}>Cancelar</Btn>
            <Btn type="submit">Guardar</Btn>
          </div>
        </form>
      </Modal>

      <Modal abierto={modalHorario} titulo={horarioId ? 'Editar horario' : 'Nuevo horario'} onCerrar={() => setModalHorario(false)}>
        <form onSubmit={guardarHorario} className="grid gap-3">
          <ErrorMsg>{errorForm}</ErrorMsg>
          {!esScoped && (
            <Field label="Empresa">
              <Select value={formHorario.empresa} onChange={(e) => setFormHorario({ ...formHorario, empresa: e.target.value })} required={!horarioId}>
                <option value="">Selecciona…</option>
                {listaEmpresas.map((e) => (
                  <option key={e._id} value={e._id}>{e.nombre}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Ruta">
            <Select value={formHorario.ruta} onChange={(e) => setFormHorario({ ...formHorario, ruta: e.target.value })} required>
              <option value="">Selecciona…</option>
              {rutas.map((r) => (
                <option key={r._id} value={r._id}>{r.origen} → {r.destino}</option>
              ))}
            </Select>
          </Field>
          <Field label="Hora de salida">
            <Input type="time" value={formHorario.horaSalida} onChange={(e) => setFormHorario({ ...formHorario, horaSalida: e.target.value })} required />
          </Field>
          <Field label="Días">
            <div className="flex flex-wrap gap-2">
              {DIAS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDia(d)}
                  className={`rounded-lg px-2.5 py-1 text-xs capitalize transition ${
                    formHorario.dias.includes(d)
                      ? 'bg-cyan-600/20 text-cyan-800 ring-1 ring-inset ring-cyan-600/40 dark:bg-cyan-400/20 dark:text-cyan-200 dark:ring-cyan-400/40'
                      : 'bg-slate-400/10 text-slate-600 ring-1 ring-inset ring-slate-400/20 dark:text-slate-400'
                  }`}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setModalHorario(false)}>Cancelar</Btn>
            <Btn type="submit">Guardar</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
