import { useEffect, useState } from 'react'
import { Plus, Trash2, Bus, ArrowUpFromLine, ArrowDownToLine } from 'lucide-react'
import { plataformas as api, vehiculos as vehiculosApi } from '../../api/flota.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Input, Select, Modal, EmptyState,
} from '../../components/ui.jsx'

// Tablero visual de plataformas: la vista de trabajo del Despachador.
export default function PlataformasPage() {
  const { tienePermiso } = useAuth()
  const puedeGestionar = tienePermiso('plataformas:gestionar')
  const puedeCambiar = puedeGestionar || tienePermiso('plataformas:cambiar')

  const [lista, setLista] = useState([])
  const [listaVehiculos, setListaVehiculos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [modalCrear, setModalCrear] = useState(false)
  const [formCrear, setFormCrear] = useState({ numero: '', tipo: 'ascenso' })
  const [ocupando, setOcupando] = useState(null) // plataforma a la que se asigna vehículo
  const [vehiculoSel, setVehiculoSel] = useState('')
  const [errorForm, setErrorForm] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const [p, v] = await Promise.all([api.listar(), vehiculosApi.listar().catch(() => ({ vehiculos: [] }))])
      setLista(p.plataformas)
      setListaVehiculos(v.vehiculos)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  async function crear(ev) {
    ev.preventDefault()
    setErrorForm('')
    try {
      await api.crear({ numero: Number(formCrear.numero), tipo: formCrear.tipo })
      setOk(`Plataforma ${formCrear.numero} creada`)
      setModalCrear(false)
      setFormCrear({ numero: '', tipo: 'ascenso' })
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    }
  }

  async function cambiar(p, estado, vehiculoId) {
    setOk('')
    setError('')
    try {
      await api.cambiarEstado(p._id, { estado, vehiculoId })
      setOcupando(null)
      setVehiculoSel('')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  async function eliminar(p) {
    if (!window.confirm(`¿Eliminar la plataforma ${p.numero}?`)) return
    try {
      await api.eliminar(p._id)
      setOk('Plataforma eliminada')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const BORDES = {
    libre: '!border-emerald-400/40',
    ocupada: '!border-amber-400/50',
    mantenimiento: '!border-slate-500/40',
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">Plataformas</h1>
        {puedeGestionar && (
          <Btn onClick={() => setModalCrear(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nueva plataforma
          </Btn>
        )}
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay plataformas configuradas" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {lista.map((p) => (
            <Card key={p._id} className={`border ${BORDES[p.estado]}`}>
              <div className="flex items-start justify-between">
                <p className="panel-mono text-2xl font-bold text-slate-900 dark:text-white">{p.numero}</p>
                <span className="panel-mono flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
                  {p.tipo === 'ascenso'
                    ? <ArrowUpFromLine className="h-3 w-3" aria-hidden="true" />
                    : <ArrowDownToLine className="h-3 w-3" aria-hidden="true" />}
                  {p.tipo}
                </span>
              </div>

              <div className="mt-2"><Badge valor={p.estado} /></div>

              {p.vehiculoActual && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-200">
                  <Bus className="h-4 w-4" aria-hidden="true" />
                  {p.vehiculoActual.placa}
                  <span className="text-xs text-slate-500">{p.vehiculoActual.empresa?.nombre}</span>
                </p>
              )}

              {puedeCambiar && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.estado !== 'ocupada' && (
                    <Btn variante="secundario" className="!px-2 !py-1 text-xs" onClick={() => { setOcupando(p); setVehiculoSel('') }}>
                      Acoderar
                    </Btn>
                  )}
                  {p.estado !== 'libre' && (
                    <Btn variante="secundario" className="!px-2 !py-1 text-xs" onClick={() => cambiar(p, 'libre')}>
                      Liberar
                    </Btn>
                  )}
                  {p.estado !== 'mantenimiento' && (
                    <Btn variante="fantasma" className="!px-2 !py-1 text-xs" onClick={() => cambiar(p, 'mantenimiento')}>
                      Mantenim.
                    </Btn>
                  )}
                  {puedeGestionar && (
                    <Btn variante="peligro" className="!px-2 !py-1" onClick={() => eliminar(p)} title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Btn>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal abierto={modalCrear} titulo="Nueva plataforma" onCerrar={() => setModalCrear(false)}>
        <form onSubmit={crear} className="grid gap-3">
          <ErrorMsg>{errorForm}</ErrorMsg>
          <Field label="Número">
            <Input type="number" min="1" value={formCrear.numero} onChange={(e) => setFormCrear({ ...formCrear, numero: e.target.value })} required />
          </Field>
          <Field label="Tipo">
            <Select value={formCrear.tipo} onChange={(e) => setFormCrear({ ...formCrear, tipo: e.target.value })}>
              <option value="ascenso">Ascenso</option>
              <option value="descenso">Descenso</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setModalCrear(false)}>Cancelar</Btn>
            <Btn type="submit">Crear</Btn>
          </div>
        </form>
      </Modal>

      <Modal abierto={Boolean(ocupando)} titulo={`Acoderar vehículo — plataforma ${ocupando?.numero}`} onCerrar={() => setOcupando(null)}>
        <div className="grid gap-3">
          <Field label="Vehículo">
            <Select value={vehiculoSel} onChange={(e) => setVehiculoSel(e.target.value)}>
              <option value="">Selecciona…</option>
              {listaVehiculos.map((v) => (
                <option key={v._id} value={v._id}>{v.placa} — {v.empresa?.nombre}</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setOcupando(null)}>Cancelar</Btn>
            <Btn disabled={!vehiculoSel} onClick={() => cambiar(ocupando, 'ocupada', vehiculoSel)}>Acoderar</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
