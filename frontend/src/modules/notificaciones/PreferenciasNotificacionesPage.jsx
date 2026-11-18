import { toast } from 'sonner'
import { notificaciones as notificacionesApi } from '../../api/notificaciones.js'
import { usePushNotifications } from '../../pwa/usePushNotifications.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import AlertasTerminalNativas from './AlertasTerminalNativas.jsx'
import { SeccionLateral, Switch, ErrorMsg, EmptyState, Btn, fmtFechaHora } from '../../components/ui.jsx'

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
      <div>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          Preferencias de notificaciones
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Elige cómo quieres enterarte de lo que pasa en la plataforma.
        </p>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <SeccionLateral titulo="Canales" descripcion="Por dónde quieres recibir los avisos.">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Correo electrónico</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">Avisos no críticos por email. Los correos de seguridad de tu cuenta siempre se envían.</p>
          </div>
        <Switch
          checked={preferencias.email.activo}
          onChange={(v) => guardar({ email: { activo: v } }, (p) => ({ ...p, email: { activo: v } }))}
          label="Activar correo"
        />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notificaciones push</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">Avisos en el navegador o en la app instalada, en tus dispositivos activos.</p>
          </div>
        <Switch
          checked={preferencias.push.activo}
          onChange={(v) => guardar({ push: { activo: v } }, (p) => ({ ...p, push: { activo: v } }))}
          label="Activar push"
        />
        </div>
      </SeccionLateral>

      <SeccionLateral
        titulo="Este dispositivo"
        descripcion="Para recibir push en este navegador necesitas darle permiso. Se pide solo cuando lo actives aquí."
        acciones={push.soportado && push.permiso !== 'denied' && (
          <Btn
            variante={push.suscrito ? 'secundario' : 'primario'}
            disabled={push.cargando}
            onClick={() => (push.suscrito ? push.desactivar() : push.activar())}
          >
            {push.suscrito ? 'Desactivar en este dispositivo' : 'Activar notificaciones'}
          </Btn>
        )}
      >
        <p className="text-sm text-slate-900 dark:text-slate-100">
          Estado: <span className="font-semibold">{ETIQUETA_PERMISO[push.permiso] || push.permiso}</span>
        </p>
        {push.permiso === 'denied' && (
          <p role="alert" className="rounded-lg border border-warn-500/30 bg-warn-500/10 px-3 py-2 text-sm text-warn-700 dark:text-warn-300">
            Bloqueaste las notificaciones para este sitio. Para reactivarlas, abre la configuración del sitio desde el
            candado (o ⓘ) junto a la URL del navegador y cambia "Notificaciones" a "Permitir", o revisa Ajustes →
            Notificaciones del sistema operativo si el bloqueo viene de ahí.
          </p>
        )}
        {push.error && <ErrorMsg>{push.error}</ErrorMsg>}
      </SeccionLateral>

      <AlertasTerminalNativas />

      <SeccionLateral titulo="Tipos de eventos" descripcion="De qué categorías quieres enterarte.">
        {categorias.map((cat) => (
          <div key={cat.key} className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{cat.nombre}</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">{cat.descripcion}</p>
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
      </SeccionLateral>

      <SeccionLateral titulo="Dispositivos con push activo" descripcion="Navegadores y equipos donde recibes push.">
        {dispositivos && dispositivos.length === 0 && <EmptyState mensaje="No tienes dispositivos suscritos todavía" />}
        {dispositivos && dispositivos.map((d) => (
          <div key={d._id} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{d.navegador} en {d.dispositivo}</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">Último uso: {fmtFechaHora(d.ultimoUsoEn)}</p>
            </div>
            <Btn variante="secundario" onClick={() => olvidarDispositivo(d._id)} aria-label={`Olvidar ${d.navegador} en ${d.dispositivo}`}>
              Olvidar
            </Btn>
          </div>
        ))}
      </SeccionLateral>
    </div>
  )
}
