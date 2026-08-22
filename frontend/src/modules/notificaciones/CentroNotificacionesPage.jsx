import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Bell, CheckCheck } from 'lucide-react'
import { notificaciones as notificacionesApi } from '../../api/notificaciones.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Badge, Btn, ErrorMsg, fmtFechaHora } from '../../components/ui.jsx'
import { DataTable } from '../../components/DataTable.jsx'

const ETIQUETA_CATEGORIA = {
  mantenimiento: 'Mantenimiento',
  danos: 'Daños',
  requerimientos: 'Requerimientos',
  ausencias: 'Ausencias',
  sig_pregunta_dia: 'Cuestionarios',
  sistema: 'Sistema',
}

export default function CentroNotificacionesPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  const { data, cargando, error, actualizarLocal } = useDatosConCache(
    `notificaciones:centro:${page}`,
    () => notificacionesApi.misNotificaciones({ page, limit: 20 }),
    { ttlMs: 20_000 },
  )
  const notificaciones = data?.notificaciones || []
  const pages = data?.pages || 1

  async function marcarUna(n) {
    if (!n.leida) {
      actualizarLocal((d) => ({ ...d, notificaciones: d.notificaciones.map((x) => (x._id === n._id ? { ...x, leida: true } : x)) }))
      try {
        await notificacionesApi.marcarLeida(n._id)
      } catch (err) {
        toast.error(err.message)
      }
    }
    if (n.url) navigate(n.url)
  }

  async function marcarTodas() {
    try {
      const { actualizadas } = await notificacionesApi.marcarTodasLeidas()
      actualizarLocal((d) => ({ ...d, notificaciones: d.notificaciones.map((x) => ({ ...x, leida: true })) }))
      toast.success(actualizadas > 0 ? `${actualizadas} notificación(es) marcadas como leídas` : 'No había nada pendiente')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const hayNoLeidas = notificaciones.some((n) => !n.leida)

  const columnas = useMemo(
    () => [
      {
        id: 'estado',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className={`inline-block h-2 w-2 rounded-full ${row.original.leida ? 'bg-transparent' : 'bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.8)]'}`}
            aria-label={row.original.leida ? 'Leída' : 'No leída'}
          />
        ),
      },
      { accessorKey: 'createdAt', header: 'Fecha', cell: (info) => fmtFechaHora(info.getValue()) },
      { accessorKey: 'categoria', header: 'Categoría', cell: (info) => <Badge label={ETIQUETA_CATEGORIA[info.getValue()] || info.getValue()} /> },
      {
        accessorKey: 'titulo',
        header: 'Notificación',
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <p className={row.original.leida ? 'text-slate-600 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-white'}>
              {row.original.titulo}
            </p>
            {row.original.cuerpo && <p className="text-xs text-slate-500 dark:text-slate-400">{row.original.cuerpo}</p>}
          </div>
        ),
      },
      {
        id: 'accion',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Btn variante="fantasma" onClick={() => marcarUna(row.original)}>
            {row.original.url ? 'Abrir' : row.original.leida ? 'Ver' : 'Marcar leída'}
          </Btn>
        ),
      },
    ],
    // marcarUna cierra sobre notificaciones/navigate, se recrea cada render
    // a propósito: no vale la pena memoizarla, el costo es un array nuevo de
    // columnas, no una petición de red.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <Bell className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Notificaciones</h1>
        </div>
        {hayNoLeidas && (
          <Btn variante="secundario" onClick={marcarTodas} className="flex items-center gap-1.5">
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Marcar todas como leídas
          </Btn>
        )}
      </div>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Todo lo que Skynet te ha avisado, incluido lo que pasó mientras no estabas conectado.
      </p>

      <ErrorMsg>{error}</ErrorMsg>

      <DataTable
        columns={columnas}
        data={notificaciones}
        cargando={cargando}
        vacio="No tienes notificaciones todavía"
        paginacionServidor={{ page, pages, onPage: setPage }}
      />
    </div>
  )
}
