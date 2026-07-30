import { useEffect, useState } from 'react'
import { usuarios as usuariosApi } from '../../api/usuarios.js'
import { roles as rolesApi } from '../../api/roles.js'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Input, Select, Modal,
  TablaWrap, Th, Td, EmptyState,
} from '../../components/ui.jsx'

const FORM_VACIO = {
  nombre_usuario: '',
  nombre: '',
  email: '',
  password: '',
  rol: '',
  empresa: '',
  dependencia: '',
  cargo: '',
  modulos: [],
  estado: 'activo',
}

export default function UsuariosPage() {
  const [lista, setLista] = useState([])
  const [rolesDisponibles, setRolesDisponibles] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const [data, rolesData] = await Promise.all([usuariosApi.listar(), rolesApi.listar()])
      setLista(data.usuarios)
      setRolesDisponibles(rolesData.roles)
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
      rol: u.rol?._id || u.rol || '',
      empresa: u.empresa?._id || u.empresa || '',
      dependencia: u.dependencia || '',
      cargo: u.cargo || '',
      modulos: u.modulos || [],
      estado: u.estado,
    })
    setErrorForm('')
    setModalAbierto(true)
  }

  // El rol "Empresa Transportadora" (ambito:'empresa') necesita una empresa
  // asignada para que el scoping multi-tenant funcione (ver
  // middleware/permisos.js#cargarScopeEmpresa). El módulo real "Empresas
  // transportadoras" (Fase 1) reemplazará este campo de texto por un
  // selector poblado desde /api/empresas.
  const rolSeleccionado = rolesDisponibles.find((r) => r._id === form.rol)
  const requiereEmpresa = rolSeleccionado?.ambito === 'empresa'

  function toggleModulo(mod) {
    setForm((f) => ({
      ...f,
      modulos: f.modulos.includes(mod) ? f.modulos.filter((m) => m !== mod) : [...f.modulos, mod],
    }))
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      if (editandoId) {
        const datos = { ...form }
        if (!datos.password) delete datos.password
        await usuariosApi.actualizar(editandoId, datos)
        setOk('Usuario actualizado correctamente')
      } else {
        await usuariosApi.crear(form)
        setOk('Usuario creado correctamente')
      }
      setModalAbierto(false)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(u) {
    if (!window.confirm(`¿Eliminar al usuario "${u.nombre_usuario}"? Esta acción no se puede deshacer.`)) return
    try {
      await usuariosApi.eliminar(u._id)
      setOk('Usuario eliminado')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Usuarios</h1>
        <Btn onClick={abrirCrear}>+ Nuevo usuario</Btn>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay usuarios registrados" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Usuario</Th>
              <Th>Nombre</Th>
              <Th>Email</Th>
              <Th>Rol</Th>
              <Th>Módulos</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {lista.map((u) => (
              <tr key={u._id}>
                <Td className="font-medium">{u.nombre_usuario}</Td>
                <Td>{u.nombre}</Td>
                <Td>{u.email}</Td>
                <Td><Badge valor={u.rol?.slug} /></Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {(u.modulos || []).map((m) => (
                      <span key={m} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {m}
                      </span>
                    ))}
                  </div>
                </Td>
                <Td><Badge valor={u.estado} /></Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Btn variante="fantasma" onClick={() => abrirEditar(u)}>Editar</Btn>
                    <Btn variante="fantasma" className="!text-red-600 dark:!text-red-400" onClick={() => eliminar(u)}>
                      Eliminar
                    </Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

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

          <Field label={editandoId ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}>
            <Input
              type="password"
              required={!editandoId}
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>

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
              <Input value={form.dependencia} onChange={(e) => setForm({ ...form, dependencia: e.target.value })} />
            </Field>
            <Field label="Cargo">
              <Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
            </Field>
            <Field label="Estado">
              <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                <option value="activo">activo</option>
                <option value="inactivo">inactivo</option>
              </Select>
            </Field>
          </div>

          {requiereEmpresa && (
            <Field label="Empresa (ID) — el rol Empresa Transportadora necesita una empresa asignada">
              <Input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} />
            </Field>
          )}

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Acceso a módulos legados (mantenimiento)
            </legend>
            <div className="flex gap-4">
              {['mantenimiento'].map((mod) => (
                <label key={mod} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={form.modulos.includes(mod)} onChange={() => toggleModulo(mod)} />
                  {mod}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalAbierto(false)}>Cancelar</Btn>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
