import { useEffect, useState } from 'react'
import { Inbox, Check, X, Stethoscope } from 'lucide-react'
import { ausencias as ausenciasApi } from '../../api/ausencias.js'
import { MOTIVO_LICENCIA_LABELS } from '../../config/ausenciasConstants.js'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Textarea, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFecha,
} from '../../components/ui.jsx'

export default function BandejaAusenciasPage() {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  // Una sola pieza de estado para el modal: guarda a la vez QUÉ solicitud se
  // está decidiendo y SI es aprobación o rechazo, para que no puedan quedar
  // desincronizadas (p. ej. rechazar la solicitud equivocada).
  const [decision, setDecision] = useState(null)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const datos = await ausenciasApi.bandeja()
      setLista(datos.ausencias)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  function abrir(ausencia, accion) {
    setDecision({ ausencia, accion })
    setTexto('')
    setErrorForm('')
  }

  async function confirmar(e) {
    e.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      if (decision.accion === 'aprobar') {
        await ausenciasApi.aprobar(decision.ausencia._id, texto)
        setOk('Solicitud aprobada')
      } else {
        await ausenciasApi.rechazar(decision.ausencia._id, texto)
        setOk('Solicitud rechazada')
      }
      setDecision(null)
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const esRechazo = decision?.accion === 'rechazar'

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="panel-mono mb-4 flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
        <Inbox className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        Solicitudes por decidir
      </h1>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="No hay solicitudes pendientes de decisión" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Solicitante</Th>
              <Th>Dependencia</Th>
              <Th>Tipo</Th>
              <Th>Desde</Th>
              <Th>Hasta</Th>
              <Th>Días</Th>
              <Th>Motivo</Th>
              <Th className="text-right">Decisión</Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => (
              <tr key={a._id}>
                <Td className="font-medium">{a.solicitante?.nombre || a.solicitante?.nombre_usuario}</Td>
                <Td>{a.dependenciaSolicitante || a.solicitante?.dependencia || '—'}</Td>
                <Td>
                  <span className="flex items-center gap-1.5">
                    <Badge valor={a.tipo} />
                    {/* Defensa en profundidad: aunque el backend ya valida que
                        soporte.url solo pueda ser un archivo subido a
                        Cloudinary (ver ausencias.service.js), este componente
                        no confía ciegamente en ese dato para un href —
                        cualquier esquema que no sea https queda sin enlace. */}
                    {a.soporte?.url?.startsWith('https://') && (
                      <a
                        href={a.soporte.url}
                        target="_blank"
                        rel="noreferrer"
                        title={a.soporte.nombreArchivo || 'Ver soporte médico'}
                        className="text-orange-600 hover:underline dark:text-orange-400"
                      >
                        <Stethoscope className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">
                  {fmtFecha(a.fechaInicio)}
                  {a.horaInicio && (
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {a.horaInicio}–{a.horaFin}
                    </span>
                  )}
                </Td>
                <Td className="whitespace-nowrap">{fmtFecha(a.fechaFin)}</Td>
                <Td>{a.diasHabiles}</Td>
                <Td className="max-w-xs truncate text-slate-600 dark:text-slate-300">
                  {a.motivoLicencia && (
                    <span className="mr-1.5 text-xs font-medium text-violet-600 dark:text-violet-400">
                      [{MOTIVO_LICENCIA_LABELS[a.motivoLicencia] || a.motivoLicencia}]
                    </span>
                  )}
                  {a.motivo || (a.motivoLicencia ? '' : '—')}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Btn variante="fantasma" className="flex items-center gap-1.5" onClick={() => abrir(a, 'aprobar')}>
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> Aprobar
                    </Btn>
                    <Btn
                      variante="fantasma"
                      className="flex items-center gap-1.5 !text-red-600 dark:!text-red-400"
                      onClick={() => abrir(a, 'rechazar')}
                    >
                      <X className="h-4 w-4" aria-hidden="true" /> Rechazar
                    </Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Modal
        abierto={Boolean(decision)}
        titulo={esRechazo ? 'Rechazar solicitud' : 'Aprobar solicitud'}
        onCerrar={() => setDecision(null)}
      >
        {decision && (
          <form onSubmit={confirmar} className="space-y-4">
            <ErrorMsg>{errorForm}</ErrorMsg>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              {decision.ausencia.solicitante?.nombre} · {decision.ausencia.tipo} ·{' '}
              {fmtFecha(decision.ausencia.fechaInicio)} → {fmtFecha(decision.ausencia.fechaFin)} (
              {decision.ausencia.diasHabiles} día{decision.ausencia.diasHabiles === 1 ? '' : 's'}
              {decision.ausencia.horaInicio ? ` · ${decision.ausencia.horaInicio}–${decision.ausencia.horaFin}` : ''})
            </p>

            <Field label={esRechazo ? 'Motivo del rechazo (obligatorio)' : 'Observación (opcional)'}>
              <Textarea required={esRechazo} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Btn variante="secundario" onClick={() => setDecision(null)}>Cancelar</Btn>
              <button
                type="submit"
                disabled={guardando}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
                  esRechazo ? 'panel-btn-peligro' : 'panel-btn-primario'
                }`}
              >
                {guardando ? 'Guardando…' : esRechazo ? 'Rechazar' : 'Aprobar'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
