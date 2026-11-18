import { Stethoscope, ExternalLink, Clock, Check } from 'lucide-react'
import { ACCION_HISTORIAL_LABELS, ETAPA_INCAPACIDAD_LABELS } from '../../config/ausenciasConstants.js'
import { Badge, Modal, Btn, fmtFecha, fmtFechaHora } from '../../components/ui.jsx'
import { cn } from '../../lib/cn.js'
import { urlSoporteDe, nombreSolicitante } from './incapacidadesUtil.js'

// Piezas que comparten la bandeja del trámite y la supervisión de incapacidades.

export function EnlaceSoporte({ ausencia, className }) {
  const url = urlSoporteDe(ausencia)
  if (!url) return <span className="text-xs text-slate-400">Sin soporte</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={ausencia.soporte?.nombreArchivo || 'Ver soporte médico'}
      className={cn('inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-400', className)}
    >
      <Stethoscope className="h-4 w-4" aria-hidden="true" />
      <span className="text-xs">Ver soporte</span>
    </a>
  )
}

// "Lleva 3 d": cuánto hace que está detenida en la etapa actual. Más de 3 días
// se resalta, para que se note lo que se está quedando sin atender.
export function TiempoEnEtapa({ dias }) {
  if (dias === null || dias === undefined) return null
  const alerta = dias >= 7 ? 'text-red-600 dark:text-red-400' : dias >= 3 ? 'text-warn-700 dark:text-warn-300' : 'text-slate-500 dark:text-slate-400'
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', alerta)} title="Tiempo en la etapa actual">
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {dias === 0 ? 'Hoy' : `${dias} d`}
    </span>
  )
}

export function EtapaBadge({ incapacidad }) {
  if (incapacidad.estado === 'cancelada') return <Badge valor="cancelada" label="Cancelada" />
  const etapa = incapacidad.etapa || incapacidad.etapaEfectiva
  if (!etapa) return <Badge valor={incapacidad.estado} label={incapacidad.estado === 'aprobada' ? 'Aprobada (trámite anterior)' : incapacidad.estado} />
  return <Badge valor={etapa} label={ETAPA_INCAPACIDAD_LABELS[etapa] || etapa} />
}

// Los cuatro pasos del trámite y en cuál va la incapacidad: de un vistazo se ve
// qué ya pasó, dónde está ahora y qué falta.
const PASOS = [
  { etiqueta: 'SIG verifica', etapas: ['en_verificacion', 'devuelta'] },
  { etiqueta: 'Secretaría folía', etapas: ['por_foliar'] },
  { etiqueta: 'Gerencia direcciona', etapas: ['foliada'] },
  { etiqueta: 'Talento Humano', etapas: ['direccionada'] },
]

export function PasosDelTramite({ incapacidad }) {
  const etapa = incapacidad.etapa || incapacidad.etapaEfectiva
  if (!etapa || incapacidad.estado === 'cancelada') return null
  const terminada = etapa === 'tramitada'
  const actual = terminada ? PASOS.length : PASOS.findIndex((p) => p.etapas.includes(etapa))
  return (
    <ol className="flex items-start" aria-label="Pasos del trámite">
      {PASOS.map((p, i) => {
        const hecho = i < actual
        const esActual = i === actual
        const devuelta = esActual && etapa === 'devuelta'
        return (
          <li key={p.etiqueta} className="flex flex-1 flex-col items-center text-center" aria-current={esActual ? 'step' : undefined}>
            <span className="flex w-full items-center">
              <span className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : hecho || esActual ? 'bg-accent-500' : 'bg-slate-200 dark:bg-slate-700')} />
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  hecho && 'bg-accent-500 text-white',
                  esActual && !devuelta && 'bg-brand-600 text-white ring-4 ring-brand-600/20',
                  devuelta && 'bg-red-500 text-white ring-4 ring-red-500/20',
                  !hecho && !esActual && 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
                )}
              >
                {hecho ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
              </span>
              <span className={cn('h-0.5 flex-1', i === PASOS.length - 1 ? 'bg-transparent' : hecho ? 'bg-accent-500' : 'bg-slate-200 dark:bg-slate-700')} />
            </span>
            <span className={cn('mt-1 text-[11px] leading-tight', esActual ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400')}>
              {p.etiqueta}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// Quién hizo qué y cuándo, en orden. Lo que lee la supervisión.
export function LineaDeTiempo({ historial }) {
  const pasos = historial || []
  if (!pasos.length) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Esta incapacidad es anterior al trámite y no tiene historial.</p>
  }
  return (
    <ol className="space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
      {pasos.map((p, i) => (
        <li key={`${p.accion}-${p.fecha}-${i}`} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white dark:ring-slate-900" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-900 dark:text-white">{ACCION_HISTORIAL_LABELS[p.accion] || p.accion}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {p.nombre || '—'}{p.cargo ? ` · ${p.cargo}` : ''} · {fmtFechaHora(p.fecha)}
          </p>
          {p.nota && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{p.nota}</p>}
        </li>
      ))}
    </ol>
  )
}

function Dato({ etiqueta, children }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{etiqueta}</dt>
      <dd className="text-sm text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  )
}

export function DetalleIncapacidadModal({ incapacidad, onCerrar }) {
  const a = incapacidad
  return (
    <Modal abierto={Boolean(a)} titulo="Detalle de la incapacidad" ancho="max-w-2xl" onCerrar={onCerrar}>
      {a && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <EtapaBadge incapacidad={a} />
            <TiempoEnEtapa dias={a.diasEnEtapa} />
          </div>

          <PasosDelTramite incapacidad={a} />

          <dl className="grid gap-3 sm:grid-cols-2">
            <Dato etiqueta="Trabajador">{nombreSolicitante(a)}</Dato>
            <Dato etiqueta="Cargo / dependencia">
              {[a.cargoSolicitante || a.solicitante?.cargo, a.dependenciaSolicitante || a.solicitante?.dependencia].filter(Boolean).join(' · ') || null}
            </Dato>
            <Dato etiqueta="Fechas">
              {fmtFecha(a.fechaInicio)} → {fmtFecha(a.fechaFin)} ({a.diasHabiles} día{a.diasHabiles === 1 ? '' : 's'})
            </Dato>
            <Dato etiqueta="Observación del trabajador">{a.motivo}</Dato>
            <Dato etiqueta="Folio">
              {a.folio?.numero
                ? `${a.folio.numero}${a.folio.observacion ? ` — ${a.folio.observacion}` : ''}`
                : null}
            </Dato>
            <Dato etiqueta="Dirigida a">{a.direccionamiento?.nombreDestinatario}</Dato>
            <Dato etiqueta="Mensaje de la Gerencia">{a.direccionamiento?.mensaje}</Dato>
            <Dato etiqueta="Destinatario en el folio">
              {a.etapa === 'direccionada' || a.etapa === 'tramitada' ? (a.folio?.destinatarioRegistrado ? 'Registrado' : 'Pendiente de registrar') : null}
            </Dato>
          </dl>

          <div className="flex items-center gap-3">
            <EnlaceSoporte ausencia={a} />
            {urlSoporteDe(a) && <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
          </div>

          <div>
            <h3 className="panel-mono mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Recorrido del trámite
            </h3>
            <LineaDeTiempo historial={a.historial} />
          </div>

          <div className="flex justify-end">
            <Btn variante="secundario" onClick={onCerrar}>Cerrar</Btn>
          </div>
        </div>
      )}
    </Modal>
  )
}
