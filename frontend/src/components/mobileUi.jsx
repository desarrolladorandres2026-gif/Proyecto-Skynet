// Primitivas del shell móvil (los 6 roles no-admin, ver plan de rediseño
// "social-app"). Reemplazan tabla+modal por el lenguaje de feed: filas
// táctiles en vez de <table>, hojas deslizantes en vez de modales
// centrados, pastillas en vez de <select> de filtro. Los estilos vienen de
// layout/mobileShell.css (clases m-*, sin colisión con panel-*). Los
// formularios dentro de BottomSheet siguen usando Field/Input/Select/
// Textarea/Btn de components/ui.jsx — no se reinventan.

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, X } from 'lucide-react'

export function ListRow({ icon: Icon, leading, title, subtitle, badge, trailing, onClick, className = '' }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`m-row flex w-full items-center gap-3 rounded-2xl p-3 text-left ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {leading !== undefined ? leading : Icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--mobile-accent-soft)] text-[var(--mobile-accent)]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--mobile-text)]">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-xs text-[var(--mobile-text-dim)]">{subtitle}</span>}
      </span>
      {badge}
      {trailing !== undefined ? trailing : onClick && (
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--mobile-text-dim)]" aria-hidden="true" />
      )}
    </Comp>
  )
}

export function ChipTabs({ opciones, valor, onChange, className = '' }) {
  return (
    <div className={`-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 ${className}`}>
      {opciones.map((op) => (
        <button
          key={op.value}
          type="button"
          onClick={() => onChange(op.value)}
          className={`m-chip shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium ${valor === op.value ? 'is-active' : ''}`}
        >
          {op.label}
          {op.count !== undefined && <span className="ml-1 opacity-70">({op.count})</span>}
        </button>
      ))}
    </div>
  )
}

export function FAB({ icon: Icon, label, onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`m-fab fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bottom-[calc(var(--m-navh)+env(safe-area-inset-bottom)+0.75rem)] ${className}`}
    >
      <Icon className="h-6 w-6" aria-hidden="true" />
    </button>
  )
}

export function BottomSheet({ abierto, titulo, onCerrar, children }) {
  // Bloquea el scroll del fondo mientras la hoja está abierta — sin esto,
  // en móvil el gesto de scroll dentro de la hoja arrastra también el feed
  // detrás de ella.
  useEffect(() => {
    if (!abierto) return
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previo }
  }, [abierto])

  if (!abierto) return null
  return (
    <div
      className="m-sheet-backdrop fixed inset-0 z-50 flex items-end justify-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar() }}
    >
      <div className="m-sheet flex max-h-[85svh] w-full max-w-lg flex-col rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-center pt-2.5">
          <span className="m-sheet-handle h-1.5 w-10 rounded-full" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h2 className="text-base font-semibold text-[var(--mobile-text)]">{titulo}</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-[var(--mobile-text-dim)] hover:bg-[var(--mobile-accent-soft)] hover:text-[var(--mobile-accent)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-6">{children}</div>
      </div>
    </div>
  )
}

export function SectionHeader({ children, className = '' }) {
  return (
    <h2 className={`mb-3 text-xs font-semibold tracking-[0.1em] text-[var(--mobile-text-dim)] uppercase ${className}`}>
      {children}
    </h2>
  )
}

export function QuickAction({ icon: Icon, label, to, onClick }) {
  const contenido = (
    <>
      <span className="m-card flex h-14 w-14 items-center justify-center rounded-2xl text-[var(--mobile-accent)]">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="mt-1.5 block max-w-[4.5rem] truncate text-center text-[11px] font-medium text-[var(--mobile-text-dim)]">
        {label}
      </span>
    </>
  )
  const className = 'flex flex-col items-center shrink-0'
  if (to) {
    return <Link to={to} className={className}>{contenido}</Link>
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {contenido}
    </button>
  )
}
