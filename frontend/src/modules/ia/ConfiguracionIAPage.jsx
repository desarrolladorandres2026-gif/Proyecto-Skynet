import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { ia as iaApi } from '../../api/ia.js'
import { Card, Switch, ErrorMsg, OkMsg } from '../../components/ui.jsx'

export default function ConfiguracionIAPage() {
  const [configuracion, setConfiguracion] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    Promise.all([iaApi.configuracionGlobal(), iaApi.categorias()])
      .then(([config, cats]) => {
        setConfiguracion(config)
        setCategorias(cats.categorias)
      })
      .catch((err) => setError(err.message))
  }, [])

  async function guardar(categoria, valor) {
    setConfiguracion((c) => ({ ...c, categorias: { ...c.categorias, [categoria]: valor } }))
    setOk('')
    setError('')
    try {
      await iaApi.actualizarConfiguracionGlobal({ categorias: { [categoria]: valor } })
      setOk('Configuración global actualizada.')
    } catch (err) {
      setError(err.message)
      iaApi.configuracionGlobal().then(setConfiguracion).catch(() => {})
    }
  }

  if (!configuracion) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <SlidersHorizontal className="h-6 w-6 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <div>
          <h1 className="panel-mono text-xl font-semibold tracking-wide text-slate-900 dark:text-white">
            Configuración de IA
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Interruptor maestro por categoría, para toda la plataforma. Lo que apagues aquí queda apagado para
            todos los usuarios, sin importar su preferencia personal en "Mis avisos de IA".
          </p>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Categorías avisables por IA</h2>
        <div className="space-y-3">
          {categorias.map((cat) => (
            <div key={cat.key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{cat.nombre}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{cat.descripcion}</p>
              </div>
              <Switch
                checked={configuracion.categorias[cat.key] !== false}
                onChange={(v) => guardar(cat.key, v)}
                label={`Permitir avisos de ${cat.nombre}`}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
