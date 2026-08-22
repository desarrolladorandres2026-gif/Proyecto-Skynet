import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { usePlataforma } from './PlataformaContext.jsx'
import PantallaMantenimiento from './PantallaMantenimiento.jsx'

// ¿Esta persona puede seguir usando Skynet durante un mantenimiento?
// Espeja exactamente la política del backend
// (middleware/mantenimientoPlataforma.js: Super Admin o
// permiso 'plataforma:gestionar'). Si las dos divergieran, el síntoma sería un
// administrador viendo la app pero recibiendo 503 en cada acción — por eso
// vive en un solo sitio con el nombre explícito.
//
// Esto es SOLO experiencia de usuario. Quien modifique este archivo desde las
// herramientas del navegador no gana absolutamente nada: el backend responde
// 503 a cada petición igual, y sin datos la app no muestra ni hace nada.
function puedeTrabajarEnMantenimiento(usuario) {
  return Boolean(usuario?.esSuperAdmin || usuario?.permisos?.includes('plataforma:gestionar'))
}

// Cuánto se muestra el panel de "ya está disponible" antes de devolver a la
// persona a la app por su cuenta. Suficiente para leerlo sin que quede
// atrapada si se levantó del puesto mientras tanto.
const MS_PANEL_DISPONIBLE = 12_000

export default function GateMantenimiento({ children }) {
  const { usuario, cargando: cargandoSesion, refrescarUsuario } = useAuth()
  const { enMantenimiento, cargando } = usePlataforma()
  const [mostrandoRecuperacion, setMostrandoRecuperacion] = useState(false)
  const estabaBloqueadoRef = useRef(false)

  const bloqueado = enMantenimiento && !puedeTrabajarEnMantenimiento(usuario)

  // Detecta el flanco bloqueado -> libre para mostrar el panel de vuelta a la
  // normalidad. Es una transición, no un estado: alguien que abre Skynet
  // cuando el mantenimiento ya terminó no tiene por qué ver este panel.
  useEffect(() => {
    if (bloqueado) {
      estabaBloqueadoRef.current = true
      setMostrandoRecuperacion(false)
      return
    }
    if (estabaBloqueadoRef.current) {
      estabaBloqueadoRef.current = false
      setMostrandoRecuperacion(true)
      // Se revalida la sesión al volver: durante la ventana pudo cambiar algo
      // (o el token pudo expirar por antigüedad), y es preferible enterarse
      // aquí que con un 401 en la primera acción que intente la persona.
      refrescarUsuario?.()
    }
  }, [bloqueado, refrescarUsuario])

  useEffect(() => {
    if (!mostrandoRecuperacion) return
    const t = setTimeout(() => setMostrandoRecuperacion(false), MS_PANEL_DISPONIBLE)
    return () => clearTimeout(t)
  }, [mostrandoRecuperacion])

  // Mientras no se sabe el estado real no se pinta la pantalla de
  // mantenimiento: hacerlo produciría un parpadeo naranja en cada carga de
  // página. La app se muestra normal y, si resulta que hay mantenimiento, el
  // gate aparece un instante después (o antes, si alguna petición devuelve
  // 503, que llega primero que el sondeo).
  if (cargando && cargandoSesion) return children

  if (bloqueado) return <PantallaMantenimiento modo="mantenimiento" />

  if (mostrandoRecuperacion) {
    return <PantallaMantenimiento modo="disponible" onContinuar={() => setMostrandoRecuperacion(false)} />
  }

  return children
}
