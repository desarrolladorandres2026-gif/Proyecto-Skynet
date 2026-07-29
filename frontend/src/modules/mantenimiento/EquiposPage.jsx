import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { mantenimientoApi } from '../../api/mantenimiento.js'
import {
  Btn, Card, ErrorMsg, OkMsg, Field, Input, Select, Textarea, Modal,
  TablaWrap, Th, Td, EmptyState, Pager, aInputFecha,
} from '../../components/ui.jsx'

const FORM_VACIO = {
  numero_inventario: '',
  serial: '',
  tipo_id: '',
  otroTipo: '',
  marca_id: '',
  otraMarca: '',
  modelo: '',
  ubicacion: '',
  responsable: '',
  dependencia: '',
  estado_actual: '',
  procesador: '',
  ram: '',
  disco_duro: '',
  sistema_operativo: '',
  proveedor: '',
  fecha_compra: '',
  observaciones: '',
}

export default function EquiposPage() {
  const [datos, setDatos] = useState({ equipos: [], total: 0, pages: 1, page: 1 })
  const [q, setQ] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [page, setPage] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [catalogos, setCatalogos] = useState({ tipos: [], marcas: [] })
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const data = await mantenimientoApi.equipos.listar({ page, q: busqueda })
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
  }, [page, busqueda])

  useEffect(() => {
    mantenimientoApi.catalogos.obtener().then(setCatalogos).catch(() => {})
  }, [])

  function buscar(e) {
    e.preventDefault()
    setPage(1)
    setBusqueda(q.trim())
  }

  function abrirCrear() {
    setEditandoId(null)
    setForm(FORM_VACIO)
    setErrorForm('')
    setModalAbierto(true)
  }

  function abrirEditar(eq) {
    setEditandoId(eq._id)
    setForm({
      ...FORM_VACIO,
      numero_inventario: eq.numero_inventario,
      serial: eq.serial,
      tipo_id: eq.tipo?.id || '',
      marca_id: eq.marca?.id || '',
      modelo: eq.modelo,
      ubicacion: eq.ubicacion,
      responsable: eq.responsable,
      dependencia: eq.dependencia,
      estado_actual: eq.estado_actual,
      procesador: eq.procesador || '',
      ram: eq.ram || '',
      disco_duro: eq.disco_duro || '',
      sistema_operativo: eq.sistema_operativo || '',
      proveedor: eq.proveedor || '',
      fecha_compra: aInputFecha(eq.fecha_compra),
      observaciones: eq.observaciones || '',
    })
    setErrorForm('')
    setModalAbierto(true)
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      if (editandoId) {
        await mantenimientoApi.equipos.actualizar(editandoId, form)
        setOk('Equipo actualizado correctamente')
      } else {
        await mantenimientoApi.equipos.crear(form)
        setOk('Equipo creado correctamente')
      }
      setModalAbierto(false)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(eq) {
    if (!window.confirm(`¿Eliminar el equipo ${eq.numero_inventario}? Se borrará también su historial de mantenimientos.`)) return
    try {
      await mantenimientoApi.equipos.eliminar(eq._id)
      setOk('Equipo eliminado')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const upd = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Equipos</h1>
        <Btn onClick={abrirCrear}>+ Nuevo equipo</Btn>
      </div>

      <form onSubmit={buscar} className="mb-4 flex gap-2">
        <Input
          placeholder="Buscar por serial, marca, tipo, modelo o ubicación…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
        <Btn variante="secundario" onClick={buscar}>Buscar</Btn>
      </form>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : datos.equipos.length === 0 ? (
        <EmptyState mensaje={busqueda ? `Sin resultados para "${busqueda}"` : 'No hay equipos registrados'} />
      ) : (
        <>
          <p className="panel-mono mb-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{datos.total} equipos</p>
          <TablaWrap>
            <thead>
              <tr>
                <Th>Inventario</Th>
                <Th>Tipo</Th>
                <Th>Marca</Th>
                <Th>Modelo</Th>
                <Th>Serial</Th>
                <Th>Ubicación</Th>
                <Th>Responsable</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {datos.equipos.map((eq) => (
                <tr key={eq._id} className="panel-row">
                  <Td className="font-medium">{eq.numero_inventario}</Td>
                  <Td>{eq.tipo?.nombre}</Td>
                  <Td>{eq.marca?.nombre}</Td>
                  <Td>{eq.modelo}</Td>
                  <Td>{eq.serial}</Td>
                  <Td>{eq.ubicacion}</Td>
                  <Td>{eq.responsable}</Td>
                  <Td>{eq.estado_actual}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      <Link
                        to={`/mantenimiento/equipos/${eq._id}`}
                        className="panel-btn-fantasma rounded-lg px-3 py-2 text-sm font-medium"
                      >
                        Ficha
                      </Link>
                      <Btn variante="fantasma" onClick={() => abrirEditar(eq)}>Editar</Btn>
                      <Btn variante="fantasma" className="!text-red-600 dark:!text-red-400" onClick={() => eliminar(eq)}>
                        Eliminar
                      </Btn>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TablaWrap>
          <Pager page={datos.page} pages={datos.pages} onPage={setPage} />
        </>
      )}

      <Modal
        abierto={modalAbierto}
        titulo={editandoId ? 'Editar equipo' : 'Nuevo equipo'}
        onCerrar={() => setModalAbierto(false)}
        ancho="max-w-2xl"
      >
        <form onSubmit={guardar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Número de inventario">
              <Input required value={form.numero_inventario} onChange={upd('numero_inventario')} />
            </Field>
            <Field label="Serial">
              <Input required value={form.serial} onChange={upd('serial')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de equipo">
              <Select value={form.tipo_id} onChange={upd('tipo_id')}>
                <option value="">— Seleccionar —</option>
                {catalogos.tipos.map((t) => (
                  <option key={t._id} value={t._id}>{t.nombre}</option>
                ))}
              </Select>
              <Input
                placeholder="…o escribir tipo nuevo"
                className="mt-2"
                value={form.otroTipo}
                onChange={upd('otroTipo')}
              />
            </Field>
            <Field label="Marca">
              <Select value={form.marca_id} onChange={upd('marca_id')}>
                <option value="">— Seleccionar —</option>
                {catalogos.marcas.map((m) => (
                  <option key={m._id} value={m._id}>{m.nombre}</option>
                ))}
              </Select>
              <Input
                placeholder="…o escribir marca nueva"
                className="mt-2"
                value={form.otraMarca}
                onChange={upd('otraMarca')}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Modelo">
              <Input required value={form.modelo} onChange={upd('modelo')} />
            </Field>
            <Field label="Ubicación">
              <Input required value={form.ubicacion} onChange={upd('ubicacion')} />
            </Field>
            <Field label="Estado actual">
              <Input required placeholder="Bueno / Regular / Malo…" value={form.estado_actual} onChange={upd('estado_actual')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Responsable">
              <Input required value={form.responsable} onChange={upd('responsable')} />
            </Field>
            <Field label="Dependencia">
              <Input required value={form.dependencia} onChange={upd('dependencia')} />
            </Field>
          </div>

          <details className="rounded-lg border border-cyan-600/20 p-3 dark:border-cyan-400/15">
            <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300">
              Especificaciones técnicas (opcional)
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Procesador">
                <Input value={form.procesador} onChange={upd('procesador')} />
              </Field>
              <Field label="Memoria RAM">
                <Input value={form.ram} onChange={upd('ram')} />
              </Field>
              <Field label="Disco duro">
                <Input value={form.disco_duro} onChange={upd('disco_duro')} />
              </Field>
              <Field label="Sistema operativo">
                <Input value={form.sistema_operativo} onChange={upd('sistema_operativo')} />
              </Field>
              <Field label="Proveedor">
                <Input value={form.proveedor} onChange={upd('proveedor')} />
              </Field>
              <Field label="Fecha de compra">
                <Input type="date" value={form.fecha_compra} onChange={upd('fecha_compra')} />
              </Field>
            </div>
          </details>

          <Field label="Observaciones">
            <Textarea value={form.observaciones} onChange={upd('observaciones')} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalAbierto(false)}>Cancelar</Btn>
            <button
              type="submit"
              disabled={guardando}
              className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
