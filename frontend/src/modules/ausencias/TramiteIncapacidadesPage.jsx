import { useEffect, useState } from 'react'
import { ClipboardCheck, Check, Undo2, FileSignature, Send, ListChecks, Eye, BadgeCheck } from 'lucide-react'
import { ausencias as ausenciasApi } from '../../api/ausencias.js'
import { useDatosConCache, invalidarCache } from '../../hooks/useDatosConCache.js'
import { cn } from '../../lib/cn.js'
import {
  Btn, Card, ErrorMsg, OkMsg, Field, Input, Select, Textarea, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFecha,
} from '../../components/ui.jsx'
import {
  EnlaceSoporte, TiempoEnEtapa, DetalleIncapacidadModal,
} from './incapacidadesUi.jsx'
import { nombreSolicitante } from './incapacidadesUtil.js'

// Bandeja del trámite de incapacidades. Una sola página para todos los pasos:
// cada persona ve únicamente las pestañas de lo que le toca según sus
// permisos (el backend solo devuelve esas bandejas).
//
//   SIG           -> Por verificar     (aprueba o devuelve al trabajador)
//   Secretaria    -> Por foliar        (anota el número de folio)
//                 -> Folio por completar (anota el destinatario ya definido)
//   Gerencia      -> Por direccionar   (despacha a Talento Humano)
//   Tal. Humano   -> Recibidas
const SECCIONES = [
  {
    key: 'porVerificar',
    label: 'Por verificar',
    ayuda: 'Revisa que el soporte esté completo y legible. Si todo está bien, apruébala; si falta algo, devuélvela al trabajador diciéndole qué corregir.',
    vacio: 'No hay incapacidades por verificar',
  },
  {
    key: 'porFoliar',
    label: 'Por foliar',
    ayuda: 'Verificadas y aprobadas por SIG. Anota el número de folio con el que quedan registradas.',
    vacio: 'No hay incapacidades por foliar',
  },
  {
    key: 'porDireccionar',
    label: 'Por direccionar',
    ayuda: 'Ya están foliadas. Revísalas y despáchalas a Talento Humano indicando a quién van dirigidas.',
    vacio: 'No hay incapacidades por direccionar',
  },
  {
    key: 'porCompletarFolio',
    label: 'Completar folio',
    ayuda: 'La Gerencia ya las dirigió a una persona de Talento Humano. Registra ese destinatario en el folio.',
    vacio: 'No hay folios pendientes de completar',
  },
  {
    key: 'recibidas',
    label: 'Recibidas',
    ayuda: 'Incapacidades despachadas a Talento Humano. Las dirigidas a ti aparecen marcadas. Cuando la tramites, márcala para cerrar el ciclo.',
    vacio: 'Todavía no hay incapacidades despachadas a Talento Humano',
  },
]

const ACCIONES_POR_SECCION = {
  porVerificar: ['verificar', 'devolver'],
  porFoliar: ['foliar'],
  porDireccionar: ['direccionar'],
  porCompletarFolio: ['completarFolio'],
  recibidas: ['tramitar'],
}

const ACCIONES = {
  verificar: { titulo: 'Verificar y aprobar', boton: 'Verificar y aprobar', icono: Check },
  devolver: { titulo: 'Devolver al trabajador', boton: 'Devolver', icono: Undo2, peligro: true },
  foliar: { titulo: 'Foliar incapacidad', boton: 'Foliar', icono: FileSignature },
  direccionar: { titulo: 'Direccionar a Talento Humano', boton: 'Direccionar', icono: Send },
  completarFolio: { titulo: 'Completar el folio', boton: 'Registrar en el folio', icono: ListChecks },
  tramitar: { titulo: 'Recibida y tramitada', boton: 'Marcar tramitada', icono: BadgeCheck },
}

const FORM_VACIO = { texto: '', numeroFolio: '', destinatarioId: '' }

export default function TramiteIncapacidadesPage() {
  const { data, cargando, error, recargar } = useDatosConCache(
    'ausencias:tramite-incapacidades',
    () => ausenciasApi.tramiteIncapacidades(),
    { ttlMs: 15_000 },
  )
  const secciones = SECCIONES.filter((s) => data && s.key in data)
  const [elegida, setElegida] = useState(null)
  const activa = secciones.find((s) => s.key === elegida) || secciones.find((s) => data[s.key]?.length) || secciones[0]

  const [ok, setOk] = useState('')
  const [accion, setAccion] = useState(null) // { tipo, item }
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')
  const [destinatarios, setDestinatarios] = useState(null)
  const [detalle, setDetalle] = useState(null)

  // Las personas de Talento Humano a quienes se puede dirigir solo se piden
  // cuando se abre el formulario de direccionar.
  const abriendoDireccionar = accion?.tipo === 'direccionar'
  useEffect(() => {
    if (!abriendoDireccionar || destinatarios) return
    ausenciasApi.destinatariosIncapacidades()
      .then((d) => setDestinatarios(d.destinatarios))
      .catch((err) => setErrorForm(err.message))
  }, [abriendoDireccionar, destinatarios])

  function abrir(tipo, item) {
    setAccion({ tipo, item })
    setForm(FORM_VACIO)
    setErrorForm('')
  }

  async function confirmar(e) {
    e.preventDefault()
    const { tipo, item } = accion
    setGuardando(true)
    setErrorForm('')
    try {
      if (tipo === 'verificar') {
        await ausenciasApi.verificarIncapacidad(item._id, form.texto)
        setOk('Incapacidad verificada y aprobada. Pasa a la Secretaria de Gerencia para foliarla.')
      } else if (tipo === 'devolver') {
        await ausenciasApi.devolverIncapacidad(item._id, form.texto)
        setOk('Incapacidad devuelta. El trabajador recibió el aviso con lo que debe corregir.')
      } else if (tipo === 'foliar') {
        await ausenciasApi.foliarIncapacidad(item._id, { numeroFolio: form.numeroFolio, observacion: form.texto })
        setOk('Incapacidad foliada. Queda a la espera de que la Gerencia la direccione.')
      } else if (tipo === 'direccionar') {
        await ausenciasApi.direccionarIncapacidad(item._id, { destinatarioId: form.destinatarioId, mensaje: form.texto })
        setOk('Incapacidad direccionada a Talento Humano. La Secretaria ya puede completar el folio.')
      } else if (tipo === 'tramitar') {
        await ausenciasApi.tramitarIncapacidad(item._id, form.texto)
        setOk('Incapacidad marcada como tramitada.')
      } else {
        await ausenciasApi.completarFolioIncapacidad(item._id, form.texto)
        setOk('Folio completado con el destinatario.')
      }
      setAccion(null)
      invalidarCache('ausencias:tramite-incapacidades')
      recargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const tipo = accion?.tipo
  const meta = tipo ? ACCIONES[tipo] : null
  const item = accion?.item

  return (
    <div>
      <h1 className="panel-mono mb-4 flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
        <ClipboardCheck className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden="true" />
        Trámite de incapacidades
      </h1>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : !activa ? (
        <EmptyState mensaje="No tienes pasos del trámite de incapacidades asignados" />
      ) : (
        <>
          <div role="tablist" aria-label="Pasos del trámite" className="mb-3 flex flex-wrap gap-2">
            {secciones.map((s) => {
              const n = data[s.key].length
              const esta = s.key === activa.key
              return (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={esta}
                  onClick={() => { setElegida(s.key); setOk('') }}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition',
                    esta
                      ? 'bg-brand-600 text-white dark:bg-brand-500'
                      : 'border border-slate-200 text-slate-600 hover:bg-brand-600/10 dark:border-slate-700 dark:text-slate-300',
                  )}
                >
                  {s.label}
                  <span className={cn('rounded-full px-1.5 text-xs', esta ? 'bg-white/25' : n > 0 ? 'bg-brand-600/15 text-brand-700 dark:text-brand-300' : 'bg-slate-400/15')}>
                    {n}
                  </span>
                </button>
              )
            })}
          </div>

          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{activa.ayuda}</p>

          {data[activa.key].length === 0 ? (
            <EmptyState mensaje={activa.vacio} />
          ) : (
            <TablaWrap>
              <thead>
                <tr>
                  <Th>Trabajador</Th>
                  <Th>Fechas</Th>
                  <Th>En esta etapa</Th>
                  <Th>Trámite</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {data[activa.key].map((a) => (
                  <tr key={a._id}>
                    <Td>
                      <span className="block font-medium">{nombreSolicitante(a)}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {a.cargoSolicitante || a.solicitante?.cargo || ''}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {fmtFecha(a.fechaInicio)} → {fmtFecha(a.fechaFin)}
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {a.diasHabiles} día{a.diasHabiles === 1 ? '' : 's'}
                      </span>
                    </Td>
                    <Td><TiempoEnEtapa dias={a.diasEnEtapa} /></Td>
                    <Td className="max-w-xs text-sm">
                      {a.etapa === 'tramitada' && <span className="block font-medium text-accent-700 dark:text-accent-300">Tramitada</span>}
                      {a.folio?.numero && <span className="block">Folio <strong>{a.folio.numero}</strong></span>}
                      {a.direccionamiento?.nombreDestinatario && (
                        <span className="block">
                          Dirigida a <strong>{a.direccionamiento.nombreDestinatario}</strong>
                          {a.paraMi && <span className="ml-1.5 rounded bg-brand-600/15 px-1.5 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-300">Para ti</span>}
                        </span>
                      )}
                      {a.direccionamiento?.mensaje && (
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400" title={a.direccionamiento.mensaje}>
                          “{a.direccionamiento.mensaje}”
                        </span>
                      )}
                      {!a.folio?.numero && !a.direccionamiento?.nombreDestinatario && <span className="text-slate-400">—</span>}
                    </Td>
                    <Td className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <EnlaceSoporte ausencia={a} />
                        <Btn variante="fantasma" className="flex items-center gap-1.5" onClick={() => setDetalle(a)}>
                          <Eye className="h-4 w-4" aria-hidden="true" /> Detalle
                        </Btn>
                        {ACCIONES_POR_SECCION[activa.key].filter((t) => t !== 'tramitar' || a.etapa === 'direccionada').map((t) => {
                          const Icono = ACCIONES[t].icono
                          return (
                            <Btn
                              key={t}
                              variante="fantasma"
                              className={cn('flex items-center gap-1.5', ACCIONES[t].peligro && '!text-red-600 dark:!text-red-400')}
                              onClick={() => abrir(t, a)}
                            >
                              <Icono className="h-4 w-4" aria-hidden="true" /> {ACCIONES[t].boton}
                            </Btn>
                          )
                        })}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TablaWrap>
          )}
        </>
      )}

      <DetalleIncapacidadModal incapacidad={detalle} onCerrar={() => setDetalle(null)} />

      <Modal abierto={Boolean(accion)} titulo={meta?.titulo || ''} onCerrar={() => setAccion(null)}>
        {accion && (
          <form onSubmit={confirmar} className="space-y-4">
            <ErrorMsg>{errorForm}</ErrorMsg>

            <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
              <p className="font-medium">{nombreSolicitante(item)}</p>
              <p className="text-slate-600 dark:text-slate-300">
                {fmtFecha(item.fechaInicio)} → {fmtFecha(item.fechaFin)} · {item.diasHabiles} día{item.diasHabiles === 1 ? '' : 's'}
                {item.folio?.numero ? ` · Folio ${item.folio.numero}` : ''}
              </p>
              <EnlaceSoporte ausencia={item} className="mt-1" />
            </div>

            {tipo === 'verificar' && (
              <Field label="Observación (opcional)">
                <Textarea value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} />
              </Field>
            )}

            {tipo === 'devolver' && (
              <Field label="Qué falta o qué está mal (obligatorio)">
                <Textarea
                  required
                  placeholder="Ej.: El certificado está cortado, falta la segunda página."
                  value={form.texto}
                  onChange={(e) => setForm({ ...form, texto: e.target.value })}
                />
              </Field>
            )}

            {tipo === 'foliar' && (
              <>
                <Field label="Número de folio (opcional)">
                  <Input maxLength={40} value={form.numeroFolio} onChange={(e) => setForm({ ...form, numeroFolio: e.target.value })} />
                </Field>
                <Field label="Observación (opcional)">
                  <Textarea value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} />
                </Field>
              </>
            )}

            {tipo === 'direccionar' && (
              <>
                <Field label="Dirigida a (Talento Humano)">
                  <Select required value={form.destinatarioId} onChange={(e) => setForm({ ...form, destinatarioId: e.target.value })}>
                    <option value="" disabled>
                      {destinatarios ? 'Selecciona a quién va dirigida…' : 'Cargando…'}
                    </option>
                    {(destinatarios || []).map((u) => (
                      <option key={u._id} value={u._id}>{u.nombre || u.nombre_usuario}{u.cargo ? ` — ${u.cargo}` : ''}</option>
                    ))}
                  </Select>
                  {destinatarios && destinatarios.length === 0 && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                      Nadie tiene el permiso de recibir incapacidades. Asígnalo al rol de Talento Humano en Roles y permisos.
                    </p>
                  )}
                </Field>
                <Field label="Mensaje (opcional)">
                  <Textarea
                    placeholder="Ej.: Para trámite de nómina y reconocimiento ante la EPS."
                    value={form.texto}
                    onChange={(e) => setForm({ ...form, texto: e.target.value })}
                  />
                </Field>
              </>
            )}

            {tipo === 'tramitar' && (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Al confirmar queda registrado que Talento Humano recibió y tramitó esta incapacidad, y el trabajador recibe el aviso.
                </p>
                <Field label="Observación (opcional)">
                  <Textarea value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} />
                </Field>
              </>
            )}

            {tipo === 'completarFolio' && (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  La Gerencia la dirigió a <strong>{item.direccionamiento?.nombreDestinatario}</strong>
                  {item.direccionamiento?.mensaje ? ` con este mensaje: “${item.direccionamiento.mensaje}”` : ''}.
                  Al confirmar, queda registrado que ya lo anotaste en el folio.
                </p>
                <Field label="Observación (opcional)">
                  <Textarea value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} />
                </Field>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Btn variante="secundario" onClick={() => setAccion(null)}>Cancelar</Btn>
              <button
                type="submit"
                disabled={guardando || (tipo === 'direccionar' && !destinatarios?.length)}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60',
                  meta?.peligro ? 'panel-btn-peligro' : 'panel-btn-primario',
                )}
              >
                {guardando ? 'Guardando…' : meta?.boton}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
