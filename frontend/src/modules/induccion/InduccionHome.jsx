import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PartyPopper } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Card } from '../../components/ui.jsx'
import { MODULOS, LOGO_TERMINAL } from './induccionData.js'
import { getCompletados, getPuntaje } from './induccionProgress.js'
import ModuloAcordeon from './ModuloAcordeon.jsx'

export default function InduccionHome() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [completados, setCompletados] = useState([])
  const [puntajes, setPuntajes] = useState({})
  const [expandidoId, setExpandidoId] = useState(null)
  const [listo, setListo] = useState(false)

  function refrescar() {
    const c = getCompletados(usuario?.id_usuario)
    setCompletados(c)
    const p = {}
    for (const m of MODULOS) p[m.id] = getPuntaje(usuario?.id_usuario, m.id)
    setPuntajes(p)
    return c
  }

  useEffect(() => {
    const c = refrescar()
    const primerPendiente = MODULOS.find((m) => !c.includes(m.id))
    setExpandidoId(primerPendiente?.id ?? null)
    setListo(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id_usuario])

  const total = MODULOS.length
  const hechos = completados.length
  const porcentaje = Math.round((hechos / total) * 100)
  const todoCompletado = hechos === total

  function toggle(id) {
    setExpandidoId((actual) => (actual === id ? null : id))
  }

  function alCompletarQuiz() {
    refrescar()
  }

  function alSiguiente(moduloId) {
    const idx = MODULOS.findIndex((m) => m.id === moduloId)
    const siguiente = MODULOS[idx + 1]
    if (siguiente) {
      setExpandidoId(siguiente.id)
    } else {
      navigate('/induccion/certificado')
    }
  }

  if (!listo) return null

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <img src={LOGO_TERMINAL} alt="Terminal de Transportes de Neiva" className="h-14 w-14 rounded-lg bg-white/90 object-contain p-1.5" />
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Inducción institucional</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Terminal de Transportes de Neiva — recorre los módulos y obtén tu certificado.</p>
        </div>
      </div>

      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <p className="panel-mono text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Progreso general</p>
          <p className="panel-mono text-xs text-cyan-700 dark:text-cyan-300">{hechos} de {total} completados</p>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-900/10 dark:bg-white/5">
          <div
            className="h-full rounded-full bg-cyan-400 transition-all duration-300"
            style={{ width: `${porcentaje}%` }}
          />
        </div>

        {todoCompletado && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2">
            <p className="flex items-center gap-1.5 text-sm text-emerald-800 dark:text-emerald-200">
              <PartyPopper className="h-4 w-4 shrink-0" aria-hidden="true" />
              Completaste todos los módulos. Ya puedes generar tu certificado.
            </p>
            <button
              type="button"
              onClick={() => navigate('/induccion/certificado')}
              className="panel-btn-primario shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium"
            >
              Ir al certificado →
            </button>
          </div>
        )}
      </Card>

      <Card className="!p-0 overflow-hidden">
        {MODULOS.map((m, i) => (
          <ModuloAcordeon
            key={m.id}
            modulo={m}
            expandido={expandidoId === m.id}
            completado={completados.includes(m.id)}
            puntajeGuardado={puntajes[m.id]}
            esUltimo={i === MODULOS.length - 1}
            onToggle={() => toggle(m.id)}
            onCompletado={alCompletarQuiz}
            onSiguiente={alSiguiente}
          />
        ))}
      </Card>
    </div>
  )
}
