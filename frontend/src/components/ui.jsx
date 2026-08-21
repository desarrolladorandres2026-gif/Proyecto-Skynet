// Primitivas de UI compartidas por todas las páginas de módulos, y también
// por el shell móvil de los otros 6 roles (Field/Input/Select/Textarea/Btn,
// reutilizados dentro de sus BottomSheet — ver components/mobileUi.jsx). Por
// eso este archivo se refina in-place (misma API/props) en vez de
// bifurcarse: el pulido visual beneficia a ambos shells sin duplicar
// componentes de formulario.

import * as Dialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { cva } from 'class-variance-authority'
import { Link } from 'react-router-dom'
import { ChevronRight, X } from 'lucide-react'
import { cn } from '../lib/cn.js'

const inputBase = 'panel-input w-full rounded-lg px-3 py-2 text-sm'

export function Field({ label, children, className = '' }) {
  return (
    <label className={cn('block', className)}>
      <span className="panel-mono mb-1.5 block text-[11px] tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">
        {label}
      </span>
      {children}
    </label>
  )
}

export function Input(props) {
  return <input {...props} className={cn(inputBase, props.className)} />
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={cn(inputBase, props.className)}>
      {children}
    </select>
  )
}

export function Textarea(props) {
  return <textarea rows={3} {...props} className={cn(inputBase, props.className)} />
}

const btnVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel-bg)]',
  {
    variants: {
      variante: {
        primario: 'panel-btn-primario disabled:opacity-60 disabled:pointer-events-none',
        secundario: 'panel-btn-secundario disabled:opacity-60 disabled:pointer-events-none',
        peligro: 'panel-btn-peligro disabled:opacity-60 disabled:pointer-events-none',
        fantasma: 'panel-btn-fantasma',
      },
    },
    defaultVariants: { variante: 'primario' },
  }
)

export function Btn({ variante = 'primario', className = '', ...props }) {
  return <button type="button" {...props} className={cn(btnVariants({ variante }), className)} />
}

// Toggle on/off con el acento de marca.
export function Switch({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel-bg)]',
        checked ? 'bg-brand-600 dark:bg-brand-500' : 'bg-slate-300 dark:bg-slate-700'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
        aria-hidden="true"
      />
    </button>
  )
}

const BADGE_COLORES = {
  // mantenimiento
  pendiente: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  programado: 'bg-brand-400/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-400/30',
  finalizado: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  // tickets
  Nuevo: 'bg-brand-400/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-400/30',
  Asignado: 'bg-violet-400/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-400/30',
  'En progreso': 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  Resuelto: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  Cerrado: 'bg-slate-400/10 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-400/30',
  // reportes de daños (ver Backend/src/modules/danos/danos.service.js)
  asignado: 'bg-violet-400/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-400/30',
  en_proceso: 'bg-sky-400/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-400/30',
  resuelto: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  cancelado: 'bg-slate-400/10 text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-400/30',
  // flota y operación
  libre: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  ocupada: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  despachado: 'bg-brand-400/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-400/30',
  retrasado: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  anulado: 'bg-slate-400/10 text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-400/30',
  abierta: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  cerrada: 'bg-slate-400/10 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-400/30',
  custodia: 'bg-brand-400/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-400/30',
  entregado: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  activa: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  inactiva: 'bg-slate-400/10 text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-400/30',
  operativa: 'bg-brand-400/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-400/30',
  incidente: 'bg-rose-400/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-400/30',
  baja: 'bg-slate-400/10 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-400/30',
  media: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  alta: 'bg-rose-400/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-400/30',
  critica: 'bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-500/40',
  // Orden de Trabajo (CMMS, ver Backend/src/models/mantenimiento/Mantenimiento.js)
  reportado: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  programada: 'bg-brand-400/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-400/30',
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
  administrador: 'bg-brand-400/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-400/30',
  seguridad: 'bg-rose-400/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-400/30',
  operador: 'bg-slate-400/10 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-400/30',
  // ambito de Rol
  global: 'bg-brand-400/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-400/30',
  empresa: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  // auditoria
  exito: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  error: 'bg-red-400/10 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-400/30',
  // requerimientos (estado raíz + bodega.estado, ver Backend/src/models/Requerimiento.js)
  pendiente_financiero: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/30',
  pendiente_bodega: 'bg-brand-400/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-400/30',
  rechazado: 'bg-red-400/10 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-400/30',
  aprobada: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  no_aprobada: 'bg-red-400/10 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-400/30',
  financiero: 'bg-violet-400/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-400/30',
  bodega: 'bg-sky-400/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-400/30',
  // ausencias: estado y tipo (ver Backend/src/models/Ausencia.js). 'pendiente',
  // 'aprobada' y 'cancelada' ya están arriba y se reutilizan tal cual.
  rechazada: 'bg-red-400/10 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-400/30',
  vacaciones: 'bg-brand-400/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-400/30',
  permiso_remunerado: 'bg-violet-400/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-400/30',
  permiso_no_remunerado: 'bg-teal-400/10 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-teal-400/30',
  incapacidad: 'bg-orange-400/10 text-orange-700 dark:text-orange-300 ring-1 ring-inset ring-orange-400/30',
  // Cuestionarios Programados: resultado de una respuesta y estado de una
  // programación/campaña (ver Backend/src/models/RespuestaSig.js,
  // ProgramacionSig.js, CampanaSig.js). 'activa'/'pausada'/'cancelada' ya
  // están arriba y se reutilizan tal cual.
  correcta: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  incorrecta: 'bg-red-400/10 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-400/30',
  publicada: 'bg-brand-400/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-400/30',
  finalizada: 'bg-slate-400/10 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-400/30',
}

// `label` es opcional: por defecto pinta `valor` tal cual (el enum crudo del
// backend), pero un llamador puede pasar un texto traducido para el usuario
// (ver ESTADOS_BODEGA en RequerimientoDetallePage.jsx) sin perder el color,
// que sigue mapeado por `valor`.
export function Badge({ valor, label }) {
  const color = BADGE_COLORES[valor] || 'bg-slate-400/10 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-400/30'
  return (
    <span className={cn('panel-mono inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide', color)}>
      {label ?? valor}
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

// Reimplementado sobre Radix Dialog (focus trap, cierre con Escape y click
// afuera, aria-* correctos — nada de esto lo tenía el modal a mano
// anterior). La API externa no cambia: abierto/titulo/onCerrar/children/
// ancho, así que ninguno de los ~39 call-sites necesita tocarse.
export function Modal({ abierto, titulo, onCerrar, children, ancho = 'max-w-lg' }) {
  return (
    <Dialog.Root open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="panel-modal-backdrop fixed inset-0 z-50 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <Dialog.Content
          className={cn(
            'panel-modal fixed top-1/2 left-1/2 z-50 max-h-[85svh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-6 outline-none data-[state=open]:animate-zoom-in data-[state=closed]:animate-fade-out',
            ancho
          )}
        >
          <VisuallyHidden asChild>
            <Dialog.Description>{titulo}</Dialog.Description>
          </VisuallyHidden>
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="panel-mono text-base font-semibold tracking-wide text-slate-900 dark:text-white">
              {titulo}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="rounded-lg px-2 py-1 text-slate-500 hover:bg-brand-600/10 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-brand-400/10 dark:hover:text-brand-300"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
    <div className="rounded-xl border border-dashed border-brand-600/25 p-8 text-center text-sm text-slate-500 dark:border-brand-400/20 dark:text-slate-400">
      {mensaje}
    </div>
  )
}

export function Card({ children, className = '' }) {
  return <div className={cn('panel-card relative rounded-xl p-[var(--ui-card-padding)]', className)}>{children}</div>
}

// Fila de lista táctil para reemplazar <table> en pantallas angostas — mismo
// borde/sombra de Card, pero pensada para que TODA la tarjeta sea el
// objetivo del toque (en vez de un link de texto suelto de 12px, casi
// imposible de acertar con el dedo). Usa --panel-card-border-hover, la misma
// variable que StatCard.jsx ya deja lista para esto (ver panel.css). Solo
// sirve para navegación simple: si una fila necesita más de una acción (p.
// ej. "PDF" + "Gestionar" en BandejaBodegaPage), un <button> anidado dentro
// del <a> que genera <Link> sería HTML inválido — esas filas arman su propio
// Card con una fila de acciones en vez de usar este componente.
export function CardLink({ to, children, className = '' }) {
  return (
    <Link
      to={to}
      className={cn(
        'panel-card flex items-center gap-3 rounded-xl p-3.5 transition-all duration-200',
        'hover:border-[var(--panel-card-border-hover)] hover:shadow-soft-md active:scale-[0.99]',
        className
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
    </Link>
  )
}

export function Th({ children, className = '' }) {
  return (
    <th className={cn('panel-th panel-mono px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide', className)}>
      {children}
    </th>
  )
}

export function Td({ children, className = '' }) {
  return <td className={cn('panel-td px-3 py-2 text-sm', className)}>{children}</td>
}

export function TablaWrap({ children, className = '' }) {
  return (
    <div className={cn('panel-table-wrap overflow-x-auto rounded-xl', className)}>
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
