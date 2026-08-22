import { useState } from 'react'
import { toast } from 'sonner'
import { SlidersHorizontal } from 'lucide-react'
import { ia as iaApi } from '../../api/ia.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Card, Switch, ErrorMsg, OkMsg } from '../../components/ui.jsx'

export default function ConfiguracionIAPage() {
  const { data, error, actualizarLocal } = useDatosConCache(
    'ia:configuracionGlobal',
    () => Promise.all([iaApi.configuracionGlobal(), iaApi.categorias()])
      .then(([config, cats]) => ({ configuracion: config, categorias: cats.categorias })),
    { ttlMs: 60_000 },
  )
  const configuracion = data?.configuracion || null
  const categorias = data?.categorias || []
  const [ok, setOk] = useState('')

  async function guardar(categoria, valor) {
    actualizarLocal((d) => ({ ...d, configuracion: { ...d.configuracion, categorias: { ...d.configuracion.categorias, [categoria]: valor } } }))
    setOk('')
    try {
      await iaApi.actualizarConfiguracionGlobal({ categorias: { [categoria]: valor } })
      setOk('Configuración global actualizada.')
    } catch (err) {
      toast.error(err.message)
      iaApi.configuracionGlobal()
        .then((config) => actualizarLocal((d) => ({ ...d, configuracion: config })))
        .catch(() => {})
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
