import { toast } from 'sonner'
import { Bot, Volume2 } from 'lucide-react'
import { ia as iaApi } from '../../api/ia.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Card, Switch, ErrorMsg } from '../../components/ui.jsx'

export default function PreferenciasIAPage() {
  const { data, error, actualizarLocal } = useDatosConCache(
    'ia:preferencias',
    () => Promise.all([iaApi.preferencias(), iaApi.categorias()])
      .then(([prefs, cats]) => ({ preferencias: prefs, categorias: cats.categorias })),
    { ttlMs: 60_000 },
  )
  const preferencias = data?.preferencias || null
  const categorias = data?.categorias || []

  async function guardar(cambios, aplicarLocal) {
    actualizarLocal((d) => ({ ...d, preferencias: aplicarLocal(d.preferencias) }))
    try {
      await iaApi.actualizarPreferencias(cambios)
    } catch (err) {
      toast.error(err.message)
      iaApi.preferencias()
        .then((prefs) => actualizarLocal((d) => ({ ...d, preferencias: prefs })))
        .catch(() => {})
    }
  }

  if (!preferencias) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <div>
          <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
            Mis avisos de IA
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Elige de qué te avisa Skynet en el chat, y si quieres que además te lo lea en voz alta. Lo que el
            administrador desactive a nivel global no aparece aquí como opción, aunque lo actives.
          </p>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Volume2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
          Voz
        </h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Leer los avisos en voz alta</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Si lo apagas, los avisos siguen llegando al chat como burbuja, pero Skynet no los lee en voz.
            </p>
          </div>
          <Switch
            checked={preferencias.voz.activo}
            onChange={(v) => guardar({ voz: { activo: v } }, (p) => ({ ...p, voz: { activo: v } }))}
            label="Activar voz para avisos de IA"
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Qué te avisa Skynet</h2>
        <div className="space-y-3">
          {categorias.map((cat) => (
            <div key={cat.key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{cat.nombre}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{cat.descripcion}</p>
              </div>
              <Switch
                checked={preferencias.categorias[cat.key] !== false}
                onChange={(v) =>
                  guardar({ categorias: { [cat.key]: v } }, (p) => ({
                    ...p,
                    categorias: { ...p.categorias, [cat.key]: v },
                  }))
                }
                label={`Avisarme de ${cat.nombre}`}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
