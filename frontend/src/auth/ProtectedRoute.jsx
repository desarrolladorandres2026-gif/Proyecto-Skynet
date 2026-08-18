import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import SkynetLoader from '../components/SkynetLoader.jsx'
import CambiarPasswordObligatorio from './CambiarPasswordObligatorio.jsx'

export function ProtectedRoute({ children }) {
  const { usuario, cargando } = useAuth()

  if (cargando) {
    return <SkynetLoader mensaje="CARGANDO..." subtexto="VERIFICANDO ACCESO" />
  }

  if (!usuario) return <Navigate to="/login" replace />

  // Contraseña de seed o asignada por un admin: bloquea toda la app (incluido
  // el sidebar) hasta que la persona elija una propia. No es una ruta aparte
  // a propósito: evita que quede una URL "de escape" que muestre el resto de
  // Skynet sin haber cambiado la contraseña.
  if (usuario.debeCambiarPassword) return <CambiarPasswordObligatorio />

  return children
}

// RBAC granular nuevo: reemplaza a AdminRoute para los módulos del ERP
// (Usuarios, Roles, Auditoría, ...). ModuleRoute (abajo) se mantiene aparte
// para las rutas legadas (mantenimiento), que no cambian en esta fase.
// `permiso` acepta un string o un array de alternativas (basta tener una).
export function PermissionRoute({ permiso, children }) {
  const { tienePermiso } = useAuth()

  if (![].concat(permiso).some((p) => tienePermiso(p))) {
    return (
      <div className="flex min-h-[60svh] flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
        <p className="text-lg font-medium text-slate-700 dark:text-slate-200">Sin acceso</p>
        <p className="text-sm">No tienes permisos para ver esta sección.</p>
      </div>
    )
  }

  return children
}

// Más estricto que PermissionRoute: para herramientas que deben quedar
// atadas al bypass esSuperAdmin en sí (backup completo de la plataforma),
// no a un permiso RBAC que en teoría podría delegarse a otro rol más
// adelante — ver backup.routes.js (soloAdmin) en el backend, que es quien
// de verdad lo hace cumplir.
export function SuperAdminRoute({ children }) {
  const { usuario } = useAuth()

  if (!usuario?.esSuperAdmin) {
    return (
      <div className="flex min-h-[60svh] flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
        <p className="text-lg font-medium text-slate-700 dark:text-slate-200">Sin acceso</p>
        <p className="text-sm">Esta sección es exclusiva del Super Admin.</p>
      </div>
    )
  }

  return children
}

// Gate de módulo del sistema desactivado por el Super Admin (ModuloSistema).
// Se antepone a PermissionRoute en App.jsx para los módulos desactivables del
// ERP (danos, flota, operacion); mantenimiento lo hereda vía
// ModuleRoute. Es solo experiencia de usuario: la API del módulo apagado ya
// responde 403 desde el backend (middleware requiereModuloActivo).
export function ModuloActivoRoute({ modulo, children }) {
  const { moduloActivo } = useAuth()

  if (!moduloActivo(modulo)) {
    return (
      <div className="flex min-h-[60svh] flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
        <p className="text-lg font-medium text-slate-700 dark:text-slate-200">Módulo desactivado</p>
        <p className="text-sm">El administrador del sistema desactivó este módulo.</p>
      </div>
    )
  }

  return children
}

export function ModuleRoute({ modulo, children }) {
  const { tieneModulo, moduloActivo } = useAuth()

  if (!moduloActivo(modulo)) {
    return (
      <div className="flex min-h-[60svh] flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
        <p className="text-lg font-medium text-slate-700 dark:text-slate-200">Módulo desactivado</p>
        <p className="text-sm">El administrador del sistema desactivó este módulo.</p>
      </div>
    )
  }

  if (!tieneModulo(modulo)) {
    return (
      <div className="flex min-h-[60svh] flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
        <p className="text-lg font-medium text-slate-700 dark:text-slate-200">Sin acceso</p>
        <p className="text-sm">No tienes permisos para ver este módulo.</p>
      </div>
    )
  }

  return children
}
