import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sigittnApi } from '../../api/sigittn.js'
import { Card, ErrorMsg } from '../../components/ui.jsx'

export default function SigittnHome() {
  const [contadores, setContadores] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    sigittnApi.tickets
      .contadores()
      .then(setContadores)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-slate-900 dark:text-white">SIGITTN</h1>

      <ErrorMsg>{error}</ErrorMsg>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Tickets creados" value={contadores?.creados} />
        <StatCard label="Tickets asignados" value={contadores?.asignados} />
      </div>

      <div className="mt-6">
        <Link to="/sigittn/tickets" className="panel-btn-primario rounded-lg px-4 py-2 text-sm font-medium">
          Ver tickets →
        </Link>
      </div>
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
