import { NavLink, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { cn } from '../lib/cn.js'

const coincide = (pathname, to) =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)

// Menú de texto, sin íconos: los módulos con un solo ítem son un enlace
// directo; los que agrupan varios muestran su nombre como etiqueta de grupo
// y sus ítems debajo (todos visibles, sin submenús desplegables).
function Grupo({ modulo, onNavigate }) {
  const { pathname } = useLocation()

  if (modulo.items.length === 1) {
    const item = modulo.items[0]
    return (
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={cn('zp-nav-item', coincide(pathname, item.to) && 'is-active')}
        title={modulo.label}
      >
        {modulo.label}
      </NavLink>
    )
  }

  return (
    <div role="group" aria-label={modulo.label}>
      <div className="zp-nav-group">{modulo.label}</div>
      {modulo.items.map((item) => {
        const activo = item.end ? pathname === item.to : coincide(pathname, item.to)
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={cn('zp-nav-item', activo && 'is-active')}
            title={item.label}
          >
            {item.label}
          </NavLink>
        )
      })}
    </div>
  )
}

export default function BarraLateral({ modulosVisibles, abierta, onCerrar }) {
  // Con el menú superpuesto (pantallas angostas), Escape lo cierra.
  useEffect(() => {
    if (!abierta) return undefined
    const alTeclear = (e) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [abierta, onCerrar])

  return (
    <>
      {abierta && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          style={{ top: 'var(--zp-topbar-h)' }}
          onClick={onCerrar}
          aria-hidden="true"
        />
      )}
      <nav className={cn('zp-sidebar', abierta && 'is-open')} aria-label="Menú principal">
        {modulosVisibles.map((m) => (
          <Grupo key={m.key} modulo={m} onNavigate={onCerrar} />
        ))}
      </nav>
    </>
  )
}
