import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Lock, Plus, ShieldCheck } from 'lucide-react'
import { roles as rolesApi } from '../../api/roles.js'
import { permisos as permisosApi } from '../../api/permisos.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import {
  Btn, Badge, ErrorMsg, Field, Input, Select, Textarea, Modal,
} from '../../components/ui.jsx'
import { DataTable } from '../../components/DataTable.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'
import { CheckboxLabel } from '../../components/Checkbox.jsx'

const FORM_VACIO = {
  nombre: '',
  slug: '',
  descripcion: '',
  ambito: 'global',
  esSuperAdmin: false,
  permisos: [],
}

export default function RolesPage() {
  const { data, cargando, error, recargar } = useDatosConCache(
    'roles:lista',
    () => Promise.all([rolesApi.listar(), permisosApi.listarAgrupados()])
      .then(([rolesData, permisosData]) => ({ lista: rolesData.roles, modulosPermisos: permisosData.modulos })),
    { ttlMs: 60_000 },
  )
  const lista = data?.lista || []
  const modulosPermisos = data?.modulosPermisos || []

  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

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
        toast.success('Rol actualizado correctamente')
      } else {
        await rolesApi.crear(form)
        toast.success('Rol creado correctamente')
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
      await rolesApi.eliminar(porEliminar._id)
      toast.success('Rol eliminado')
      setPorEliminar(null)
      recargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setEliminando(false)
    }
  }

  const columnas = useMemo(
    () => [
      {
        accessorKey: 'nombre',
        header: 'Rol',
        cell: ({ row }) => (
          <div>
            <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
              {row.original.esSistema && <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
              {row.original.nombre}
              {row.original.esSuperAdmin && (
                <ShieldCheck className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{row.original.descripcion}</div>
          </div>
        ),
      },
      { accessorKey: 'ambito', header: 'Ámbito', cell: (info) => <Badge valor={info.getValue()} /> },
      {
        id: 'permisos',
        header: 'Permisos',
        enableSorting: false,
        cell: ({ row }) => (row.original.esSuperAdmin ? 'Todos (bypass)' : `${row.original.permisos.length} permiso(s)`),
      },
      { accessorKey: 'estado', header: 'Estado', cell: (info) => <Badge valor={info.getValue()} /> },
      {
        id: 'acciones',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1.5">
            <Btn variante="fantasma" onClick={() => abrirEditar(row.original)}>Editar</Btn>
            {!row.original.esSistema && (
              <Btn variante="fantasma" className="!text-red-600 dark:!text-red-400" onClick={() => setPorEliminar(row.original)}>
                Eliminar
              </Btn>
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
          <ShieldCheck className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Roles y permisos</h1>
        </div>
        <Btn onClick={abrirCrear}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo rol
        </Btn>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <DataTable columns={columnas} data={lista} cargando={cargando} vacio="No hay roles registrados" />

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
              {/* Único valor posible desde que se retiró el módulo flota/Empresa
                  (ver Backend/src/models/Rol.js) — se deja el campo (no un
                  literal fijo) porque el backend sigue siendo la fuente de
                  verdad del enum, no esta página. */}
              <Select value={form.ambito} onChange={(e) => setForm({ ...form, ambito: e.target.value })}>
                <option value="global">Global</option>
              </Select>
            </Field>
            <Field label="Nivel">
              <div className="mt-2">
                <CheckboxLabel
                  disabled={Boolean(editando?.esSistema)}
                  checked={form.esSuperAdmin}
                  onCheckedChange={(checked) => setForm({ ...form, esSuperAdmin: checked === true })}
                >
                  Super Administrador (acceso total, ignora la lista de permisos)
                </CheckboxLabel>
              </div>
            </Field>
          </div>

          {!form.esSuperAdmin && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Permisos</legend>
              <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-brand-600/15 p-3 dark:border-brand-400/10">
                {modulosPermisos.map((grupo) => (
                  <div key={grupo.modulo}>
                    <p className="panel-mono mb-1 text-[11px] font-semibold tracking-wide text-brand-700/70 uppercase dark:text-brand-400/70">
                      {grupo.modulo}
                    </p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {grupo.permisos.map((p) => (
                        <CheckboxLabel
                          key={p.codigo}
                          checked={form.permisos.includes(p.codigo)}
                          onCheckedChange={() => togglePermiso(p.codigo)}
                        >
                          {p.nombre}
                        </CheckboxLabel>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          )}

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
        titulo={`¿Eliminar el rol "${porEliminar?.nombre}"?`}
        descripcion="Esta acción no se puede deshacer."
        confirmarLabel="Eliminar"
      />
    </div>
  )
}
