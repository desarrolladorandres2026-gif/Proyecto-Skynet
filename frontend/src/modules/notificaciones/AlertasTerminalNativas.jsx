import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { SeccionLateral, Btn } from '../../components/ui.jsx'
import {
  EVENTO_ALERTAS_CAMBIO,
  abrirAjusteNativo,
  activarAlertasNativas,
  desactivarAlertasNativas,
  esAppNativa,
  estadoAlertasNativas,
  probarAlertaNativa,
} from '../../pwa/skynetNotif.js'

// Pantalla de permisos de las "Alertas del Terminal" en la app Android. Cada
// fila es una condición real que, si falla, hace que el aviso NO suene con el
// teléfono bloqueado — por eso se muestra el estado de cada una y un botón que
// lleva a la pantalla exacta del sistema, en vez de un texto genérico de
// "revisa tus ajustes". Solo existe dentro de la app Android; en el navegador
// no se renderiza.
export default function AlertasTerminalNativas() {
  const [estado, setEstado] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const refrescar = useCallback(() => {
    estadoAlertasNativas()
      .then(setEstado)
      .catch(() => setEstado(null))
  }, [])

  useEffect(() => {
    if (!esAppNativa()) return
    refrescar()
    // Al volver de una pantalla de ajustes del sistema la app recupera el
    // foco: se vuelve a leer para que la fila pase a "listo" sin recargar.
    document.addEventListener('visibilitychange', refrescar)
    window.addEventListener('focus', refrescar)
    window.addEventListener(EVENTO_ALERTAS_CAMBIO, refrescar)
    return () => {
      document.removeEventListener('visibilitychange', refrescar)
      window.removeEventListener('focus', refrescar)
      window.removeEventListener(EVENTO_ALERTAS_CAMBIO, refrescar)
    }
  }, [refrescar])

  if (!esAppNativa() || !estado) return null

  const notificacionesOk = estado.permiso === 'granted'
  const filas = [
    {
      clave: 'servicio',
      titulo: 'Alertas activas en este teléfono',
      detalle: 'El servicio que escucha los avisos del Terminal aunque la app esté cerrada.',
      ok: estado.activo,
      obligatorio: true,
      accion: estado.activo ? null : { etiqueta: 'Activar', ejecutar: () => activarAlertasNativas() },
    },
    {
      clave: 'notificaciones',
      titulo: 'Notificaciones permitidas',
      detalle: 'Sin este permiso Android no deja mostrar ni encender la pantalla.',
      ok: notificacionesOk,
      obligatorio: true,
      accion: notificacionesOk ? null : { etiqueta: 'Permitir', ejecutar: () => abrirAjusteNativo('notificaciones') },
    },
    {
      clave: 'bateria',
      titulo: 'Sin restricciones de batería',
      detalle: 'Evita que el teléfono "duerma" la app y corte la conexión con el servidor.',
      ok: estado.sinOptimizacion,
      obligatorio: true,
      accion: estado.sinOptimizacion ? null : { etiqueta: 'Quitar límite', ejecutar: () => abrirAjusteNativo('bateria') },
    },
    {
      clave: 'pantallaCompleta',
      titulo: 'Encender la pantalla con el aviso',
      detalle: 'Permite que la alerta despierte el teléfono bloqueado (Android 14 o superior).',
      ok: estado.pantallaCompleta,
      obligatorio: true,
      accion: estado.pantallaCompleta ? null : { etiqueta: 'Permitir', ejecutar: () => abrirAjusteNativo('pantallaCompleta') },
    },
    {
      clave: 'noMolestar',
      titulo: 'Sonar aun en "No molestar"',
      detalle: 'Opcional. La voz ya usa el canal de alarmas; esto además deja pasar la notificación.',
      ok: estado.noMolestar,
      obligatorio: false,
      accion: estado.noMolestar ? null : { etiqueta: 'Permitir', ejecutar: () => abrirAjusteNativo('noMolestar') },
    },
  ]
  const faltan = filas.filter((f) => f.obligatorio && !f.ok).length

  async function ejecutar(accion) {
    setOcupado(true)
    try {
      const r = await accion()
      if (r?.permiso && r.permiso !== 'granted') toast.error('Android no concedió el permiso de notificaciones.')
    } catch (err) {
      toast.error(err.message || 'No se pudo completar la acción')
    } finally {
      setOcupado(false)
      refrescar()
    }
  }

  async function probar() {
    try {
      await probarAlertaNativa()
      toast.success('Alerta de prueba enviada: debería sonar ahora.')
    } catch (err) {
      toast.error(err.message || 'No se pudo lanzar la prueba')
    }
  }

  return (
    <SeccionLateral
      titulo="Alertas del Terminal"
      descripcion="Para que los avisos suenen como una alerta de emergencia, aunque el teléfono esté bloqueado o en silencio."
      acciones={
        <>
          <Btn variante="secundario" disabled={ocupado || !estado.activo} onClick={probar}>
            Probar alerta
          </Btn>
          {estado.activo && (
            <Btn variante="secundario" disabled={ocupado} onClick={() => ejecutar(desactivarAlertasNativas)}>
              Desactivar
            </Btn>
          )}
        </>
      }
    >
      <p
        role="status"
        className={
          faltan === 0
            ? 'rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300'
            : 'rounded-lg border border-warn-500/30 bg-warn-500/10 px-3 py-2 text-sm text-warn-700 dark:text-warn-300'
        }
      >
        {faltan === 0
          ? 'Todo listo: tu teléfono recibirá los avisos del Terminal con sonido.'
          : `Falta${faltan === 1 ? '' : 'n'} ${faltan} ajuste${faltan === 1 ? '' : 's'} para que el aviso suene con el teléfono bloqueado.`}
      </p>

      {filas.map((f) => (
        <div key={f.clave} className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {f.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Listo" />
            ) : (
              <CircleAlert
                className={`mt-0.5 h-4 w-4 shrink-0 ${f.obligatorio ? 'text-warn-600 dark:text-warn-400' : 'text-slate-400'}`}
                aria-label={f.obligatorio ? 'Pendiente' : 'Opcional'}
              />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{f.titulo}</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{f.detalle}</p>
            </div>
          </div>
          {f.accion && (
            <Btn variante="secundario" disabled={ocupado} onClick={() => ejecutar(f.accion.ejecutar)}>
              {f.accion.etiqueta}
            </Btn>
          )}
        </div>
      ))}
    </SeccionLateral>
  )
}
