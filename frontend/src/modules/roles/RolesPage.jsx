import { useEffect, useState } from 'react'
import { Lock, ShieldCheck } from 'lucide-react'
import { roles as rolesApi } from '../../api/roles.js'
import { permisos as permisosApi } from '../../api/permisos.js'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Input, Select, Textarea, Modal,
  TablaWrap, Th, Td, EmptyState,
} from '../../components/ui.jsx'

const FORM_VACIO = {
  nombre: '',
  slug: '',
  descripcion: '',
  ambito: 'global',
  esSuperAdmin: false,
  permisos: [],
}

export default function RolesPage() {
  const [lista, setLista] = useState([])
  const [modulosPermisos, setModulosPermisos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const [rolesData, permisosData] = await Promise.all([
        rolesApi.listar(),
        permisosApi.listarAgrupados(),
      ])
      setLista(rolesData.roles)
      setModulosPermisos(permisosData.modulos)
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
    setEditando(null)
    setForm(FORM_VACIO)
    setErrorForm('')
    setModalAbierto(true)
  }

  function abrirEditar(rol) {
    setEditando(rol)
    setForm({
      nombre: rol.nombre,
      slug: rol.slug,
      descripcion: rol.descripcion || '',
      ambito: rol.ambito,
      esSuperAdmin: rol.esSuperAdmin,
      permisos: rol.permisos.map((p) => p.codigo),
    })
    setErrorForm('')
    setModalAbierto(true)
  }

  function togglePermiso(codigo) {
    setForm((f) => ({
      ...f,
      permisos: f.permisos.includes(codigo)
        ? f.permisos.filter((c) => c !== codigo)
        : [...f.permisos, codigo],
    }))
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      if (editando) {
        await rolesApi.actualizar(editando._id, form)
        setOk('Rol actualizado correctamente')
      } else {
        await rolesApi.crear(form)
        setOk('Rol creado correctamente')
      }
      setModalAbierto(false)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(rol) {
    if (!window.confirm(`¿Eliminar el rol "${rol.nombre}"? Esta acción no se puede deshacer.`)) return
    try {
      await rolesApi.eliminar(rol._id)
      setOk('Rol eliminado')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Roles y permisos</h1>
        <Btn onClick={abrirCrear}>+ Nuevo rol</Btn>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay roles registrados" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Rol</Th>
              <Th>Ámbito</Th>
              <Th>Permisos</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {lista.map((r) => (
              <tr key={r._id}>
                <Td className="font-medium">
                  <div className="flex items-center gap-2">
                    {r.esSistema && <Lock className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />}
                    {r.nombre}
                    {r.esSuperAdmin && (
                      <ShieldCheck className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{r.descripcion}</div>
                </Td>
                <Td><Badge valor={r.ambito} /></Td>
                <Td>{r.esSuperAdmin ? 'Todos (bypass)' : `${r.permisos.length} permiso(s)`}</Td>
                <Td><Badge valor={r.estado} /></Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Btn variante="fantasma" onClick={() => abrirEditar(r)}>Editar</Btn>
                    {!r.esSistema && (
                      <Btn variante="fantasma" className="!text-red-600 dark:!text-red-400" onClick={() => eliminar(r)}>
                        Eliminar
                      </Btn>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Modal
        abierto={modalAbierto}
        titulo={editando ? `Editar rol: ${editando.nombre}` : 'Nuevo rol'}
        onCerrar={() => setModalAbierto(false)}
        ancho="max-w-2xl"
      >
        <form onSubmit={guardar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre">
              <Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Slug (identificador único)">
              <Input
                required
                disabled={Boolean(editando?.esSistema)}
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Descripción">
            <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ámbito">
              <Select value={form.ambito} onChange={(e) => setForm({ ...form, ambito: e.target.value })}>
                <option value="global">Global</option>
                <option value="empresa">Solo su empresa (multi-tenant)</option>
              </Select>
            </Field>
            <Field label="Nivel">
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  disabled={Boolean(editando?.esSistema)}
                  checked={form.esSuperAdmin}
                  onChange={(e) => setForm({ ...form, esSuperAdmin: e.target.checked })}
                />
                Super Administrador (acceso total, ignora la lista de permisos)
              </label>
            </Field>
          </div>

          {!form.esSuperAdmin && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Permisos</legend>
              <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-cyan-600/15 p-3 dark:border-cyan-400/10">
                {modulosPermisos.map((grupo) => (
                  <div key={grupo.modulo}>
                    <p className="panel-mono mb-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-700/70 dark:text-cyan-400/70">
                      {grupo.modulo}
                    </p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {grupo.permisos.map((p) => (
                        <label key={p.codigo} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={form.permisos.includes(p.codigo)}
                            onChange={() => togglePermiso(p.codigo)}
                          />
                          {p.nombre}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          )}

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
