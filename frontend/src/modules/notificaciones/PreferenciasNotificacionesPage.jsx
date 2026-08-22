import { toast } from 'sonner'
import { BellRing, Smartphone, Trash2, TriangleAlert } from 'lucide-react'
import { notificaciones as notificacionesApi } from '../../api/notificaciones.js'
import { usePushNotifications } from '../../pwa/usePushNotifications.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Card, Switch, ErrorMsg, EmptyState, Btn, fmtFechaHora } from '../../components/ui.jsx'

const ETIQUETA_PERMISO = {
  granted: 'Concedido',
  denied: 'Bloqueado por el navegador',
  default: 'Aún no solicitado',
  'no-soportado': 'Este navegador no soporta notificaciones push',
}

export default function PreferenciasNotificacionesPage() {
  const { data, error, actualizarLocal } = useDatosConCache(
    'notificaciones:preferencias',
    () => Promise.all([notificacionesApi.preferencias(), notificacionesApi.categorias(), notificacionesApi.misDispositivos()])
      .then(([prefs, cats, disp]) => ({ preferencias: prefs, categorias: cats.categorias, dispositivos: disp.dispositivos })),
    { ttlMs: 60_000 },
  )
  const preferencias = data?.preferencias || null
  const categorias = data?.categorias || []
  const dispositivos = data?.dispositivos || null

  const push = usePushNotifications()

  async function guardar(cambios, aplicarLocal) {
    actualizarLocal((d) => ({ ...d, preferencias: aplicarLocal(d.preferencias) }))
    try {
      await notificacionesApi.actualizarPreferencias(cambios)
    } catch (err) {
      // El optimista ya se aplicó — si el backend rechaza el cambio, se
      // vuelve a pedir el estado real en vez de dejar la UI desincronizada.
      toast.error(err.message)
      notificacionesApi.preferencias()
        .then((prefs) => actualizarLocal((d) => ({ ...d, preferencias: prefs })))
        .catch(() => {})
    }
  }

  async function olvidarDispositivo(id) {
    try {
      await notificacionesApi.olvidarDispositivo(id)
      actualizarLocal((d) => ({ ...d, dispositivos: d.dispositivos.filter((x) => x._id !== id) }))
    } catch (err) {
      toast.error(err.message)
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
      <div>
        <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          Preferencias de notificaciones
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Elige cómo quieres enterarte de lo que pasa en Skynet.
        </p>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Canales</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Correo electrónico</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Avisos no críticos por email. Los correos de seguridad de tu cuenta siempre se envían.</p>
            </div>
            <Switch
              checked={preferencias.email.activo}
              onChange={(v) => guardar({ email: { activo: v } }, (p) => ({ ...p, email: { activo: v } }))}
              label="Activar correo"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Notificaciones push</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Avisos en el navegador o en la app instalada, en tus dispositivos activos.</p>
            </div>
            <Switch
              checked={preferencias.push.activo}
              onChange={(v) => guardar({ push: { activo: v } }, (p) => ({ ...p, push: { activo: v } }))}
              label="Activar push"
            />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <BellRing className="h-4 w-4 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
          Este dispositivo
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Para recibir push en este navegador concreto, necesitas darle permiso. Se te pedirá solo cuando lo actives aquí, nunca automáticamente.
        </p>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Estado: <span className="font-medium">{ETIQUETA_PERMISO[push.permiso] || push.permiso}</span>
          </p>
          {push.soportado && push.permiso !== 'denied' && (
            <Btn
              variante={push.suscrito ? 'secundario' : 'primario'}
              disabled={push.cargando}
              onClick={() => (push.suscrito ? push.desactivar() : push.activar())}
            >
              {push.suscrito ? 'Desactivar en este dispositivo' : 'Activar notificaciones'}
            </Btn>
          )}
        </div>

        {push.permiso === 'denied' && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              Bloqueaste las notificaciones para este sitio. Para reactivarlas, abre la configuración del sitio desde el
              candado (o ⓘ) junto a la URL del navegador y cambia "Notificaciones" a "Permitir", o revisa Ajustes →
              Notificaciones del sistema operativo si el bloqueo viene de ahí.
            </p>
          </div>
        )}
        {push.error && <ErrorMsg>{push.error}</ErrorMsg>}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Tipos de eventos</h2>
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
                label={`Activar categoría ${cat.nombre}`}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Smartphone className="h-4 w-4 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
          Dispositivos con push activo
        </h2>
        {dispositivos && dispositivos.length === 0 && <EmptyState mensaje="No tienes dispositivos suscritos todavía" />}
        {dispositivos && dispositivos.length > 0 && (
          <ul className="space-y-2">
            {dispositivos.map((d) => (
              <li key={d._id} className="flex items-center justify-between gap-3 rounded-lg border border-cyan-600/15 px-3 py-2 dark:border-cyan-400/10">
                <div>
                  <p className="text-sm text-slate-800 dark:text-slate-100">{d.navegador} en {d.dispositivo}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Último uso: {fmtFechaHora(d.ultimoUsoEn)}</p>
                </div>
                <button
                  onClick={() => olvidarDispositivo(d._id)}
                  aria-label="Olvidar este dispositivo"
                  title="Olvidar este dispositivo"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
