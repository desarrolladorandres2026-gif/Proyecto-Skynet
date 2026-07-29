import { useEffect, useState } from 'react'
import { Plus, MessageCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { soporte as soporteApi } from '../../api/soporte.js'
import { Badge, ErrorMsg, Field, Input, Textarea, Select, EmptyState, fmtFechaHora } from '../../components/ui.jsx'
import { ListRow, SectionHeader, FAB, BottomSheet } from '../../components/mobileUi.jsx'

const NIVELES = [
  { value: 'Baja', label: 'Baja' },
  { value: 'Media', label: 'Media' },
  { value: 'Alta', label: 'Alta' },
]

const FORM_VACIO = { titulo_ticket: '', descripcion_ticket: '', nivel_urgencia: 'Media' }

export default function SoportePage() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [enviando, setEnviando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const data = await soporteApi.mios()
      setTickets(data.tickets)
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

  const upd = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  async function crear(e) {
    e.preventDefault()
    setEnviando(true)
    setErrorForm('')
    try {
      const { ticket } = await soporteApi.crear(form)
      setAbierto(false)
      setForm(FORM_VACIO)
      navigate(`/soporte/${ticket._id}`)
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto max-w-md md:max-w-2xl">
      <h1 className="mb-1 text-xl font-bold text-[var(--mobile-text)]">Soporte</h1>
      <p className="mb-4 text-sm text-[var(--mobile-text-dim)]">
        Pide ayuda o cuenta un problema. Podrás conversar aquí mismo con quien te atienda.
      </p>

      <ErrorMsg>{error}</ErrorMsg>

      <SectionHeader className="flex items-center gap-2">
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Mis solicitudes
      </SectionHeader>

      {cargando ? (
        <p className="text-sm text-[var(--mobile-text-dim)]">Cargando…</p>
      ) : tickets.length === 0 ? (
        <EmptyState mensaje="Aún no has creado ninguna solicitud de soporte" />
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((t) => (
            <ListRow
              key={t._id}
              icon={MessageCircle}
              onClick={() => navigate(`/soporte/${t._id}`)}
              title={t.titulo_ticket}
              subtitle={`${fmtFechaHora(t.fecha_creacion_ticket)}${t.usuario_asignado?.nombre ? ` · ${t.usuario_asignado.nombre}` : ''}`}
              badge={<Badge valor={t.estado} />}
            />
          ))}
        </div>
      )}

      <FAB icon={Plus} label="Nueva solicitud de soporte" onClick={() => { setForm(FORM_VACIO); setErrorForm(''); setAbierto(true) }} />

      <BottomSheet abierto={abierto} titulo="Nueva solicitud de soporte" onCerrar={() => setAbierto(false)}>
        <form onSubmit={crear} className="flex flex-col gap-4">
          <ErrorMsg>{errorForm}</ErrorMsg>

          <Field label="Título">
            <Input required value={form.titulo_ticket} onChange={upd('titulo_ticket')} placeholder="Ej: No me llega el correo institucional" />
          </Field>

          <Field label="Cuéntanos más">
            <Textarea value={form.descripcion_ticket} onChange={upd('descripcion_ticket')} placeholder="Describe qué pasó, desde cuándo y cualquier detalle útil…" />
          </Field>

          <Field label="Urgencia">
            <Select value={form.nivel_urgencia} onChange={upd('nivel_urgencia')}>
              {NIVELES.map((n) => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </Select>
          </Field>

          <button
            type="submit"
            disabled={enviando}
            className="panel-btn-primario w-full rounded-2xl py-3 text-sm font-medium transition disabled:opacity-60"
          >
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      </BottomSheet>
    </div>
  )
}
