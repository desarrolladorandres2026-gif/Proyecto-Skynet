import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ScrollText, Trash2 } from 'lucide-react'
import { auditoria as auditoriaApi } from '../../api/auditoria.js'
import { useDatosConCache, invalidarCachePorPrefijo } from '../../hooks/useDatosConCache.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Badge, Btn, ErrorMsg, Field, Input, Select, Modal, fmtFechaHora } from '../../components/ui.jsx'
import { DataTable } from '../../components/DataTable.jsx'
import { Toolbar, ToolbarReset } from '../../components/Toolbar.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'

const PALABRA_CONFIRMACION = 'ELIMINAR'

const FILTROS_VACIOS = { modulo: '', accion: '', resultado: '', usuario: '', desde: '', hasta: '' }

export default function AuditoriaPage() {
  const { usuario } = useAuth()
  const esSuperAdmin = Boolean(usuario?.esSuperAdmin)

  const [page, setPage] = useState(1)
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  // Los filtros solo se aplican al enviar el formulario (Buscar/Limpiar), no
  // en cada tecla — se guardan aparte para que solo ESE valor entre en la
  // clave de caché.
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_VACIOS)

  const { data, cargando, error, recargar } = useDatosConCache(
    `auditoria:lista:${page}:${JSON.stringify(filtrosAplicados)}`,
    () => {
      const f = filtrosAplicados
      return auditoriaApi.listar({
        page,
        modulo: f.modulo || undefined,
        accion: f.accion || undefined,
        resultado: f.resultado || undefined,
        usuario: f.usuario || undefined,
        desde: f.desde || undefined,
        hasta: f.hasta || undefined,
      })
    },
    { ttlMs: 30_000 },
  )
  const registros = data?.registros || []
  const pages = data?.pages || 1

  function recargarTodo() {
    invalidarCachePorPrefijo('auditoria:lista:')
    recargar()
  }

  const { data: opcionesFiltroData } = useDatosConCache(
    'auditoria:filtros',
    () => auditoriaApi.obtenerFiltros(),
    { ttlMs: 5 * 60_000 },
  )
  const opcionesFiltro = opcionesFiltroData || { modulos: [], acciones: [] }

  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  const [seleccionados, setSeleccionados] = useState(() => new Set())
  const [loteAbierto, setLoteAbierto] = useState(false)
  const [confirmacionLote, setConfirmacionLote] = useState('')
  const [eliminandoLote, setEliminandoLote] = useState(false)
  const [errorLote, setErrorLote] = useState('')

  function actualizarFiltro(campo, valor) {
    setFiltros((f) => ({ ...f, [campo]: valor }))
  }

  function buscar(e) {
    e.preventDefault()
    setPage(1)
    setSeleccionados(new Set())
    setFiltrosAplicados(filtros)
  }

  function limpiar() {
    setFiltros(FILTROS_VACIOS)
    setPage(1)
    setSeleccionados(new Set())
    setFiltrosAplicados(FILTROS_VACIOS)
  }

  const hayFiltrosActivos = Object.values(filtros).some(Boolean)

  function alternarSeleccion(id) {
    setSeleccionados((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  const todosVisiblesSeleccionados = registros.length > 0 && registros.every((r) => seleccionados.has(r._id))

  function alternarSeleccionTodos() {
    setSeleccionados((prev) => {
      const siguiente = new Set(prev)
      if (todosVisiblesSeleccionados) {
        registros.forEach((r) => siguiente.delete(r._id))
      } else {
        registros.forEach((r) => siguiente.add(r._id))
      }
      return siguiente
    })
  }

  async function confirmarEliminar() {
    setEliminando(true)
    try {
      await auditoriaApi.eliminar(porEliminar._id)
      toast.success('Registro de auditoría eliminado')
      setPorEliminar(null)
      setSeleccionados((prev) => {
        const siguiente = new Set(prev)
        siguiente.delete(porEliminar._id)
        return siguiente
      })
      recargarTodo()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setEliminando(false)
    }
  }

  function abrirLote() {
    setConfirmacionLote('')
    setErrorLote('')
    setLoteAbierto(true)
  }

  async function confirmarEliminarLote(e) {
    e.preventDefault()
    if (confirmacionLote.trim().toUpperCase() !== PALABRA_CONFIRMACION) {
      setErrorLote(`Escribe "${PALABRA_CONFIRMACION}" para confirmar`)
      return
    }
    setEliminandoLote(true)
    setErrorLote('')
    try {
      const { eliminados } = await auditoriaApi.eliminarMasivo([...seleccionados])
      toast.success(`${eliminados} registro(s) eliminados`)
      setSeleccionados(new Set())
      setLoteAbierto(false)
      recargarTodo()
    } catch (err) {
      setErrorLote(err.message)
    } finally {
      setEliminandoLote(false)
    }
  }

  const columnas = useMemo(
    () => [
      // Selección personalizable para eliminar en lote: exclusiva de Super
      // Admin, igual que la columna "Eliminar" de abajo — ver soloAdmin en
      // auditoria.routes.js.
      ...(esSuperAdmin
        ? [
            {
              id: 'seleccion',
              enableSorting: false,
              header: () => (
                <input
                  type="checkbox"
                  checked={todosVisiblesSeleccionados}
                  onChange={alternarSeleccionTodos}
                  aria-label="Seleccionar todos los registros de esta página"
                />
              ),
              cell: ({ row }) => (
                <input
                  type="checkbox"
                  checked={seleccionados.has(row.original._id)}
                  onChange={() => alternarSeleccion(row.original._id)}
                  aria-label="Seleccionar registro"
                />
              ),
            },
          ]
        : []),
      { accessorKey: 'creadoEn', header: 'Fecha', cell: (info) => fmtFechaHora(info.getValue()) },
      { accessorKey: 'usuarioNombre', header: 'Usuario' },
      { accessorKey: 'rolSlug', header: 'Rol' },
      { accessorKey: 'modulo', header: 'Módulo' },
      { accessorKey: 'accion', header: 'Acción' },
      { accessorKey: 'descripcion', header: 'Descripción', enableSorting: false },
      { accessorKey: 'resultado', header: 'Resultado', enableSorting: false, cell: (info) => <Badge valor={info.getValue()} /> },
      // Eliminar un registro es exclusivo del Super Admin (ver
      // auditoria.routes.js::soloAdmin) — la columna entera desaparece para
      // cualquier otro rol en vez de mostrar un botón que igual daría 403.
      ...(esSuperAdmin
        ? [
            {
              id: 'acciones',
              header: '',
              enableSorting: false,
              cell: ({ row }) => (
                <div className="flex justify-end">
                  <Btn
                    variante="fantasma"
                    className="!text-red-600 dark:!text-red-400"
                    onClick={() => setPorEliminar(row.original)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Eliminar
                  </Btn>
                </div>
              ),
            },
          ]
        : []),
    ],
    // alternarSeleccion/alternarSeleccionTodos se recrean cada render (no
    // memoizadas con useCallback) pero cierran sobre el mismo state ya
    // listado abajo, así que listarlas aquí sería ruido sin cambiar el
    // comportamiento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [esSuperAdmin, seleccionados, todosVisiblesSeleccionados]
  )

  return (
    <div>
      <div className="mb-1 flex items-center gap-2.5">
        <ScrollText className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Auditoría</h1>
      </div>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Se conservan los registros de los últimos 3 meses; los más antiguos se eliminan automáticamente.
      </p>

      <ErrorMsg>{error}</ErrorMsg>

      <form onSubmit={buscar}>
        <Toolbar>
          <Field label="Módulo" className="w-40">
            <Select value={filtros.modulo} onChange={(e) => actualizarFiltro('modulo', e.target.value)}>
              <option value="">Todos</option>
              {opcionesFiltro.modulos.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Acción" className="w-40">
            <Select value={filtros.accion} onChange={(e) => actualizarFiltro('accion', e.target.value)}>
              <option value="">Todas</option>
              {opcionesFiltro.acciones.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
          </Field>
          <Field label="Resultado" className="w-32">
            <Select value={filtros.resultado} onChange={(e) => actualizarFiltro('resultado', e.target.value)}>
              <option value="">Todos</option>
              <option value="exito">Éxito</option>
              <option value="error">Error</option>
            </Select>
          </Field>
          <Field label="Usuario" className="w-44">
            <Input
              value={filtros.usuario}
              onChange={(e) => actualizarFiltro('usuario', e.target.value)}
              placeholder="Nombre…"
            />
          </Field>
          <Field label="Desde" className="w-40">
            <Input type="date" value={filtros.desde} onChange={(e) => actualizarFiltro('desde', e.target.value)} />
          </Field>
          <Field label="Hasta" className="w-40">
            <Input type="date" value={filtros.hasta} onChange={(e) => actualizarFiltro('hasta', e.target.value)} />
          </Field>
          <Btn type="submit">Filtrar</Btn>
          <ToolbarReset visible={hayFiltrosActivos} onClick={limpiar} />
        </Toolbar>
      </form>

      {esSuperAdmin && seleccionados.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {seleccionados.size} registro(s) seleccionado(s)
          </p>
          <div className="flex gap-2">
            <Btn variante="fantasma" onClick={() => setSeleccionados(new Set())}>Quitar selección</Btn>
            <Btn variante="peligro" onClick={abrirLote} className="flex items-center gap-1.5">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Eliminar seleccionados
            </Btn>
          </div>
        </div>
      )}

      <DataTable
        columns={columnas}
        data={registros}
        cargando={cargando}
        vacio="No hay registros de auditoría"
        paginacionServidor={{ page, pages, onPage: setPage }}
      />

      <ConfirmDialog
        abierto={Boolean(porEliminar)}
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={confirmarEliminar}
        cargando={eliminando}
        titulo="¿Eliminar este registro de auditoría?"
        descripcion="Esta acción no se puede deshacer. Quedará una nueva entrada de auditoría documentando qué registro se eliminó y quién lo hizo."
        confirmarLabel="Eliminar"
      />

      <Modal abierto={loteAbierto} titulo={`Eliminar ${seleccionados.size} registro(s) de auditoría`} onCerrar={() => setLoteAbierto(false)}>
        <form onSubmit={confirmarEliminarLote} className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Esta acción no se puede deshacer. Quedará una única entrada de auditoría resumiendo esta eliminación en lote.
          </p>
          <ErrorMsg>{errorLote}</ErrorMsg>
          <Field label={`Escribe "${PALABRA_CONFIRMACION}" para confirmar`}>
            <Input value={confirmacionLote} onChange={(e) => setConfirmacionLote(e.target.value)} placeholder={PALABRA_CONFIRMACION} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variante="secundario" onClick={() => setLoteAbierto(false)}>Cancelar</Btn>
            <Btn type="submit" variante="peligro" disabled={eliminandoLote}>
              {eliminandoLote ? 'Eliminando…' : `Eliminar ${seleccionados.size} registro(s)`}
            </Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
