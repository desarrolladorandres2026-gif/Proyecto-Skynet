import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function HomeRedirect() {
  const { usuario } = useAuth()

  // El dashboard es universal: /api/dashboard arma sus tarjetas según los
  // permisos del rol, así que todo usuario (incluso sin módulos) tiene home.
  if (usuario) return <Navigate to="/dashboard" replace />
  return <Navigate to="/login" replace />
}
