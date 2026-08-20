import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { sig } from '../../api/sig.js'
import { catalogosApi } from '../../api/catalogos.js'
import { Card, ErrorMsg, Badge, TablaWrap, Th, Td, EmptyState, fmtFecha } from '../../components/ui.jsx'
import FiltrosDashboardSig from '../../components/sig/FiltrosDashboardSig.jsx'

const FILTROS_VACIOS = { desde: '', hasta: '', dependencia: '', cargo: '', componenteSig: '', tema: '' }

const ESTADO_LABEL = { pendiente: 'Pendiente', en_progreso: 'En progreso', completado: 'Completado', descartado: 'Descartado' }

// Identifica automáticamente a quién le hace falta refuerzo (nivel Bajo o
// Crítico) según los umbrales configurados — solo lectura por ahora; asignar
// acción/responsable/fecha de capacitación se construye sobre esta misma
// colección (PlanRefuerzoSig ya tiene esos campos listos, ver el modelo)
// cuando se decida esa siguiente vuelta del módulo.
export default function PlanRefuerzoPage() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [componentes, setComponentes] = useState([])
  const [catalogos, setCatalogos] = useState({ dependencias: [], cargos: [] })
  const [planes, setPlanes] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const [p, config, cat] = await Promise.all([
        sig.planRefuerzo(filtros),
        sig.configuracion.obtener(),
        catalogosApi.obtener(),
      ])
      setPlanes(p.planes)
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

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <ShieldAlert className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">Plan de refuerzo</h1>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <FiltrosDashboardSig
        filtros={filtros}
        onChange={setFiltros}
        onAplicar={cargar}
        componentes={componentes}
        catalogos={catalogos}
        mostrarResultado={false}
      />

      {cargando || !planes ? (
        <Card>Cargando…</Card>
      ) : planes.length === 0 ? (
        <EmptyState mensaje="Nadie está en nivel Bajo o Crítico en el rango filtrado" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Trabajador</Th>
              <Th>Área</Th>
              <Th>Componente</Th>
              <Th>Tema con dificultad</Th>
              <Th>Nivel</Th>
              <Th>Acierto</Th>
              <Th>Detectado</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {planes.map((p) => (
              <tr key={p._id}>
                <Td>{p.usuario?.nombre || '(usuario eliminado)'}</Td>
                <Td>{p.usuario?.dependencia || '—'}</Td>
                <Td>{p.componenteSig}</Td>
                <Td>{p.tema || '—'}</Td>
                <Td><Badge valor={p.nivelDetectado} label={p.nivelDetectado} /></Td>
                <Td>{p.porcentajeAcierto}%</Td>
                <Td className="whitespace-nowrap">{fmtFecha(p.fechaDeteccion)}</Td>
                <Td><Badge valor={p.estado} label={ESTADO_LABEL[p.estado]} /></Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}
    </div>
  )
}
