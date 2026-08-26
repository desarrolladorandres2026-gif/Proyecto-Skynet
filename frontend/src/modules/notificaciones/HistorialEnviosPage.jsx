import { useMemo, useState } from 'react'
import { MailWarning } from 'lucide-react'
import { notificaciones as notificacionesApi } from '../../api/notificaciones.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Badge, Btn, ErrorMsg, Field, Input, Select, fmtFechaHora } from '../../components/ui.jsx'
import { DataTable } from '../../components/DataTable.jsx'
import { Toolbar, ToolbarReset } from '../../components/Toolbar.jsx'
import { NotificacionesAdminTabs } from './EleccionNotificacionesPage.jsx'

const ESTADO_COLOR = { enviado: 'exito', fallido: 'error', pendiente: 'pendiente' }

const FILTROS_VACIOS = { usuario: '', categoria: '', canal: '', estado: '', desde: '', hasta: '', soloErrores: false }

export default function HistorialEnviosPage() {
  const [page, setPage] = useState(1)
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  // Los filtros solo se aplican al enviar el formulario (Buscar/Limpiar), no
  // en cada tecla — se guardan aparte para que solo ESE valor entre en la
  // clave de caché.
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_VACIOS)

  const { data, cargando, error } = useDatosConCache(
    `notificaciones:historial:${page}:${JSON.stringify(filtrosAplicados)}`,
    () => {
      const f = filtrosAplicados
      return notificacionesApi.historialEnvios({
        page,
        usuario: f.usuario || undefined,
        categoria: f.categoria || undefined,
        canal: f.canal || undefined,
        estado: f.estado || undefined,
        desde: f.desde || undefined,
        hasta: f.hasta || undefined,
        soloErrores: f.soloErrores || undefined,
      })
    },
    { ttlMs: 30_000 },
  )
  const envios = data?.envios || []
  const pages = data?.pages || 1

  const { data: opcionesFiltroData } = useDatosConCache(
    'notificaciones:historialFiltros',
    () => notificacionesApi.historialFiltros(),
    { ttlMs: 5 * 60_000 },
  )
  const opcionesFiltro = opcionesFiltroData || { categorias: [], canales: [], estados: [] }

  function actualizarFiltro(campo, valor) {
    setFiltros((f) => ({ ...f, [campo]: valor }))
  }

  function buscar(e) {
    e.preventDefault()
    setPage(1)
    setFiltrosAplicados(filtros)
  }

  function limpiar() {
    setFiltros(FILTROS_VACIOS)
    setPage(1)
    setFiltrosAplicados(FILTROS_VACIOS)
  }

  const hayFiltrosActivos = Object.values(filtros).some(Boolean)

  const columnas = useMemo(
    () => [
      { accessorKey: 'createdAt', header: 'Creado', cell: (info) => fmtFechaHora(info.getValue()) },
      {
        id: 'destinatario',
        header: 'Destinatario',
        enableSorting: false,
        cell: ({ row }) => row.original.usuario?.nombre || row.original.usuario?.email || '—',
      },
      { accessorKey: 'canal', header: 'Canal' },
      { accessorKey: 'categoria', header: 'Categoría' },
      {
        id: 'dispositivo',
        header: 'Dispositivo',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.canal === 'push' && row.original.pushSubscription
            ? `${row.original.pushSubscription.navegador} / ${row.original.pushSubscription.dispositivo}`
            : row.original.canal === 'email'
              ? '—'
              : 'Suscripción eliminada',
      },
      {
        accessorKey: 'estado',
        header: 'Estado',
        cell: (info) => <Badge valor={ESTADO_COLOR[info.getValue()]} label={info.getValue()} />,
      },
      { accessorKey: 'intentos', header: 'Intentos' },
      { accessorKey: 'enviadoEn', header: 'Enviado', cell: (info) => fmtFechaHora(info.getValue()) },
      {
        accessorKey: 'error',
        header: 'Error',
        enableSorting: false,
        cell: (info) => (info.getValue() ? <span className="text-red-600 dark:text-red-400">{info.getValue()}</span> : '—'),
      },
    ],
    []
  )

  return (
    <div>
      <NotificacionesAdminTabs />

      <div className="mb-1 flex items-center gap-2.5">
        <MailWarning className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Historial de envíos</h1>
      </div>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Bitácora real de cada intento de push/correo — para responder "¿por qué esta persona no recibió esta notificación?".
      </p>

      <ErrorMsg>{error}</ErrorMsg>

      <form onSubmit={buscar}>
        <Toolbar>
          <Field label="Usuario" className="w-44">
            <Input
              value={filtros.usuario}
              onChange={(e) => actualizarFiltro('usuario', e.target.value)}
              placeholder="Nombre o correo…"
            />
          </Field>
          <Field label="Categoría" className="w-40">
            <Select value={filtros.categoria} onChange={(e) => actualizarFiltro('categoria', e.target.value)}>
              <option value="">Todas</option>
              {opcionesFiltro.categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Canal" className="w-32">
            <Select value={filtros.canal} onChange={(e) => actualizarFiltro('canal', e.target.value)}>
              <option value="">Todos</option>
              {opcionesFiltro.canales.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Estado" className="w-32">
            <Select value={filtros.estado} onChange={(e) => actualizarFiltro('estado', e.target.value)}>
              <option value="">Todos</option>
              {opcionesFiltro.estados.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </Select>
          </Field>
          <Field label="Desde" className="w-40">
            <Input type="date" value={filtros.desde} onChange={(e) => actualizarFiltro('desde', e.target.value)} />
          </Field>
          <Field label="Hasta" className="w-40">
            <Input type="date" value={filtros.hasta} onChange={(e) => actualizarFiltro('hasta', e.target.value)} />
          </Field>
          <Field label="Solo errores" className="w-32">
            <label className="flex h-9 items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={filtros.soloErrores}
                onChange={(e) => actualizarFiltro('soloErrores', e.target.checked)}
              />
              Con error
            </label>
          </Field>
          <Btn type="submit">Filtrar</Btn>
          <ToolbarReset visible={hayFiltrosActivos} onClick={limpiar} />
        </Toolbar>
      </form>

      <DataTable
        columns={columnas}
        data={envios}
        cargando={cargando}
        vacio="No hay envíos que coincidan con estos filtros"
        paginacionServidor={{ page, pages, onPage: setPage }}
      />
    </div>
  )
}
