import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { auth } from '../api/auth.js'
import { ocultarSplashScreen } from '../utils/splash.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(() => auth.getUsuarioLocal())
  const [cargando, setCargando] = useState(true)
  // Evita que la verificación inicial de /auth/me (que puede seguir en vuelo
  // sin token, y por lo tanto resolver en 401) pise el usuario que un login
  // manual ya estableció mientras tanto.
  const loginManualRef = useRef(false)

  useEffect(() => {
    let activo = true

    auth
      .me()
      .then((u) => {
        if (activo && !loginManualRef.current) setUsuario(u)
      })
      .catch(() => {
        if (activo && !loginManualRef.current) setUsuario(null)
      })
      .finally(() => {
        if (activo) {
          setCargando(false)
          ocultarSplashScreen()
        }
      })

    return () => {
      activo = false
    }
  }, [])

  useEffect(() => {
    function onLogout() {
      setUsuario(null)
    }
    window.addEventListener('skynet:logout', onLogout)
    return () => window.removeEventListener('skynet:logout', onLogout)
  }, [])

  // Heartbeat: re-consulta /auth/me cada 2 min mientras hay sesión, para que
  // un cambio de rol/permisos hecho por un admin (que incrementa tokenVersion
  // en BD) se detecte pronto en vez de esperar a que el usuario dispare por
  // su cuenta la próxima petición que reciba el 401. También revisa al volver
  // a la pestaña, que es cuando más se nota un permiso desactualizado.
  useEffect(() => {
    if (!usuario) return

    let cancelado = false
    async function chequear() {
      try {
        const u = await auth.me()
        if (!cancelado) setUsuario(u)
      } catch {
        // request() ya dispara skynet:logout en 401; nada más que hacer acá.
      }
    }

    const intervalo = setInterval(chequear, 2 * 60 * 1000)
    function onVisibilidad() {
      if (document.visibilityState === 'visible') chequear()
    }
    document.addEventListener('visibilitychange', onVisibilidad)

    return () => {
      cancelado = true
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', onVisibilidad)
    }
  }, [usuario?.id_usuario])

  const login = useCallback(async (email, password) => {
    const u = await auth.login(email, password)
    loginManualRef.current = true
    setUsuario(u)
    return u
  }, [])

  // Espera de verdad a que el backend borre la cookie httpOnly antes de dar la
  // sesión por cerrada. Antes se llamaba a auth.logout() sin await y sin catch,
  // y se hacía setUsuario(null) de inmediato: si esa petición fallaba (red
  // caída, backend reiniciándose, la pestaña se cierra antes de que salga), la
  // UI iba al login como si todo hubiera salido bien pero la cookie seguía
  // siendo válida hasta 8h — y al volver a abrir la app, /auth/me la aceptaba y
  // RESTAURABA la sesión sola. En equipos compartidos por turnos eso significa
  // que la siguiente persona queda operando con la identidad de la anterior.
  //
  // El frontend no puede borrar esa cookie por su cuenta (es httpOnly por
  // diseño, para que un XSS tampoco pueda), así que si el servidor no responde
  // NO hay forma local de cerrar la sesión: lo correcto es decirlo, no fingir
  // que se cerró. Devuelve el error para que quien llame lo muestre.
  const logout = useCallback(async () => {
    try {
      await auth.logout()
      setUsuario(null)
      return null
    } catch (err) {
      return err.message || 'No se pudo cerrar la sesión. Revisa tu conexión e inténtalo de nuevo.'
    }
  }, [])

  // Autoservicio de cambio de contraseña (incluido el cambio obligatorio tras
  // un primer login con contraseña de seed/asignada por un admin, ver
  // ProtectedRoute). El backend reemite la cookie de sesión, así que el
  // usuario sigue logueado sin tener que volver a autenticarse.
  const cambiarPassword = useCallback(async (passwordActual, passwordNueva) => {
    const u = await auth.cambiarPassword(passwordActual, passwordNueva)
    setUsuario(u)
    return u
  }, [])

  // Re-consulta /auth/me y actualiza el usuario en memoria. Lo usa la pantalla
  // "Módulos del sistema" tras activar/desactivar un módulo, para que el
  // sidebar del propio Super Admin refleje el cambio sin recargar la página.
  const refrescarUsuario = useCallback(async () => {
    try {
      const u = await auth.me()
      setUsuario(u)
      return u
    } catch {
      return null
    }
  }, [])

  // Legado: gobierna solo mantenimiento (Usuario.modulos, esquema
  // binario que no se toca en esta fase). esSuperAdmin reemplaza al viejo
  // check `rol === 'admin'` — ver models/Rol.js / middleware/auth.js.
  const tieneModulo = useCallback(
    (modulo) => usuario?.esSuperAdmin || usuario?.modulos?.includes(modulo),
    [usuario]
  )

  // RBAC granular nuevo: `codigo` con forma "modulo:accion" (p. ej.
  // "roles:gestionar"), tal como los expone /api/auth/me en usuario.permisos.
  const tienePermiso = useCallback(
    (codigo) => usuario?.esSuperAdmin || usuario?.permisos?.includes(codigo),
    [usuario]
  )

  // Estado de activación de módulos del sistema (ModuloSistema, lo administra
  // el Super Admin en /sistema/modulos). Un módulo apagado desaparece para
  // TODOS los roles — incluido el Super Admin — a diferencia de tienePermiso/
  // tieneModulo, que dependen del rol. El backend expone las keys apagadas en
  // /auth/me (usuario.modulosDesactivados) y además bloquea sus APIs.
  const moduloActivo = useCallback(
    (key) => !usuario?.modulosDesactivados?.includes(key),
    [usuario]
  )

  return (
    <AuthContext.Provider
      value={{ usuario, cargando, login, logout, cambiarPassword, refrescarUsuario, tieneModulo, tienePermiso, moduloActivo }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

// Único criterio de "es admin" para decidir shell (AppShell.jsx) y home
// feed (DashboardPage.jsx): Super Admin y Administrador conservan el panel
// denso de escritorio; los otros roles ven el shell móvil tipo app social.
export function esRolAdmin(usuario) {
  return Boolean(usuario?.esSuperAdmin || usuario?.rol?.slug === 'administrador')
}

// Bodega gestiona requerimientos aprobados (estado, control de recibido,
// impresión) desde una bandeja tabular — la misma tarea que hace
// Administrativo y Financiero en el panel denso. Por eso, aunque no sean
// "admin", usan el mismo shell de escritorio que Admin en vez del feed móvil
// tipo app social (ver AppShell.jsx y DashboardPage.jsx).
// 'administrativo_financiero' (Dir. Administrativo y Gestión) se agregó
// 2026-08-05 a pedido explícito del usuario: quien tenga ese rol trabaja
// desde computador, con las mismas bandejas y tablas densas que Admin.
// 'sig_hseq' (SIG/HSEQ) se agregó por el mismo motivo: administrar el banco
// de preguntas, programar campañas con recurrencia y leer el dashboard de
// desempeño es trabajo de escritorio, no el feed móvil tipo app social.
export function usaPanelDenso(usuario) {
  return esRolAdmin(usuario) || ['bodega', 'administrativo_financiero', 'sig_hseq', 'comunicador'].includes(usuario?.rol?.slug)
}
