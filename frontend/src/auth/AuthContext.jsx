import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { auth } from '../api/auth.js'

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
        if (activo) setCargando(false)
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

  const login = useCallback(async (email, password) => {
    const u = await auth.login(email, password)
    loginManualRef.current = true
    setUsuario(u)
    return u
  }, [])

  const logout = useCallback(() => {
    auth.logout()
    setUsuario(null)
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
      value={{ usuario, cargando, login, logout, refrescarUsuario, tieneModulo, tienePermiso, moduloActivo }}
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
// denso de escritorio; los otros 6 roles ven el shell móvil tipo app social.
export function esRolAdmin(usuario) {
  return Boolean(usuario?.esSuperAdmin || usuario?.rol?.slug === 'administrador')
}
