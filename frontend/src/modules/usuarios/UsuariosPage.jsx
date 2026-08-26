import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Users, FlaskConical, Eye, EyeOff, Undo2 } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { usuarios as usuariosApi } from '../../api/usuarios.js'
import { roles as rolesApi } from '../../api/roles.js'
import { catalogosApi } from '../../api/catalogos.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Btn, Badge, ErrorMsg, Field, Input, Select, Modal } from '../../components/ui.jsx'
import { CatalogoSelect } from '../../components/CatalogoSelect.jsx'
import { DataTable } from '../../components/DataTable.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'
import { CheckboxLabel } from '../../components/Checkbox.jsx'
import { AvatarUsuario } from '../../components/AvatarUsuario.jsx'

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
  const { usuario: usuarioActual } = useAuth()
  const esSuperAdmin = Boolean(usuarioActual?.esSuperAdmin)

  // 'reales' = 👥 Usuarios (personal del Terminal), 'prueba' = 🧪 Usuarios de
  // prueba. Son vistas completamente separadas en el backend (cada una pide
  // ?esPrueba=…): un usuario de prueba nunca aparece mezclado en la vista real.
  const [vista, setVista] = useState('reales')
  const esPrueba = vista === 'prueba'

  // Compartida entre módulos (fresca por 1 minuto): volver a esta página tras
  // visitar otra ya no repite las 3 peticiones ni muestra "Cargando..." si la
  // caché sigue vigente. La clave incluye la vista para que cambiar de pestaña
  // dispare su propia carga en vez de reusar la lista de la otra pestaña.
  const { data: resumen, cargando, error, recargar } = useDatosConCache(
    `usuarios:resumen:${vista}`,
    () => Promise.all([usuariosApi.listar({ esPrueba }), rolesApi.listar(), catalogosApi.obtener()])
      .then(([data, rolesData, catalogosData]) => ({
        lista: data.usuarios,
        conteos: data.conteos,
        rolesDisponibles: rolesData.roles,
        dependenciasDisponibles: catalogosData.dependencias,
        cargosDisponibles: catalogosData.cargos,
      })),
    { ttlMs: 60_000 },
  )
  const lista = resumen?.lista || []
  const conteos = resumen?.conteos || { reales: 0, prueba: 0 }
  const rolesDisponibles = resumen?.rolesDisponibles || []

  // Solo un Super Admin puede asignar o elegir roles que otorgan nivel Super Admin
  const rolesParaFormulario = useMemo(() => {
    if (esSuperAdmin) return rolesDisponibles
    return rolesDisponibles.filter((r) => !r.esSuperAdmin)
  }, [rolesDisponibles, esSuperAdmin])

  // catalogosApi.agregar (ver CatalogoSelect) devuelve la lista completa ya
  // actualizada — se guarda como override para que un catálogo creado "al
  // vuelo" en el modal se vea de inmediato, sin esperar a que venza el caché
  // compartido de 'usuarios:resumen'.
  const [dependenciasOverride, setDependenciasOverride] = useState(null)
  const [cargosOverride, setCargosOverride] = useState(null)
  const dependenciasDisponibles = dependenciasOverride ?? resumen?.dependenciasDisponibles ?? []
  const cargosDisponibles = cargosOverride ?? resumen?.cargosDisponibles ?? []

  const [modalAbierto, setModalAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  const [porConvertir, setPorConvertir] = useState(null)
  const [convirtiendo, setConvirtiendo] = useState(false)

  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroRol, setFiltroRol] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  function abrirCrear() {
    setEditandoId(null)
    setForm({ ...FORM_VACIO, rol: rolesParaFormulario[0]?._id || '' })
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
      recargar()
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
      recargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setEliminando(false)
    }
  }

  async function confirmarConvertir() {
    setConvirtiendo(true)
    try {
      await usuariosApi.convertirReal(porConvertir._id)
      toast.success(`${porConvertir.nombre_usuario} ahora es un usuario real`)
      setPorConvertir(null)
      recargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setConvirtiendo(false)
    }
  }

  const listaFiltrada = useMemo(() => {
    const texto = filtroTexto.trim().toLowerCase()
    return lista.filter((u) => {
      if (texto) {
        const coincide =
          u.nombre_usuario?.toLowerCase().includes(texto) ||
          u.nombre?.toLowerCase().includes(texto) ||
          u.email?.toLowerCase().includes(texto)
        if (!coincide) return false
      }
      if (filtroRol && (u.rol?._id || u.rol) !== filtroRol) return false
      if (filtroEstado && u.estado !== filtroEstado) return false
      return true
    })
  }, [lista, filtroTexto, filtroRol, filtroEstado])

  const columnas = useMemo(
    () => [
      {
        accessorKey: 'nombre_usuario',
        header: 'Usuario',
        cell: (info) => (
          <div className="flex items-center gap-2.5">
            <AvatarUsuario usuario={info.row.original} className="h-7 w-7 shrink-0 shadow-2xs" />
            <div className="flex items-center gap-2">
              <span className="font-medium">{info.getValue()}</span>
              {esPrueba && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  Prueba
                </span>
              )}
            </div>
          </div>
        ),
      },
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
        cell: ({ row }) => {
          const esFilaSuperAdmin = Boolean(row.original.rol?.esSuperAdmin)
          const bloqueadoPorNoSuperAdmin = !esSuperAdmin && esFilaSuperAdmin
          return (
            <div className="flex justify-end gap-1.5">
              {esPrueba && (
                <Btn
                  variante="fantasma"
                  disabled={bloqueadoPorNoSuperAdmin}
                  title={bloqueadoPorNoSuperAdmin ? 'Solo un Super Admin puede convertir a este usuario' : undefined}
                  onClick={() => setPorConvertir(row.original)}
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Convertir en real
                </Btn>
              )}
              <Btn
                variante="fantasma"
                disabled={bloqueadoPorNoSuperAdmin}
                title={bloqueadoPorNoSuperAdmin ? 'Solo un Super Admin puede editar a este usuario' : undefined}
                onClick={() => abrirEditar(row.original)}
              >
                Editar
              </Btn>
              <Btn
                variante="fantasma"
                disabled={bloqueadoPorNoSuperAdmin}
                title={bloqueadoPorNoSuperAdmin ? 'Solo un Super Admin puede eliminar a este usuario' : undefined}
                className="!text-red-600 dark:!text-red-400"
                onClick={() => setPorEliminar(row.original)}
              >
                Eliminar
              </Btn>
            </div>
          )
        },
      },
    ],
    [esPrueba, esSuperAdmin]
  )

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {esPrueba ? (
            <FlaskConical className="h-5 w-5 text-amber-500" aria-hidden="true" />
          ) : (
            <Users className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          )}
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {esPrueba ? 'Usuarios de prueba' : 'Usuarios'}
          </h1>
        </div>
        {!esPrueba && (
          <Btn onClick={abrirCrear}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo usuario
          </Btn>
        )}
      </div>

      <div className="mb-4 flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setVista('reales')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            vista === 'reales'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          Usuarios <span className="text-xs opacity-70">({conteos.reales})</span>
        </button>
        <button
          type="button"
          onClick={() => setVista('prueba')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            vista === 'prueba'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          Usuarios de prueba <span className="text-xs opacity-70">({conteos.prueba})</span>
        </button>
      </div>

      {esPrueba && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          Estos usuarios están aislados del personal real: no aparecen en dashboards, estadísticas, reportes ni selectores de trabajador. Puedes convertirlos en usuarios reales cuando correspondan a un trabajador oficial del Terminal.
        </p>
      )}

      <ErrorMsg>{error}</ErrorMsg>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Buscar">
          <Input
            placeholder="Usuario, nombre o email…"
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />
        </Field>
        <Field label="Rol">
          <Select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
            <option value="">Todos</option>
            {rolesDisponibles.map((r) => (
              <option key={r._id} value={r._id}>{r.nombre}</option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="activo">activo</option>
            <option value="inactivo">inactivo</option>
          </Select>
        </Field>
      </div>

      <DataTable columns={columnas} data={listaFiltrada} cargando={cargando} vacio="No hay usuarios que coincidan con el filtro" />

      <Modal
        abierto={modalAbierto}
        titulo={editandoId ? 'Editar usuario' : 'Nuevo usuario'}
        onCerrar={() => setModalAbierto(false)}
      >
        <form onSubmit={guardar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>

          <div className="flex items-center gap-3 rounded-lg border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <AvatarUsuario className="h-12 w-12 shadow-xs border-2 border-brand-500/30" />
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Foto de perfil oficial</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Asignada automáticamente a todos los usuarios</p>
            </div>
          </div>

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
                {rolesParaFormulario.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.nombre} {r.esSuperAdmin ? '(Super Admin)' : ''}
                  </option>
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
                onCrear={setDependenciasOverride}
              />
            </Field>
            <Field label="Cargo">
              <CatalogoSelect
                tipo="cargo"
                placeholder="Selecciona un cargo…"
                valor={form.cargo}
                onChange={(nombre) => setForm({ ...form, cargo: nombre })}
                opciones={cargosDisponibles}
                onCrear={setCargosOverride}
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

      <ConfirmDialog
        abierto={Boolean(porConvertir)}
        onCancelar={() => setPorConvertir(null)}
        onConfirmar={confirmarConvertir}
        cargando={convirtiendo}
        titulo={`¿Convertir a "${porConvertir?.nombre_usuario}" en usuario real?`}
        descripcion="Pasará a la sección de Usuarios y dejará de aparecer en Usuarios de prueba. No se modifican su contraseña, correo ni rol."
        confirmarLabel="Convertir en real"
      />
    </div>
  )
}
