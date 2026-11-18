import { useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, Plus, Ban, Clock, CircleCheck, Paperclip, Stethoscope, Pencil, PlayCircle } from 'lucide-react'
import { ausencias as ausenciasApi } from '../../api/ausencias.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { TIPOS_AUSENCIA, TIPO_AUSENCIA_LABELS, MOTIVOS_PERMISO_REMUNERADO, ETAPA_INCAPACIDAD_LABELS } from '../../config/ausenciasConstants.js'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Input, Select, Textarea, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFecha, aInputFecha,
} from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'
import SoporteMedico from './SoporteMedico.jsx'
import { useEsMovil } from '../../layout/useEsMovil.js'

const FORM_VACIO = {
  tipo: 'vacaciones',
  fechaInicio: '',
  fechaFin: '',
  horaInicio: '',
  horaFin: '',
  motivo: '',
  motivoLicencia: '',
  archivoSoporte: null,
}

// Espejo en cliente de contarDias() del backend
// (Backend/src/modules/ausencias/ausencias.service.js). Solo para previsualizar
// mientras se llena el formulario: el backend recalcula y su número es el que
// se guarda. Cuenta TODOS los días del rango — el Terminal opera 24/7, no hay
// "día no hábil" que restar.
function diasEstimados(desde, hasta) {
  if (!desde || !hasta) return 0
  const inicio = new Date(`${desde}T00:00:00`)
  const fin = new Date(`${hasta}T00:00:00`)
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin < inicio) return 0
  return Math.round((fin.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000)) + 1
}

// "08:00" y "10:30" -> "2 h 30 min". Solo para mostrarle al usuario lo que
// está pidiendo mientras llena las horas; el backend es quien valida.
function duracionEstimada(horaInicio, horaFin) {
  if (!horaInicio || !horaFin) return ''
  const [hi, mi] = horaInicio.split(':').map(Number)
  const [hf, mf] = horaFin.split(':').map(Number)
  const minutos = hf * 60 + mf - (hi * 60 + mi)
  if (minutos <= 0) return ''
  const horas = Math.floor(minutos / 60)
  const restoMin = minutos % 60
  const partes = []
  if (horas > 0) partes.push(`${horas} h`)
  if (restoMin > 0) partes.push(`${restoMin} min`)
  return partes.join(' ')
}

// Lo último que SIG le pidió corregir, para mostrarlo junto a la solicitud.
function motivoDeDevolucion(ausencia) {
  const devoluciones = (ausencia.historial || []).filter((h) => h.accion === 'devuelta')
  return devoluciones.at(-1)?.nota || ''
}

// Una incapacidad no la decide una sola persona: pasa por SIG, Gerencia y
// Talento Humano. Aquí se le cuenta al trabajador en qué punto va.
function EstadoIncapacidad({ ausencia: a }) {
  if (a.etapa === 'devuelta') {
    return (
      <span className="block text-red-600 dark:text-red-400">
        <span className="font-medium">Devuelta, necesita corrección</span>
        {motivoDeDevolucion(a) && <span className="mt-0.5 block text-xs">{motivoDeDevolucion(a)}</span>}
      </span>
    )
  }
  if (a.etapa === 'en_verificacion') {
    return (
      <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <Clock className="h-4 w-4" aria-hidden="true" /> {ETAPA_INCAPACIDAD_LABELS.en_verificacion}
      </span>
    )
  }
  const tramitada = a.etapa === 'tramitada'
  return (
    <span className="block">
      <span className="flex items-center gap-1.5">
        <CircleCheck className="h-4 w-4 text-accent-600 dark:text-accent-400" aria-hidden="true" />
        Verificada y aprobada{a.decision?.nombreRevisor ? ` por ${a.decision.nombreRevisor}` : ''}
      </span>
      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
        {tramitada
          ? 'Tramitada por Talento Humano'
          : a.etapa === 'direccionada'
          ? `En Talento Humano${a.direccionamiento?.nombreDestinatario ? ` · dirigida a ${a.direccionamiento.nombreDestinatario}` : ''}`
          : 'En trámite administrativo'}
      </span>
    </span>
  )
}

export default function MisAusenciasPage() {
  const { data, cargando, error, recargar } = useDatosConCache(
    'ausencias:mias',
    () => ausenciasApi.mias().then((d) => d.ausencias),
    { ttlMs: 30_000 },
  )
  const lista = data || []
  const esMovil = useEsMovil()
  const [ok, setOk] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [soporteOcupado, setSoporteOcupado] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  const [tutorialAbierto, setTutorialAbierto] = useState(false)

  const [porCancelar, setPorCancelar] = useState(null)
  const [cancelando, setCancelando] = useState(false)

  // Corrección de una incapacidad devuelta por SIG.
  const [porCorregir, setPorCorregir] = useState(null)
  const [formCorreccion, setFormCorreccion] = useState({ fechaInicio: '', fechaFin: '', comentario: '', archivo: null })
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [errorCorreccion, setErrorCorreccion] = useState('')
  const [correccionOcupada, setCorreccionOcupada] = useState(false)

  // `tipo` permite abrir el formulario ya posicionado (p. ej. el atajo
  // "Reportar incapacidad"): la incapacidad es lo que más se reporta con
  // prisa y no debería exigir buscarla en el desplegable.
  function abrirNueva(tipo = 'vacaciones') {
    setForm({ ...FORM_VACIO, tipo })
    setErrorForm('')
    setModalAbierto(true)
  }

  async function solicitar(e) {
    e.preventDefault()
    setErrorForm('')
    // Ya no hay <input required> (el soporte lo arma SoporteMedico), así que
    // la validación va aquí; el backend igual la repite.
    if (form.tipo === 'incapacidad' && !form.archivoSoporte) {
      setErrorForm('Adjunta el soporte médico: toma fotos del certificado o sube el PDF.')
      return
    }
    setGuardando(true)
    try {
      // Con archivo (incapacidad) hay que mandar multipart; sin archivo, el
      // JSON de siempre — ver api/ausencias.js.
      const { archivoSoporte, ...resto } = form
      // El horario solo tiene sentido en un único día: si el usuario lo llenó
      // y luego cambió las fechas a un rango, no lo arrastramos (el backend
      // lo rechazaría de todas formas).
      if (resto.fechaInicio !== resto.fechaFin) {
        resto.horaInicio = ''
        resto.horaFin = ''
      }
      let payload = resto
      if (archivoSoporte) {
        const fd = new FormData()
        for (const [clave, valor] of Object.entries(resto)) {
          if (valor) fd.append(clave, valor)
        }
        fd.append('soporte', archivoSoporte)
        payload = fd
      }
      await ausenciasApi.crear(payload)
      setOk('Solicitud enviada. Te avisaremos cuando haya una decisión.')
      setModalAbierto(false)
      recargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  function abrirCorreccion(ausencia) {
    setPorCorregir(ausencia)
    setFormCorreccion({
      fechaInicio: aInputFecha(ausencia.fechaInicio),
      fechaFin: aInputFecha(ausencia.fechaFin),
      comentario: '',
      archivo: null,
    })
    setErrorCorreccion('')
  }

  async function reenviar(e) {
    e.preventDefault()
    setErrorCorreccion('')
    setCorrigiendo(true)
    try {
      // Solo se mandan las fechas que cambiaron: así "no tocar nada" no cuenta
      // como una corrección.
      const datos = { comentario: formCorreccion.comentario }
      if (formCorreccion.fechaInicio !== aInputFecha(porCorregir.fechaInicio)) datos.fechaInicio = formCorreccion.fechaInicio
      if (formCorreccion.fechaFin !== aInputFecha(porCorregir.fechaFin)) datos.fechaFin = formCorreccion.fechaFin
      let payload = datos
      if (formCorreccion.archivo) {
        payload = new FormData()
        for (const [clave, valor] of Object.entries(datos)) if (valor) payload.append(clave, valor)
        payload.append('soporte', formCorreccion.archivo)
      }
      await ausenciasApi.reenviarIncapacidad(porCorregir._id, payload)
      setOk('Incapacidad corregida y enviada de nuevo a verificación.')
      setPorCorregir(null)
      recargar()
    } catch (err) {
      setErrorCorreccion(err.message)
    } finally {
      setCorrigiendo(false)
    }
  }

  async function confirmarCancelar() {
    if (!porCancelar) return
    setOk('')
    setCancelando(true)
    try {
      await ausenciasApi.cancelar(porCancelar._id)
      setOk('Solicitud cancelada')
      recargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      // Se cierra pase lo que pase: el aviso (OkMsg/ErrorMsg) vive en la
      // página y el overlay del diálogo lo taparía.
      setCancelando(false)
      setPorCancelar(null)
    }
  }

  // Piezas que comparten la tarjeta (celular) y la tabla (escritorio).
  function TipoConSoporte({ ausencia: a }) {
    const urlSoporte = a.soporte?.archivo
      ? ausenciasApi.urlSoporte(a._id, a.soporte.archivo)
      : (a.soporte?.url || null)
    return (
      <span className="flex items-center gap-1.5">
        <Badge valor={a.tipo} />
        {urlSoporte && (
          <a
            href={urlSoporte}
            target="_blank"
            rel="noreferrer"
            title={a.soporte?.nombreArchivo || 'Ver soporte médico'}
            className="text-brand-700 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300"
          >
            <Paperclip className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </span>
    )
  }

  function Decision({ ausencia: a }) {
    const enTramite = a.tipo === 'incapacidad' && a.etapa
    return (
      <>
        {enTramite && a.estado !== 'cancelada' && <EstadoIncapacidad ausencia={a} />}
        {a.estado === 'rechazada' && a.decision?.motivoRechazo}
        {a.estado === 'aprobada' && !enTramite && (
          <span className="flex items-center gap-1.5">
            <CircleCheck className="h-4 w-4 text-accent-600 dark:text-accent-400" aria-hidden="true" />
            {a.decision?.nombreRevisor || 'Aprobada'}
          </span>
        )}
        {a.estado === 'pendiente' && !enTramite && (
          <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <Clock className="h-4 w-4" aria-hidden="true" /> En revisión
          </span>
        )}
      </>
    )
  }

  function Acciones({ ausencia: a, className = 'justify-end' }) {
    if (a.estado !== 'pendiente') return null
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {a.etapa === 'devuelta' && (
          <Btn variante="fantasma" className="flex items-center gap-1.5" onClick={() => abrirCorreccion(a)}>
            <Pencil className="h-4 w-4" aria-hidden="true" /> Corregir
          </Btn>
        )}
        <Btn variante="fantasma" className="flex items-center gap-1.5" onClick={() => setPorCancelar(a)}>
          <Ban className="h-4 w-4" aria-hidden="true" /> Retirar
        </Btn>
      </div>
    )
  }

  const dias = diasEstimados(form.fechaInicio, form.fechaFin)
  const esUnSoloDia = Boolean(form.fechaInicio) && form.fechaInicio === form.fechaFin
  const duracion = esUnSoloDia ? duracionEstimada(form.horaInicio, form.horaFin) : ''

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <CalendarDays className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden="true" />
          Mis vacaciones y ausencias
        </h1>
        <div className="flex flex-wrap justify-end gap-2">
          <Btn variante="secundario" className="flex items-center gap-1.5" onClick={() => abrirNueva('incapacidad')}>
            <Stethoscope className="h-4 w-4" aria-hidden="true" /> Reportar incapacidad
          </Btn>
          <Btn className="flex items-center gap-1.5" onClick={() => abrirNueva()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Solicitar
          </Btn>
        </div>
      </div>

      <div className="mb-4">
        <Btn variante="secundario" className="flex items-center gap-1.5" onClick={() => setTutorialAbierto(true)}>
          <PlayCircle className="h-4 w-4" aria-hidden="true" /> ¿No sabes cómo gestionar tu incapacidad?
        </Btn>
      </div>

      <Modal abierto={tutorialAbierto} titulo="Tutorial: cómo gestionar tu incapacidad" ancho="max-w-4xl" onCerrar={() => setTutorialAbierto(false)}>
        {tutorialAbierto && (
          <video className="w-full rounded-lg bg-black" src="/tutoriales/gestion-incapacidad.mp4" controls autoPlay preload="metadata" />
        )}
      </Modal>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="Todavía no has solicitado vacaciones, permisos ni incapacidades" />
      ) : esMovil ? (
        // En el celular una tabla de 7 columnas no cabe: el estado y los botones
        // (Corregir, Retirar) quedaban fuera de la pantalla. Cada ausencia va
        // en una tarjeta con todo a la vista.
        <ul className="space-y-3">
          {lista.map((a) => (
            <li key={a._id}>
              <Card className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <TipoConSoporte ausencia={a} />
                  <Badge valor={a.estado} />
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {fmtFecha(a.fechaInicio)} → {fmtFecha(a.fechaFin)} · {a.diasHabiles} día{a.diasHabiles === 1 ? '' : 's'}
                  {a.horaInicio && <span className="block text-xs">{a.horaInicio}–{a.horaFin}</span>}
                </p>
                <div className="text-sm text-slate-600 dark:text-slate-300"><Decision ausencia={a} /></div>
                <Acciones ausencia={a} className="justify-start" />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Tipo</Th>
              <Th>Desde</Th>
              <Th>Hasta</Th>
              <Th>Días</Th>
              <Th>Estado</Th>
              <Th>Decisión</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => (
              <tr key={a._id}>
                <Td><TipoConSoporte ausencia={a} /></Td>
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
                <Td><Badge valor={a.estado} /></Td>
                <Td className="text-sm text-slate-600 dark:text-slate-300"><Decision ausencia={a} /></Td>
                <Td className="text-right"><Acciones ausencia={a} /></Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Modal abierto={modalAbierto} titulo="Solicitar ausencia" ancho="max-w-2xl" onCerrar={() => setModalAbierto(false)}>
        <form onSubmit={solicitar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>

          <Field label="Tipo">
            <Select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value, motivoLicencia: '', archivoSoporte: null })}
            >
              {TIPOS_AUSENCIA.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Desde">
              <Input
                type="date"
                required
                value={form.fechaInicio}
                onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })}
              />
            </Field>
            <Field label="Hasta">
              <Input
                type="date"
                required
                value={form.fechaFin}
                min={form.fechaInicio || undefined}
                onChange={(e) => setForm({ ...form, fechaFin: e.target.value })}
              />
            </Field>
          </div>

          {dias > 0 && (
            <p className="panel-mono text-xs text-brand-700 dark:text-brand-400">
              {dias} día{dias === 1 ? '' : 's'}
            </p>
          )}

          {/* Horario opcional, solo tiene sentido si la ausencia es de UN
              solo día: p. ej. un permiso de un par de horas para una cita
              médica no debería consumir el día completo. El Terminal es
              24/7, así que no hay "horario laboral" fijo que asumir — se
              pide explícito. */}
          {esUnSoloDia && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hora inicio (opcional)">
                <Input
                  type="time"
                  value={form.horaInicio}
                  onChange={(e) => setForm({ ...form, horaInicio: e.target.value })}
                />
              </Field>
              <Field label="Hora fin (opcional)">
                <Input
                  type="time"
                  value={form.horaFin}
                  onChange={(e) => setForm({ ...form, horaFin: e.target.value })}
                />
              </Field>
            </div>
          )}

          {duracion && (
            <p className="panel-mono text-xs text-brand-700 dark:text-brand-400">Duración: {duracion}</p>
          )}

          {/* El motivo legal solo aplica al permiso remunerado: es el respaldo
              del art. 57 CST que le permite a Talento Humano pagarlo (ver
              MOTIVOS_PERMISO_REMUNERADO en Backend/src/models/Ausencia.js). */}
          {form.tipo === 'permiso_remunerado' && (
            <Field label="Motivo legal (art. 57 CST)">
              <Select
                required
                value={form.motivoLicencia}
                onChange={(e) => setForm({ ...form, motivoLicencia: e.target.value })}
              >
                <option value="" disabled>Selecciona un motivo…</option>
                {MOTIVOS_PERMISO_REMUNERADO.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </Select>
            </Field>
          )}

          {/* La incapacidad es el único tipo que exige soporte: el backend la
              rechaza sin él (ver ausencias.service.js). */}
          {form.tipo === 'incapacidad' && (
            <Field label="Soporte médico (fotos o PDF)">
              <SoporteMedico
                onChange={(archivo) => setForm((f) => ({ ...f, archivoSoporte: archivo }))}
                onOcupado={setSoporteOcupado}
              />
            </Field>
          )}

          <Field label="Motivo (opcional)">
            <Textarea value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalAbierto(false)}>Cancelar</Btn>
            <button
              type="submit"
              disabled={guardando || soporteOcupado}
              className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60"
            >
              {guardando ? 'Enviando…' : soporteOcupado ? 'Preparando soporte…' : 'Enviar solicitud'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal abierto={Boolean(porCorregir)} titulo="Corregir incapacidad" ancho="max-w-2xl" onCerrar={() => setPorCorregir(null)}>
        {porCorregir && (
          <form onSubmit={reenviar} className="space-y-4">
            <ErrorMsg>{errorCorreccion}</ErrorMsg>

            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              <p className="font-medium">SIG la devolvió con este comentario:</p>
              <p className="whitespace-pre-line">{motivoDeDevolucion(porCorregir) || 'Sin comentario.'}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Desde">
                <Input type="date" required value={formCorreccion.fechaInicio}
                  onChange={(e) => setFormCorreccion({ ...formCorreccion, fechaInicio: e.target.value })} />
              </Field>
              <Field label="Hasta">
                <Input type="date" required min={formCorreccion.fechaInicio || undefined} value={formCorreccion.fechaFin}
                  onChange={(e) => setFormCorreccion({ ...formCorreccion, fechaFin: e.target.value })} />
              </Field>
            </div>

            <Field label="Soporte médico nuevo (opcional si solo corriges las fechas)">
              <SoporteMedico
                onChange={(archivo) => setFormCorreccion((f) => ({ ...f, archivo }))}
                onOcupado={setCorreccionOcupada}
              />
            </Field>

            <Field label="Comentario para SIG (opcional)">
              <Textarea value={formCorreccion.comentario}
                onChange={(e) => setFormCorreccion({ ...formCorreccion, comentario: e.target.value })} />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Btn variante="secundario" onClick={() => setPorCorregir(null)}>Cancelar</Btn>
              <button
                type="submit"
                disabled={corrigiendo || correccionOcupada}
                className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60"
              >
                {corrigiendo ? 'Enviando…' : correccionOcupada ? 'Preparando soporte…' : 'Reenviar a verificación'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        abierto={Boolean(porCancelar)}
        onCancelar={() => setPorCancelar(null)}
        onConfirmar={confirmarCancelar}
        cargando={cancelando}
        titulo="¿Retirar esta solicitud?"
        descripcion={
          porCancelar
            ? `${TIPO_AUSENCIA_LABELS[porCancelar.tipo] || porCancelar.tipo} del ${fmtFecha(porCancelar.fechaInicio)}. Si la retiras tendrás que volver a solicitarla.`
            : ''
        }
        confirmarLabel="Retirar"
      />
    </div>
  )
}
