import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Users, Eye, EyeOff } from 'lucide-react'
import { usuarios as usuariosApi } from '../../api/usuarios.js'
import { roles as rolesApi } from '../../api/roles.js'
import { catalogosApi } from '../../api/catalogos.js'
import { Btn, Badge, ErrorMsg, Field, Input, Select, Modal } from '../../components/ui.jsx'
import { CatalogoSelect } from '../../components/CatalogoSelect.jsx'
import { DataTable } from '../../components/DataTable.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'
import { CheckboxLabel } from '../../components/Checkbox.jsx'

const FORM_VACIO = {
  nombre_usuario: '',
  nombre: '',
  email: '',
  password: '',
  confirmarPassword: '',
  rol: '',
  dependencia: '',
  cargo: '',
  modulos: [],
  estado: 'activo',
}

export default function UsuariosPage() {
  const [lista, setLista] = useState([])
  const [rolesDisponibles, setRolesDisponibles] = useState([])
  const [dependenciasDisponibles, setDependenciasDisponibles] = useState([])
  const [cargosDisponibles, setCargosDisponibles] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  async function cargar() {
    setCargando(true)
    try {
      const [data, rolesData, catalogosData] = await Promise.all([
        usuariosApi.listar(),
        rolesApi.listar(),
        catalogosApi.obtener(),
      ])
      setLista(data.usuarios)
      setRolesDisponibles(rolesData.roles)
      setDependenciasDisponibles(catalogosData.dependencias)
      setCargosDisponibles(catalogosData.cargos)
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

  function abrirCrear() {
    setEditandoId(null)
    setForm({ ...FORM_VACIO, rol: rolesDisponibles[0]?._id || '' })
    setMostrarPassword(false)
    setErrorForm('')
    setModalAbierto(true)
  }

  function abrirEditar(u) {
    setEditandoId(u._id)
    setForm({
      nombre_usuario: u.nombre_usuario,
      nombre: u.nombre,
      email: u.email,
      password: '',
      confirmarPassword: '',
      rol: u.rol?._id || u.rol || '',
      dependencia: u.dependencia || '',
      cargo: u.cargo || '',
      modulos: u.modulos || [],
      estado: u.estado,
    })
    setMostrarPassword(false)
    setErrorForm('')
    setModalAbierto(true)
  }

  function toggleModulo(mod) {
    setForm((f) => ({
      ...f,
      modulos: f.modulos.includes(mod) ? f.modulos.filter((m) => m !== mod) : [...f.modulos, mod],
    }))
  }

  async function guardar(e) {
    e.preventDefault()
    if (form.password && form.password !== form.confirmarPassword) {
      setErrorForm('La contraseña y su confirmación no coinciden')
      return
    }
    setGuardando(true)
    setErrorForm('')
    try {
      if (editandoId) {
        const { confirmarPassword: _omit, ...datos } = form
        if (!datos.password) delete datos.password
        await usuariosApi.actualizar(editandoId, datos)
        toast.success('Usuario actualizado correctamente')
      } else {
        const { confirmarPassword: _omit, ...datos } = form
        await usuariosApi.crear(datos)
        toast.success('Usuario creado correctamente')
      }
      setModalAbierto(false)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarEliminar() {
    setEliminando(true)
    try {
      await usuariosApi.eliminar(porEliminar._id)
      toast.success('Usuario eliminado')
      setPorEliminar(null)
      cargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setEliminando(false)
    }
  }

  const columnas = useMemo(
    () => [
      { accessorKey: 'nombre_usuario', header: 'Usuario', cell: (info) => <span className="font-medium">{info.getValue()}</span> },
      { accessorKey: 'nombre', header: 'Nombre' },
      { accessorKey: 'email', header: 'Email' },
      { id: 'rol', header: 'Rol', accessorFn: (u) => u.rol?.slug, cell: (info) => <Badge valor={info.getValue()} /> },
      {
        id: 'modulos',
        header: 'Módulos',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {(row.original.modulos || []).map((m) => (
              <span key={m} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {m}
              </span>
            ))}
          </div>
        ),
      },
      { accessorKey: 'estado', header: 'Estado', cell: (info) => <Badge valor={info.getValue()} /> },
      {
        id: 'acciones',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1.5">
            <Btn variante="fantasma" onClick={() => abrirEditar(row.original)}>Editar</Btn>
            <Btn variante="fantasma" className="!text-red-600 dark:!text-red-400" onClick={() => setPorEliminar(row.original)}>
              Eliminar
            </Btn>
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
          <Users className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Usuarios</h1>
        </div>
        <Btn onClick={abrirCrear}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo usuario
        </Btn>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <DataTable columns={columnas} data={lista} cargando={cargando} vacio="No hay usuarios registrados" />

      <Modal
        abierto={modalAbierto}
        titulo={editandoId ? 'Editar usuario' : 'Nuevo usuario'}
        onCerrar={() => setModalAbierto(false)}
      >
        <form onSubmit={guardar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre de usuario">
              <Input required value={form.nombre_usuario} onChange={(e) => setForm({ ...form, nombre_usuario: e.target.value })} />
            </Field>
            <Field label="Nombre completo">
              <Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
          </div>

          <Field label="Correo electrónico">
            <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={editandoId ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}>
              <div className="relative">
                <Input
                  type={mostrarPassword ? 'text' : 'password'}
                  required={!editandoId}
                  // Debe coincidir con PASSWORD_MIN de Backend/src/utils/password.js:
                  // con un mínimo menor, el navegador deja enviar el formulario y el
                  // rechazo llega como error 400 del servidor en vez de validarse aquí.
                  minLength={12}
                  className="pr-9"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {mostrarPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </Field>
            <Field label="Confirmar contraseña">
              <Input
                type={mostrarPassword ? 'text' : 'password'}
                required={!editandoId || Boolean(form.password)}
                minLength={12}
                value={form.confirmarPassword}
                onChange={(e) => setForm({ ...form, confirmarPassword: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Rol">
              <Select required value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
                <option value="" disabled>Selecciona un rol…</option>
                {rolesDisponibles.map((r) => (
                  <option key={r._id} value={r._id}>{r.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Dependencia">
              <CatalogoSelect
                tipo="dependencia"
                placeholder="Selecciona una dependencia…"
                valor={form.dependencia}
                onChange={(nombre) => setForm({ ...form, dependencia: nombre })}
                opciones={dependenciasDisponibles}
                onCrear={setDependenciasDisponibles}
              />
            </Field>
            <Field label="Cargo">
              <CatalogoSelect
                tipo="cargo"
                placeholder="Selecciona un cargo…"
                valor={form.cargo}
                onChange={(nombre) => setForm({ ...form, cargo: nombre })}
                opciones={cargosDisponibles}
                onCrear={setCargosDisponibles}
              />
            </Field>
            <Field label="Estado">
              <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                <option value="activo">activo</option>
                <option value="inactivo">inactivo</option>
              </Select>
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Acceso a módulos legados (mantenimiento)
            </legend>
            <div className="flex gap-4">
              {['mantenimiento'].map((mod) => (
                <CheckboxLabel key={mod} checked={form.modulos.includes(mod)} onCheckedChange={() => toggleModulo(mod)}>
                  {mod}
                </CheckboxLabel>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalAbierto(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Btn>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        abierto={Boolean(porEliminar)}
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={confirmarEliminar}
        cargando={eliminando}
        titulo={`¿Eliminar al usuario "${porEliminar?.nombre_usuario}"?`}
        descripcion="Esta acción no se puede deshacer."
        confirmarLabel="Eliminar"
      />
    </div>
  )
}
