// Tabla con orden y paginación (TanStack Table, headless) sobre el mismo
// look de panel-table-wrap/panel-th/panel-td que ya usaban TablaWrap/Th/Td.
// Dos modos de paginación, porque la exploración del código confirmó que
// las 39 páginas no son uniformes: `paginacionServidor` delega a un Pager
// externo (ej. AuditoriaPage, que ya pagina contra la API); sin esa prop,
// pagina del lado del cliente (ej. RolesPage/UsuariosPage, que hoy traen la
// lista completa sin paginar).
import { useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '../lib/cn.js'
import { EmptyState, Pager } from './ui.jsx'
import { SkeletonTable } from './Skeleton.jsx'

export function DataTable({
  columns,
  data,
  cargando = false,
  vacio = 'Sin resultados',
  paginacionServidor,
  filasPorPagina = 10,
}) {
  const [sorting, setSorting] = useState([])

  const tabla = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(paginacionServidor
      ? {}
      : {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageSize: filasPorPagina } },
        }),
  })

  if (cargando) return <SkeletonTable columnas={columns.length} />
  if (data.length === 0) return <EmptyState mensaje={vacio} />

  return (
    <div>
      <div className="panel-table-wrap overflow-x-auto rounded-xl">
        <table className="min-w-full">
          <thead>
            {tabla.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const puedeOrdenar = header.column.getCanSort()
                  const direccion = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'panel-th panel-mono px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide',
                        puedeOrdenar && 'cursor-pointer select-none'
                      )}
                      onClick={puedeOrdenar ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {puedeOrdenar &&
                          (direccion === 'asc' ? (
                            <ArrowUp className="h-3 w-3" aria-hidden="true" />
                          ) : direccion === 'desc' ? (
                            <ArrowDown className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                          ))}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {tabla.getRowModel().rows.map((row) => (
              <tr key={row.id} className="panel-row">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="panel-td px-3 py-2 text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginacionServidor ? (
        <Pager page={paginacionServidor.page} pages={paginacionServidor.pages} onPage={paginacionServidor.onPage} />
      ) : (
        tabla.getPageCount() > 1 && (
          <Pager
            page={tabla.getState().pagination.pageIndex + 1}
            pages={tabla.getPageCount()}
            onPage={(p) => tabla.setPageIndex(p - 1)}
          />
        )
      )}
    </div>
  )
}
