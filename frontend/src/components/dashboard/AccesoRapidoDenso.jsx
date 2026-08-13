// Botón de atajo del Dashboard denso — mismo rol que QuickAction en la
// versión móvil (mobileUi.jsx), pero como pastilla horizontal en vez de
// ícono circular, para encajar en el layout de escritorio.
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn.js'

export function AccesoRapidoDenso({ icon: Icon, label, to, className = '' }) {
  return (
    <Link
      to={to}
      className={cn(
        'panel-btn-secundario inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
        className
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  )
}
