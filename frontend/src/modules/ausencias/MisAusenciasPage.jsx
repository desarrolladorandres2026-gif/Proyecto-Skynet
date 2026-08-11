import { useEffect, useState } from 'react'
import { CalendarDays, Plus, Ban, Clock, CircleCheck, Paperclip } from 'lucide-react'
import { ausencias as ausenciasApi } from '../../api/ausencias.js'
import { TIPOS_AUSENCIA, MOTIVOS_PERMISO_REMUNERADO } from '../../config/ausenciasConstants.js'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Input, Select, Textarea, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFecha,
} from '../../components/ui.jsx'

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

export default function MisAusenciasPage() {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const datosLista = await ausenciasApi.mias()
      setLista(datosLista.ausencias)
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

  function abrirNueva() {
    setForm(FORM_VACIO)
    setErrorForm('')
    setModalAbierto(true)
  }

  async function solicitar(e) {
    e.preventDefault()
    setGuardando(true)
    setErrorForm('')
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
      cargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function cancelar(ausencia) {
    if (!window.confirm(`¿Retirar tu solicitud de ${ausencia.tipo} del ${fmtFecha(ausencia.fechaInicio)}?`)) return
    try {
      await ausenciasApi.cancelar(ausencia._id)
      setOk('Solicitud cancelada')
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const dias = diasEstimados(form.fechaInicio, form.fechaFin)
  const esUnSoloDia = Boolean(form.fechaInicio) && form.fechaInicio === form.fechaFin
  const duracion = esUnSoloDia ? duracionEstimada(form.horaInicio, form.horaFin) : ''

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <CalendarDays className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Mis vacaciones y ausencias
        </h1>
        <Btn className="flex items-center gap-1.5" onClick={abrirNueva}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Solicitar
        </Btn>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : lista.length === 0 ? (
        <EmptyState mensaje="Todavía no has solicitado vacaciones, permisos ni incapacidades" />
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
                <Td><Badge valor={a.tipo} /></Td>
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
                <Td className="text-sm text-slate-600 dark:text-slate-300">
                  {a.estado === 'rechazada' && a.decision?.motivoRechazo}
                  {a.estado === 'aprobada' && (
                    <span className="flex items-center gap-1.5">
                      <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      {a.decision?.nombreRevisor || 'Aprobada'}
                    </span>
                  )}
                  {a.estado === 'pendiente' && (
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Clock className="h-4 w-4" aria-hidden="true" /> En revisión
                    </span>
                  )}
                </Td>
                <Td className="text-right">
                  {a.estado === 'pendiente' && (
                    <Btn variante="fantasma" className="flex items-center gap-1.5" onClick={() => cancelar(a)}>
                      <Ban className="h-4 w-4" aria-hidden="true" /> Retirar
                    </Btn>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Modal abierto={modalAbierto} titulo="Solicitar ausencia" onCerrar={() => setModalAbierto(false)}>
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
            <p className="panel-mono text-xs text-cyan-700 dark:text-cyan-400">
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
            <p className="panel-mono text-xs text-cyan-700 dark:text-cyan-400">Duración: {duracion}</p>
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
            <Field label="Soporte médico (foto o PDF)">
              <input
                type="file"
                required
                accept="image/*,application/pdf"
                onChange={(e) => setForm({ ...form, archivoSoporte: e.target.files?.[0] || null })}
                className="panel-input w-full rounded-lg px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-cyan-600/10 file:px-3 file:py-1 file:text-cyan-700 dark:file:bg-cyan-400/10 dark:file:text-cyan-300"
              />
              {form.archivoSoporte && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Paperclip className="h-3.5 w-3.5" aria-hidden="true" /> {form.archivoSoporte.name}
                </p>
              )}
            </Field>
          )}

          <Field label="Motivo (opcional)">
            <Textarea value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalAbierto(false)}>Cancelar</Btn>
            <button
              type="submit"
              disabled={guardando}
              className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60"
            >
              {guardando ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
