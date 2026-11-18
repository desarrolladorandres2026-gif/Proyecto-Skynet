import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { activarAlertasNativas, alertasDesactivadasPorUsuario, esAppNativa } from './skynetNotif.js'

// Mantiene vivo el servicio de alertas de la app Android: en CADA apertura con
// sesión iniciada vuelve a arrancarlo y a registrar el dispositivo. Cubre los
// tres casos en que el servicio puede haber muerto sin que la persona lo note:
// el sistema lo cerró por batería, el arranque tras reinicio fue negado en
// segundo plano (ver BootReceiver), o alguien "olvidó" el dispositivo desde
// Preferencias. Si la persona lo apagó a propósito (Preferencias → Alertas del
// Terminal), se respeta y no se vuelve a activar solo.
//
// No renderiza nada. Vive en AppShell (dentro de la sesión): el registro del
// dispositivo exige estar autenticado.
export default function AlertasNativasAutoArranque() {
  const { usuario } = useAuth()
  const usuarioId = usuario?.id_usuario

  useEffect(() => {
    if (!esAppNativa() || !usuarioId || alertasDesactivadasPorUsuario()) return
    activarAlertasNativas().catch(() => {
      // Sin red o permiso pendiente: la pantalla de Preferencias muestra el
      // estado real y permite reintentar; no se molesta aquí.
    })
  }, [usuarioId])

  return null
}
