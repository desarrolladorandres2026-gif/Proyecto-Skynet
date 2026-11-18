import { Capacitor, registerPlugin } from '@capacitor/core'
import { notificaciones } from '../api/notificaciones.js'

// Puente al plugin nativo propio de la app Android (NotifPlugin.java): el
// servicio en primer plano que mantiene la conexión SSE con el backend y hace
// sonar los Avisos del Terminal como alerta de emergencia. Se registra en un
// único lugar: Capacitor avisa si el mismo plugin se registra dos veces.
//
// Sin Firebase: ni @capacitor/push-notifications ni google-services.json.
export const SkynetNotif = registerPlugin('SkynetNotif')

export const esAppNativa = () => Capacitor.isNativePlatform()

export const EVENTO_ALERTAS_CAMBIO = 'skynet-alertas-cambio'
const CLAVE_DESACTIVADO = 'skynet_alertas_desactivadas'

function avisarCambio() {
  window.dispatchEvent(new Event(EVENTO_ALERTAS_CAMBIO))
}

// localStorage puede lanzar (modo privado, datos bloqueados): nunca debe
// tumbar la activación de las alertas.
function leerDesactivadoPorUsuario() {
  try {
    return localStorage.getItem(CLAVE_DESACTIVADO) === '1'
  } catch {
    return false
  }
}
function guardarDesactivadoPorUsuario(valor) {
  try {
    if (valor) localStorage.setItem(CLAVE_DESACTIVADO, '1')
    else localStorage.removeItem(CLAVE_DESACTIVADO)
  } catch {
    // sin almacenamiento: la preferencia vale solo para esta sesión de la app
  }
}

export const alertasDesactivadasPorUsuario = leerDesactivadoPorUsuario

export async function estadoAlertasNativas() {
  if (!esAppNativa()) return null
  return SkynetNotif.estado()
}

// Arranca el servicio nativo (pide el permiso de notificaciones si falta) y
// registra el dispositivo en el backend. El registro es un upsert por
// dispositivoId: repetirlo en cada apertura de la app es seguro y además
// repone la suscripción si alguien la "olvidó" desde Preferencias.
export async function activarAlertasNativas() {
  if (!esAppNativa()) return { permiso: 'no-soportado' }
  const r = await SkynetNotif.iniciar()
  if (r.permiso !== 'granted' || !r.dispositivoId) return { permiso: r.permiso || 'denied' }
  await notificaciones.suscribirNativo(r.dispositivoId, r.modelo)
  guardarDesactivadoPorUsuario(false)
  avisarCambio()
  return { permiso: 'granted', dispositivoId: r.dispositivoId }
}

export async function desactivarAlertasNativas() {
  if (!esAppNativa()) return
  const e = await SkynetNotif.estado()
  await SkynetNotif.detener()
  if (e?.dispositivoId) await notificaciones.desuscribirPush(`nativo:${e.dispositivoId}`).catch(() => {})
  guardarDesactivadoPorUsuario(true)
  avisarCambio()
}

export async function probarAlertaNativa() {
  await SkynetNotif.probarAlerta()
}

export async function abrirAjusteNativo(tipo) {
  await SkynetNotif.abrirAjuste({ tipo })
}
