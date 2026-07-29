import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { mantenimientoApi } from '../../api/mantenimiento.js'
import { Card, ErrorMsg } from '../../components/ui.jsx'

export default function MantenimientoHome() {
  const [panel, setPanel] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    mantenimientoApi
      .panel()
      .then(setPanel)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-slate-900 dark:text-white">Mantenimiento</h1>

      <ErrorMsg>{error}</ErrorMsg>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Equipos" value={panel?.total_equipos} />
        <StatCard label="Pendientes" value={panel?.total_pendientes} />
        <StatCard label="Programados" value={panel?.total_programados} />
        <StatCard label="Finalizados" value={panel?.total_finalizados} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/mantenimiento/equipos" className="panel-btn-primario rounded-lg px-4 py-2 text-sm font-medium">
          Gestionar equipos →
        </Link>
        <Link to="/mantenimiento/mantenimientos" className="panel-btn-secundario rounded-lg px-4 py-2 text-sm font-medium">
          Gestionar mantenimientos →
        </Link>
      </div>

      {panel?.mantenimientos_proximos?.length > 0 && (
        <div className="mt-6">
          <h2 className="panel-mono mb-2 text-sm font-semibold uppercase tracking-wide text-cyan-700/80 dark:text-cyan-400/80">Próximos 7 días</h2>
          <ul className="space-y-2">
            {panel.mantenimientos_proximos.map((m) => (
              <li key={m._id} className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                {new Date(m.fecha).toLocaleDateString('es-CO')} — {m.equipo?.numero_inventario} {m.equipo?.marca?.nombre} {m.equipo?.modelo} · {m.tipo} ({m.tecnico})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <Card>
      <p className="panel-mono text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
        {value ?? '—'}
      </p>
    </Card>
  )
}
