// Primitivas de UI compartidas por todas las páginas de módulos.
// Mantienen el mismo lenguaje visual del login: tema HUD táctico oscuro,
// acento cian único (ver layout/panel.css, importado desde AppLayout).

import { X } from 'lucide-react'

const inputBase = 'panel-input w-full rounded-lg px-3 py-2 text-sm'

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="panel-mono mb-1.5 block text-[11px] tracking-[0.1em] text-cyan-700/80 uppercase dark:text-cyan-400/80">{label}</span>
      {children}
    </label>
  )
}

export function Input(props) {
  return <input {...props} className={`${inputBase} ${props.className || ''}`} />
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={`${inputBase} ${props.className || ''}`}>
      {children}
    </select>
  )
}

export function Textarea(props) {
  return <textarea rows={3} {...props} className={`${inputBase} ${props.className || ''}`} />
}

const BTN_VARIANTES = {
  primario: 'panel-btn-primario disabled:opacity-60',
  secundario: 'panel-btn-secundario disabled:opacity-60',
  peligro: 'panel-btn-peligro disabled:opacity-60',
  fantasma: 'panel-btn-fantasma',
}

export function Btn({ variante = 'primario', className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${BTN_VARIANTES[variante]} ${className}`}
    />
  )
}

const BADGE_COLORES = {
  // mantenimiento
  pendiente: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  programado: 'bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 ring-1 ring-inset ring-cyan-400/30',
  finalizado: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  // tickets
  Nuevo: 'bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 ring-1 ring-inset ring-cyan-400/30',
  Asignado: 'bg-violet-400/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-400/30',
  'En progreso': 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  Resuelto: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  Cerrado: 'bg-slate-400/10 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-400/30',
  // reportes de daños
  en_proceso: 'bg-violet-400/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-400/30',
  resuelto: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  // flota y operación
  libre: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  ocupada: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  despachado: 'bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 ring-1 ring-inset ring-cyan-400/30',
  retrasado: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  anulado: 'bg-slate-400/10 text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-400/30',
  abierta: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  cerrada: 'bg-slate-400/10 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-400/30',
  custodia: 'bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 ring-1 ring-inset ring-cyan-400/30',
  entregado: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  activa: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  inactiva: 'bg-slate-400/10 text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-400/30',
  operativa: 'bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 ring-1 ring-inset ring-cyan-400/30',
  incidente: 'bg-rose-400/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-400/30',
  baja: 'bg-slate-400/10 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-400/30',
  media: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  alta: 'bg-rose-400/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-400/30',
  critica: 'bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-500/40',
  // Orden de Trabajo (CMMS, ver Backend/src/models/mantenimiento/Mantenimiento.js)
  reportado: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  programada: 'bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 ring-1 ring-inset ring-cyan-400/30',
  asignada: 'bg-violet-400/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-400/30',
  en_progreso: 'bg-sky-400/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-400/30',
  en_espera: 'bg-orange-400/10 text-orange-700 dark:text-orange-300 ring-1 ring-inset ring-orange-400/30',
  resuelta: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  pendiente_aprobacion: 'bg-fuchsia-400/10 text-fuchsia-700 dark:text-fuchsia-300 ring-1 ring-inset ring-fuchsia-400/30',
  cancelada: 'bg-slate-400/10 text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-400/30',
  // usuarios
  activo: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  inactivo: 'bg-slate-400/10 text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-400/30',
  // roles (slugs de Rol, ver Backend/src/seedData/rbac.data.js)
  super_admin: 'bg-violet-400/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-400/30',
  administrador: 'bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 ring-1 ring-inset ring-cyan-400/30',
  empresa_transportadora: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  despachador: 'bg-sky-400/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-400/30',
  seguridad: 'bg-rose-400/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-400/30',
  operador: 'bg-slate-400/10 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-400/30',
  // ambito de Rol
  global: 'bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 ring-1 ring-inset ring-cyan-400/30',
  empresa: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  // auditoria
  exito: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  error: 'bg-red-400/10 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-400/30',
  // requerimientos (estado raíz + bodega.estado, ver Backend/src/models/Requerimiento.js)
  pendiente_financiero: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  pendiente_bodega: 'bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 ring-1 ring-inset ring-cyan-400/30',
  rechazado: 'bg-red-400/10 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-400/30',
  aprobada: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  no_aprobada: 'bg-red-400/10 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-400/30',
  financiero: 'bg-violet-400/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-400/30',
  bodega: 'bg-sky-400/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-400/30',
}

export function Badge({ valor }) {
  const color = BADGE_COLORES[valor] || 'bg-slate-400/10 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-400/30'
  return (
    <span className={`panel-mono inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${color}`}>
      {valor}
    </span>
  )
}

export function ErrorMsg({ children }) {
  if (!children) return null
  return (
    <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      {children}
    </p>
  )
}

export function OkMsg({ children }) {
  if (!children) return null
  return (
    <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
      {children}
    </p>
  )
}

export function Modal({ abierto, titulo, onCerrar, children, ancho = 'max-w-lg' }) {
  if (!abierto) return null
  return (
    <div
      className="panel-modal-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div className={`panel-modal my-8 w-full ${ancho} rounded-2xl p-6`}>
        <span className="panel-bracket panel-bracket--tl" aria-hidden="true" />
        <span className="panel-bracket panel-bracket--tr" aria-hidden="true" />
        <span className="panel-bracket panel-bracket--bl" aria-hidden="true" />
        <span className="panel-bracket panel-bracket--br" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="panel-mono text-base font-semibold tracking-wide text-slate-900 dark:text-white">{titulo}</h2>
          <button
            onClick={onCerrar}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-cyan-600/10 hover:text-cyan-700 dark:text-slate-400 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-300"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Pager({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <Btn variante="secundario" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Anterior
      </Btn>
      <span className="panel-mono text-xs text-slate-500 dark:text-slate-400">
        Página {page} de {pages}
      </span>
      <Btn variante="secundario" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Siguiente →
      </Btn>
    </div>
  )
}

export function EmptyState({ mensaje = 'Sin resultados' }) {
  return (
    <div className="rounded-xl border border-dashed border-cyan-600/25 p-8 text-center text-sm text-slate-500 dark:border-cyan-400/20 dark:text-slate-400">
      {mensaje}
    </div>
  )
}

export function Card({ children, className = '' }) {
  return (
    <div className={`panel-card relative rounded-xl p-4 ${className}`}>
      <span className="panel-bracket panel-bracket--tl" aria-hidden="true" />
      <span className="panel-bracket panel-bracket--tr" aria-hidden="true" />
      <span className="panel-bracket panel-bracket--bl" aria-hidden="true" />
      <span className="panel-bracket panel-bracket--br" aria-hidden="true" />
      {children}
    </div>
  )
}

export function Th({ children, className = '' }) {
  return (
    <th className={`panel-th panel-mono px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide ${className}`}>
      {children}
    </th>
  )
}

export function Td({ children, className = '' }) {
  return <td className={`panel-td px-3 py-2 text-sm ${className}`}>{children}</td>
}

export function TablaWrap({ children }) {
  return (
    <div className="panel-table-wrap overflow-x-auto rounded-xl">
      <table className="min-w-full">{children}</table>
    </div>
  )
}

export function fmtFecha(valor) {
  if (!valor) return '—'
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function fmtFechaHora(valor) {
  if (!valor) return '—'
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Para <input type="date">: Date/ISO → "YYYY-MM-DD"
export function aInputFecha(valor) {
  if (!valor) return ''
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}
