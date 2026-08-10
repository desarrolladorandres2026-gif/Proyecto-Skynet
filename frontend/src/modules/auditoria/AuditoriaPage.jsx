import { useEffect, useMemo, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { auditoria as auditoriaApi } from '../../api/auditoria.js'
import { Badge, Btn, ErrorMsg, Field, Input, fmtFechaHora } from '../../components/ui.jsx'
import { DataTable } from '../../components/DataTable.jsx'
import { Toolbar, ToolbarReset } from '../../components/Toolbar.jsx'

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [modulo, setModulo] = useState('')
  const [accion, setAccion] = useState('')

  // Acepta overrides explícitos (no lee siempre el state por closure) para
  // que "Limpiar" pueda refetchear con los filtros ya vacíos sin depender
  // de que el próximo render ya haya aplicado el setModulo/setAccion.
  async function cargar(override = {}) {
    setCargando(true)
    try {
      const data = await auditoriaApi.listar({
        page: override.page ?? page,
        modulo: (override.modulo ?? modulo) || undefined,
        accion: (override.accion ?? accion) || undefined,
      })
      setRegistros(data.registros)
      setPages(data.pages)
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
  }, [page])

  function buscar(e) {
    e.preventDefault()
    setPage(1)
    cargar({ page: 1 })
  }

  function limpiar() {
    setModulo('')
    setAccion('')
    setPage(1)
    cargar({ modulo: '', accion: '', page: 1 })
  }

  const columnas = useMemo(
    () => [
      { accessorKey: 'creadoEn', header: 'Fecha', cell: (info) => fmtFechaHora(info.getValue()) },
      { accessorKey: 'usuarioNombre', header: 'Usuario' },
      { accessorKey: 'rolSlug', header: 'Rol' },
      { accessorKey: 'modulo', header: 'Módulo' },
      { accessorKey: 'accion', header: 'Acción' },
      { accessorKey: 'descripcion', header: 'Descripción', enableSorting: false },
      { accessorKey: 'resultado', header: 'Resultado', enableSorting: false, cell: (info) => <Badge valor={info.getValue()} /> },
    ],
    []
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
            <Input value={modulo} onChange={(e) => setModulo(e.target.value)} placeholder="roles" />
          </Field>
          <Field label="Acción" className="w-40">
            <Input value={accion} onChange={(e) => setAccion(e.target.value)} placeholder="actualizar" />
          </Field>
          <Btn type="submit">Filtrar</Btn>
          <ToolbarReset visible={Boolean(modulo || accion)} onClick={limpiar} />
        </Toolbar>
      </form>

      <DataTable
        columns={columnas}
        data={registros}
        cargando={cargando}
        vacio="No hay registros de auditoría"
        paginacionServidor={{ page, pages, onPage: setPage }}
      />
    </div>
  )
}
