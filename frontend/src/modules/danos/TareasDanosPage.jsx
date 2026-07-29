import { useEffect, useState } from 'react'
import { ClipboardList, Play, CheckCheck, Trash2 } from 'lucide-react'
import { danos as danosApi } from '../../api/danos.js'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Select,
  TablaWrap, Th, Td, EmptyState, fmtFechaHora,
} from '../../components/ui.jsx'

const FILTROS = [
  { valor: '', label: 'Todos' },
  { valor: 'pendiente', label: 'Pendientes' },
  { valor: 'en_proceso', label: 'En proceso' },
  { valor: 'resuelto', label: 'Resueltos' },
]

const TIPOS = [
  { valor: '', label: 'Todos los tipos' },
  { valor: 'dano', label: 'Daño' },
  { valor: 'novedad', label: 'Novedad' },
  { valor: 'sugerencia', label: 'Sugerencia' },
  { valor: 'otro', label: 'Otro' },
]
const TIPO_LABELS = Object.fromEntries(TIPOS.filter((t) => t.valor).map((t) => [t.valor, t.label]))

function Contador({ etiqueta, valor, resaltado = false }) {
  return (
    <Card className="flex-1 text-center">
      <p className={`text-2xl font-bold ${resaltado ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>{valor}</p>
      <p className="panel-mono text-[11px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">{etiqueta}</p>
    </Card>
  )
}

export default function TareasDanosPage() {
  const [reportes, setReportes] = useState([])
  const [resumen, setResumen] = useState({ pendientes: 0, en_proceso: 0, resueltos: 0 })
  const [filtro, setFiltro] = useState('pendiente')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function cargar(estado = filtro, tipo = filtroTipo) {
    setCargando(true)
    try {
      const data = await danosApi.listar(estado || undefined, tipo || undefined)
      setReportes(data.reportes)
      setResumen(data.resumen)
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
  }, [filtro, filtroTipo])

  async function cambiarEstado(r, estado) {
    setOk('')
    setError('')
    try {
      await danosApi.cambiarEstado(r._id, estado)
      setOk(estado === 'resuelto' ? 'Tarea marcada como resuelta' : 'Tarea tomada: en proceso')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  async function eliminar(r) {
    if (!window.confirm('¿Eliminar este reporte de daño? La foto también se eliminará.')) return
    setOk('')
    setError('')
    try {
      await danosApi.eliminar(r._id)
      setOk('Reporte eliminado')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <ClipboardList className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Reportes de usuarios
        </h1>
        <div className="flex gap-2">
          <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="w-44">
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>{t.label}</option>
            ))}
          </Select>
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="w-40">
            {FILTROS.map((f) => (
              <option key={f.valor} value={f.valor}>{f.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      <div className="mb-6 flex gap-3">
        <Contador etiqueta="Pendientes" valor={resumen.pendientes} resaltado />
        <Contador etiqueta="En proceso" valor={resumen.en_proceso} />
        <Contador etiqueta="Resueltos" valor={resumen.resueltos} />
      </div>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : reportes.length === 0 ? (
        <EmptyState mensaje="No hay reportes de daños con este filtro" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Tipo</Th>
              <Th>Reportado por</Th>
              <Th>Descripción</Th>
              <Th>Foto</Th>
              <Th>Estado</Th>
              <Th>Atendido por</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {reportes.map((r) => (
              <tr key={r._id}>
                <Td className="whitespace-nowrap">{fmtFechaHora(r.fecha)}</Td>
                <Td className="whitespace-nowrap">{TIPO_LABELS[r.tipo] || 'Daño'}</Td>
                <Td>
                  <p className="text-slate-700 dark:text-slate-200">{r.reportadoPor?.nombre || '—'}</p>
                  {r.reportadoPor?.dependencia && (
                    <p className="text-xs text-slate-500">{r.reportadoPor.dependencia}</p>
                  )}
                </Td>
                <Td className="max-w-sm">{r.descripcion}</Td>
                <Td>
                  {r.foto?.url ? (
                    <a href={r.foto.url} target="_blank" rel="noreferrer" title="Ver foto completa">
                      <img src={r.foto.url} alt="Foto adjunta" className="h-14 w-14 rounded object-cover" />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Td>
                <Td><Badge valor={r.estado} /></Td>
                <Td>{r.atendidoPor?.nombre || '—'}</Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    {r.estado === 'pendiente' && (
                      <Btn
                        variante="secundario"
                        onClick={() => cambiarEstado(r, 'en_proceso')}
                        title="Tomar tarea (en proceso)"
                        className="flex items-center gap-1.5 !px-2.5"
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" /> Tomar
                      </Btn>
                    )}
                    {r.estado !== 'resuelto' && (
                      <Btn
                        onClick={() => cambiarEstado(r, 'resuelto')}
                        title="Marcar como resuelto"
                        className="flex items-center gap-1.5 !px-2.5"
                      >
                        <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Resolver
                      </Btn>
                    )}
                    <Btn
                      variante="peligro"
                      onClick={() => eliminar(r)}
                      title="Eliminar reporte"
                      className="!px-2.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}
    </div>
  )
}
