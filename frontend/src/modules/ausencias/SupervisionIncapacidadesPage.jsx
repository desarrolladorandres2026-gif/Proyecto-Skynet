import { useState } from 'react'
import { Eye, Search, ShieldCheck } from 'lucide-react'
import { ausencias as ausenciasApi } from '../../api/ausencias.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { useValorDiferido } from '../../hooks/useValorDiferido.js'
import { ETAPAS_INCAPACIDAD } from '../../config/ausenciasConstants.js'
import { cn } from '../../lib/cn.js'
import {
  Btn, Card, ErrorMsg, Field, Input, TablaWrap, Th, Td, EmptyState, fmtFecha,
} from '../../components/ui.jsx'
import {
  EtapaBadge, TiempoEnEtapa, EnlaceSoporte, DetalleIncapacidadModal,
} from './incapacidadesUi.jsx'
import { nombreSolicitante } from './incapacidadesUtil.js'

// Supervisión de TODAS las incapacidades: en qué etapa está cada una, quién la
// tiene y hace cuánto. Solo lectura; las acciones viven en el trámite.
const FILTROS = [
  { value: '', label: 'Todas' },
  ...ETAPAS_INCAPACIDAD,
  { value: 'cancelada', label: 'Canceladas' },
]

export default function SupervisionIncapacidadesPage() {
  const [etapa, setEtapa] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [detalle, setDetalle] = useState(null)

  // La búsqueda por texto espera a que se deje de teclear para no pedirle al
  // servidor una consulta por cada letra.
  const q = useValorDiferido(busqueda.trim(), 350)
  const clave = `ausencias:supervision-incapacidades:${etapa}:${q}:${desde}:${hasta}`
  const { data, cargando, error } = useDatosConCache(
    clave,
    () => ausenciasApi.supervisionIncapacidades({ etapa, q, desde, hasta }),
    { ttlMs: 15_000 },
  )
  const lista = data?.incapacidades || []
  const resumen = data?.resumen

  const conteo = (valor) => {
    if (!resumen) return null
    if (valor === '') return resumen.total
    if (valor === 'cancelada') return resumen.canceladas
    return resumen[valor] || 0
  }

  return (
    <div>
      <h1 className="panel-mono mb-1 flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
        <ShieldCheck className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden="true" />
        Supervisión de incapacidades
      </h1>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        Todas las incapacidades y en qué punto del trámite está cada una: SIG, folio, Gerencia y Talento Humano.
      </p>

      <ErrorMsg>{error}</ErrorMsg>

      <div role="group" aria-label="Filtrar por etapa" className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const esta = etapa === f.value
          const n = conteo(f.value)
          return (
            <button
              key={f.value || 'todas'}
              type="button"
              aria-pressed={esta}
              onClick={() => setEtapa(f.value)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition',
                esta
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'border border-slate-200 text-slate-600 hover:bg-brand-600/10 dark:border-slate-700 dark:text-slate-300',
              )}
            >
              {f.label}
              {n !== null && (
                <span className={cn('rounded-full px-1.5 text-xs', esta ? 'bg-white/25' : 'bg-slate-400/15')}>{n}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Field label="Buscar por trabajador o número de folio">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input className="pl-9" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o folio" />
          </div>
        </Field>
        <Field label="Fechas desde">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Fechas hasta">
          <Input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
        </Field>
      </div>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay incapacidades con esos filtros" />
      ) : (
        <>
          <TablaWrap>
            <thead>
              <tr>
                <Th>Trabajador</Th>
                <Th>Fechas</Th>
                <Th>Etapa</Th>
                <Th>En la etapa</Th>
                <Th>Folio</Th>
                <Th>Dirigida a</Th>
                <Th className="text-right">Detalle</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a._id}>
                  <Td>
                    <span className="block font-medium">{nombreSolicitante(a)}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {a.dependenciaSolicitante || a.solicitante?.dependencia || ''}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {fmtFecha(a.fechaInicio)} → {fmtFecha(a.fechaFin)}
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {a.diasHabiles} día{a.diasHabiles === 1 ? '' : 's'}
                    </span>
                  </Td>
                  <Td><EtapaBadge incapacidad={a} /></Td>
                  <Td><TiempoEnEtapa dias={a.diasEnEtapa} /></Td>
                  <Td className="whitespace-nowrap">
                    {a.folio?.numero || <span className="text-slate-400">—</span>}
                    {(a.etapa === 'direccionada' || a.etapa === 'tramitada') && !a.folio?.destinatarioRegistrado && (
                      <span className="block text-xs text-warn-700 dark:text-warn-300">Falta anotar destinatario</span>
                    )}
                  </Td>
                  <Td>{a.direccionamiento?.nombreDestinatario || <span className="text-slate-400">—</span>}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <EnlaceSoporte ausencia={a} />
                      <Btn variante="fantasma" className="flex items-center gap-1.5" onClick={() => setDetalle(a)}>
                        <Eye className="h-4 w-4" aria-hidden="true" /> Ver
                      </Btn>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TablaWrap>
          {lista.length >= 300 && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Se muestran las 300 más recientes. Afina con la búsqueda o las fechas para ver otras.
            </p>
          )}
        </>
      )}

      <DetalleIncapacidadModal incapacidad={detalle} onCerrar={() => setDetalle(null)} />
    </div>
  )
}
