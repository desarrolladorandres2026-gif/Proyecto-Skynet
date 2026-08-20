import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'
import { LayoutDashboard, Download, Users, CircleCheck, CircleX, ClipboardList } from 'lucide-react'
import { sig } from '../../api/sig.js'
import { catalogosApi } from '../../api/catalogos.js'
import { Card, ErrorMsg, EmptyState, Btn } from '../../components/ui.jsx'
import FiltrosDashboardSig from '../../components/sig/FiltrosDashboardSig.jsx'

// La cuadrícula/ejes usan un gris medio fijo (no var(--panel-*)) porque
// recharts pinta SVG y no reacciona a las clases `dark:` de Tailwind — mismo
// criterio documentado en SupervisorPage.jsx. El tooltip sí se deja oscuro
// fijo a propósito (como un tooltip nativo del sistema): se lee igual de
// bien encima de cualquiera de los dos temas de la página.
const EJE = '#64748b'
const GRID = 'rgba(100, 116, 139, 0.25)'
const TOOLTIP_STYLE = { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }
const COLOR_CORRECTAS = '#10b981'
const COLOR_INCORRECTAS = '#f43f5e'

function Indicador({ icon: Icon, label, valor, color = 'text-cyan-700 dark:text-cyan-400' }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 ${color}`}>
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{valor}</p>
          <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">{label}</p>
        </div>
      </div>
    </Card>
  )
}

const FILTROS_VACIOS = { desde: '', hasta: '', dependencia: '', cargo: '', componenteSig: '', tema: '', resultado: '' }

export default function DashboardSigPage() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [componentes, setComponentes] = useState([])
  const [catalogos, setCatalogos] = useState({ dependencias: [], cargos: [] })
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const [d, config, cat] = await Promise.all([
        sig.dashboard(filtros),
        sig.configuracion.obtener(),
        catalogosApi.obtener(),
      ])
      setDatos(d)
      setComponentes(config.configuracion.componentes)
      setCatalogos(cat)
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
  }, [])

  async function exportar() {
    try {
      const { blob, nombre } = await sig.exportarExcel(filtros)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <LayoutDashboard className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Dashboard Cuestionarios Programados
        </h1>
        <div className="flex items-center gap-3">
          <Link to="/sig/reportes/individual" className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-400">
            Reporte individual
          </Link>
          <Link to="/sig/reportes/plan-refuerzo" className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-400">
            Plan de refuerzo
          </Link>
          <Btn variante="secundario" className="flex items-center gap-1.5" onClick={exportar}>
            <Download className="h-4 w-4" aria-hidden="true" /> Exportar Excel
          </Btn>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <FiltrosDashboardSig
        filtros={filtros}
        onChange={setFiltros}
        onAplicar={cargar}
        componentes={componentes}
        catalogos={catalogos}
      />

      {cargando || !datos ? (
        <Card>Cargando…</Card>
      ) : (
        <>
          {datos.resumenHoy?.hayPreguntaHoy ? (
            <Card className="mb-4">
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Pregunta de hoy</p>
              <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{datos.resumenHoy.totalElegibles}</p>
                  <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Convocados</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{datos.resumenHoy.trabajadoresRespondieron}</p>
                  <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Respondieron</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{datos.resumenHoy.trabajadoresPendientes}</p>
                  <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Pendientes</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{datos.resumenHoy.porcentajeParticipacion}%</p>
                  <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Participación</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="mb-4">
              <EmptyState mensaje="No hay un Cuestionario Programado para hoy." />
            </Card>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador icon={Users} label="Trabajadores activos" valor={datos.indicadores.totalTrabajadores} />
            <Indicador icon={ClipboardList} label="Preguntas publicadas" valor={datos.indicadores.totalPreguntasPublicadas} />
            <Indicador icon={CircleCheck} label="Respuestas correctas" valor={datos.indicadores.correctas} color="text-emerald-600 dark:text-emerald-400" />
            <Indicador icon={CircleX} label="Respuestas incorrectas" valor={datos.indicadores.incorrectas} color="text-red-600 dark:text-red-400" />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador icon={Users} label="Participaron (rango)" valor={`${datos.indicadores.trabajadoresParticiparon} (${datos.indicadores.porcentajeParticipacion}%)`} />
            <Indicador icon={CircleCheck} label="Acierto global" valor={`${datos.indicadores.porcentajeAciertoGlobal}%`} color="text-emerald-600 dark:text-emerald-400" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Participación diaria</p>
              {datos.participacionDiaria.length === 0 ? (
                <EmptyState mensaje="Sin datos en el rango filtrado" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={datos.participacionDiaria}>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                    <XAxis dataKey="fecha" stroke={EJE} tick={{ fontSize: 11 }} />
                    <YAxis stroke={EJE} tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="correctas" name="Correctas" fill={COLOR_CORRECTAS} stackId="a" />
                    <Bar dataKey="incorrectas" name="Incorrectas" fill={COLOR_INCORRECTAS} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Resultado por componente</p>
              {datos.porComponente.length === 0 ? (
                <EmptyState mensaje="Sin datos en el rango filtrado" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={datos.porComponente} layout="vertical">
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                    <XAxis type="number" stroke={EJE} tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="componenteSig" stroke={EJE} tick={{ fontSize: 11 }} width={110} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="correctas" name="Correctas" fill={COLOR_CORRECTAS} stackId="a" />
                    <Bar dataKey="incorrectas" name="Incorrectas" fill={COLOR_INCORRECTAS} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Distribución por nivel de desempeño</p>
              {datos.distribucionNivel.every((n) => n.total === 0) ? (
                <EmptyState mensaje="Sin datos en el rango filtrado" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={datos.distribucionNivel.filter((n) => n.total > 0)}
                      dataKey="total"
                      nameKey="nombre"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(d) => `${d.nombre} (${d.total})`}
                    >
                      {datos.distribucionNivel.filter((n) => n.total > 0).map((n) => (
                        <Cell key={n.clave} fill={n.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
