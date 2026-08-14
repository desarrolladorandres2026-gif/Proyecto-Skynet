import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, IdCard } from 'lucide-react'
import { empleadosApi } from '../../api/empleados.js'
import { catalogosApi } from '../../api/catalogos.js'
import { Btn, Badge, ErrorMsg, Field, Input, Select, Modal, Textarea } from '../../components/ui.jsx'
import { DataTable } from '../../components/DataTable.jsx'

const TIPOS_DOCUMENTO = ['CC', 'CE', 'PA', 'TI', 'RC']

const FORM_VACIO = {
  usuario: '',
  numeroDocumento: '',
  tipoDocumento: 'CC',
  telefono: '',
  cargo: '',
  dependencia: '',
  fechaIngreso: '',
}

// Empleado.fechaIngreso viaja como ISO completo desde el backend; el
// <input type="date"> solo entiende "yyyy-mm-dd".
function aInputDate(valor) {
  return valor ? String(valor).slice(0, 10) : ''
}

export default function EmpleadosPage() {
  const [lista, setLista] = useState([])
  const [usuariosDisponibles, setUsuariosDisponibles] = useState([])
  const [cargosDisponibles, setCargosDisponibles] = useState([])
  const [dependenciasDisponibles, setDependenciasDisponibles] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  const [porDesvincular, setPorDesvincular] = useState(null)
  const [motivoDesvinculacion, setMotivoDesvinculacion] = useState('')
  const [procesando, setProcesando] = useState(false)

  async function cargar() {
    setCargando(true)
    try {
      const [data, catalogosData] = await Promise.all([empleadosApi.listar(), catalogosApi.obtener()])
      setLista(data.empleados)
      setCargosDisponibles(catalogosData.cargos)
      setDependenciasDisponibles(catalogosData.dependencias)
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

  async function abrirCrear() {
    setEditando(null)
    setForm(FORM_VACIO)
    setErrorForm('')
    try {
      const data = await empleadosApi.usuariosDisponibles()
      setUsuariosDisponibles(data.usuarios)
      setModalAbierto(true)
    } catch (err) {
      toast.error(err.message)
    }
  }

  function abrirEditar(e) {
    setEditando(e)
    setForm({
      usuario: e.usuario?._id || e.usuario || '',
      numeroDocumento: e.numeroDocumento,
      tipoDocumento: e.tipoDocumento,
      telefono: e.telefono || '',
      cargo: e.cargo?._id || e.cargo || '',
      dependencia: e.dependencia?._id || e.dependencia || '',
      fechaIngreso: aInputDate(e.fechaIngreso),
    })
    setErrorForm('')
    setModalAbierto(true)
  }

  async function guardar(ev) {
    ev.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      const datos = {
        numeroDocumento: form.numeroDocumento,
        tipoDocumento: form.tipoDocumento,
        telefono: form.telefono,
        cargo: form.cargo || null,
        dependencia: form.dependencia || null,
        fechaIngreso: form.fechaIngreso,
      }
      if (editando) {
        await empleadosApi.actualizar(editando._id, datos)
        toast.success('Empleado actualizado correctamente')
      } else {
        await empleadosApi.crear({ ...datos, usuario: form.usuario })
        toast.success('Empleado creado correctamente')
      }
      setModalAbierto(false)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarDesvincular() {
    setProcesando(true)
    try {
      await empleadosApi.desvincular(porDesvincular._id, motivoDesvinculacion)
      toast.success('Empleado desvinculado')
      setPorDesvincular(null)
      setMotivoDesvinculacion('')
      cargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setProcesando(false)
    }
  }

  async function reactivar(e) {
    try {
      await empleadosApi.reactivar(e._id)
      toast.success('Empleado reactivado')
      cargar()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const columnas = useMemo(
    () => [
      {
        id: 'nombre',
        header: 'Empleado',
        accessorFn: (e) => e.usuario?.nombre || '',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      },
      { accessorKey: 'numeroDocumento', header: 'Documento', cell: ({ row }) => `${row.original.tipoDocumento} ${row.original.numeroDocumento}` },
      { id: 'cargo', header: 'Cargo', accessorFn: (e) => e.cargo?.nombre || '—' },
      { id: 'dependencia', header: 'Dependencia', accessorFn: (e) => e.dependencia?.nombre || '—' },
      {
        accessorKey: 'fechaIngreso',
        header: 'Ingreso',
        cell: (info) => new Date(info.getValue()).toLocaleDateString('es-CO'),
      },
      { accessorKey: 'estado', header: 'Estado', cell: (info) => <Badge valor={info.getValue()} /> },
      {
        id: 'acciones',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1.5">
            <Btn variante="fantasma" onClick={() => abrirEditar(row.original)}>Editar</Btn>
            {row.original.estado === 'activo' ? (
              <Btn variante="fantasma" className="!text-red-600 dark:!text-red-400" onClick={() => setPorDesvincular(row.original)}>
                Desvincular
              </Btn>
            ) : (
              <Btn variante="fantasma" onClick={() => reactivar(row.original)}>Reactivar</Btn>
            )}
          </div>
        ),
      },
    ],
    []
  )

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <IdCard className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Empleados</h1>
        </div>
        <Btn onClick={abrirCrear}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo empleado
        </Btn>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <DataTable columns={columnas} data={lista} cargando={cargando} vacio="No hay empleados registrados" />

      <Modal abierto={modalAbierto} titulo={editando ? 'Editar empleado' : 'Nuevo empleado'} onCerrar={() => setModalAbierto(false)}>
        <form onSubmit={guardar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>

          <Field label="Usuario">
            {editando ? (
              <Input disabled value={editando.usuario?.nombre || ''} />
            ) : (
              <Select required value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })}>
                <option value="" disabled>Selecciona un usuario…</option>
                {usuariosDisponibles.map((u) => (
                  <option key={u._id} value={u._id}>{u.nombre} ({u.nombre_usuario})</option>
                ))}
              </Select>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tipo de documento">
              <Select value={form.tipoDocumento} onChange={(e) => setForm({ ...form, tipoDocumento: e.target.value })}>
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Número de documento" className="sm:col-span-2">
              <Input required value={form.numeroDocumento} onChange={(e) => setForm({ ...form, numeroDocumento: e.target.value })} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono">
              <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </Field>
            <Field label="Fecha de ingreso">
              <Input type="date" required value={form.fechaIngreso} onChange={(e) => setForm({ ...form, fechaIngreso: e.target.value })} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cargo">
              <Select value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })}>
                <option value="">Sin asignar</option>
                {cargosDisponibles.map((c) => (
                  <option key={c._id} value={c._id}>{c.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Dependencia">
              <Select value={form.dependencia} onChange={(e) => setForm({ ...form, dependencia: e.target.value })}>
                <option value="">Sin asignar</option>
                {dependenciasDisponibles.map((d) => (
                  <option key={d._id} value={d._id}>{d.nombre}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalAbierto(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </form>
      </Modal>

      {/* Modal, no ConfirmDialog: se necesita un campo de texto (motivo) además
          de la confirmación, y AlertDialog.Description (usado por
          ConfirmDialog) renderiza un <p>, donde no puede anidarse un
          <textarea> sin producir HTML inválido. */}
      <Modal
        abierto={Boolean(porDesvincular)}
        titulo={`¿Desvincular a "${porDesvincular?.usuario?.nombre}"?`}
        onCerrar={() => { setPorDesvincular(null); setMotivoDesvinculacion('') }}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            El expediente se conserva y puede reactivarse después. No afecta la cuenta de acceso del usuario.
          </p>
          <Field label="Motivo (opcional)">
            <Textarea value={motivoDesvinculacion} onChange={(e) => setMotivoDesvinculacion(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => { setPorDesvincular(null); setMotivoDesvinculacion('') }}>Cancelar</Btn>
            <Btn variante="peligro" disabled={procesando} onClick={confirmarDesvincular}>
              {procesando ? 'Procesando…' : 'Desvincular'}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
