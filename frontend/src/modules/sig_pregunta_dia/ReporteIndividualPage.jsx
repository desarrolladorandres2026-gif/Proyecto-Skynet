import { useEffect, useState } from 'react'
import { UserRoundSearch } from 'lucide-react'
import { sig } from '../../api/sig.js'
import { catalogosApi } from '../../api/catalogos.js'
import {
  Card, ErrorMsg, Field, Select, Badge, TablaWrap, Th, Td, EmptyState, fmtFecha,
} from '../../components/ui.jsx'
import FiltrosDashboardSig from '../../components/sig/FiltrosDashboardSig.jsx'

const FILTROS_VACIOS = { desde: '', hasta: '', dependencia: '', cargo: '', componenteSig: '', tema: '', resultado: '' }

export default function ReporteIndividualPage() {
  const [trabajadores, setTrabajadores] = useState([])
  const [usuarioId, setUsuarioId] = useState('')
  const [componentes, setComponentes] = useState([])
  const [catalogos, setCatalogos] = useState({ dependencias: [], cargos: [] })
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [reporte, setReporte] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([sig.trabajadoresParticipantes(), sig.configuracion.obtener(), catalogosApi.obtener()])
      .then(([t, config, cat]) => {
        setTrabajadores(t.trabajadores)
        setComponentes(config.configuracion.componentes)
        setCatalogos(cat)
      })
      .catch((err) => setError(err.message))
  }, [])

  async function consultar() {
    if (!usuarioId) return
    setCargando(true)
    setError('')
    try {
      const data = await sig.reporteTrabajador(usuarioId, filtros)
      setReporte(data)
    } catch (err) {
      setError(err.message)
      setReporte(null)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    if (usuarioId) consultar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId])

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <UserRoundSearch className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">Reporte individual</h1>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <Card className="mb-4">
        <Field label="Trabajador">
          <Select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
            <option value="">Selecciona un trabajador que ya haya respondido…</option>
            {trabajadores.map((t) => (
              <option key={t._id} value={t._id}>{t.nombre} — {t.cargo || 'sin cargo'} ({t.dependencia || 'sin dependencia'})</option>
            ))}
          </Select>
        </Field>
      </Card>

      {usuarioId && (
        <FiltrosDashboardSig
          filtros={filtros}
          onChange={setFiltros}
          onAplicar={consultar}
          componentes={componentes}
          catalogos={catalogos}
        />
      )}

      {!usuarioId ? (
        <EmptyState mensaje="Selecciona un trabajador para ver su reporte" />
      ) : cargando || !reporte ? (
        <Card>Cargando…</Card>
      ) : (
        <>
          <Card className="mb-4">
            <p className="text-base font-semibold text-slate-900 dark:text-white">{reporte.trabajador.nombre}</p>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              {reporte.trabajador.cargo || 'Sin cargo'} · {reporte.trabajador.dependencia || 'Sin dependencia'}
            </p>
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{reporte.total}</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Respondidas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{reporte.correctas}</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Correctas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{reporte.incorrectas}</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Incorrectas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{reporte.porcentaje}%</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Acierto</p>
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: reporte.nivel?.color }}>{reporte.nivel?.nombre || '—'}</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Nivel</p>
              </div>
            </div>
          </Card>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Desempeño por componente</p>
              {reporte.porComponente.length === 0 ? (
                <EmptyState mensaje="Sin datos" />
              ) : (
                <div className="space-y-2">
                  {reporte.porComponente.map((c) => (
                    <div key={c.componenteSig} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">{c.componenteSig}</span>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{c.correctas}/{c.total} ({c.porcentaje}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Temas con más errores</p>
              {reporte.temasConMasErrores.length === 0 ? (
                <EmptyState mensaje="Sin errores registrados" />
              ) : (
                <div className="space-y-2">
                  {reporte.temasConMasErrores.map((t) => (
                    <div key={t.tema} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">{t.tema}</span>
                      <Badge valor="incorrecta" label={`${t.errores} error${t.errores === 1 ? '' : 'es'}`} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card>
            <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Historial de respuestas</p>
            {reporte.historial.length === 0 ? (
              <EmptyState mensaje="Sin respuestas en el rango filtrado" />
            ) : (
              <TablaWrap>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Componente</Th>
                    <Th>Tema</Th>
                    <Th>Resultado</Th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.historial.map((r) => (
                    <tr key={r._id}>
                      <Td className="whitespace-nowrap">{fmtFecha(r.fechaProgramada)}</Td>
                      <Td>{r.componenteSigSnapshot}</Td>
                      <Td>{r.temaSnapshot}</Td>
                      <Td>{r.esCorrecta ? <Badge valor="correcta" label="Correcta" /> : <Badge valor="incorrecta" label="Incorrecta" />}</Td>
                    </tr>
                  ))}
                </tbody>
              </TablaWrap>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
