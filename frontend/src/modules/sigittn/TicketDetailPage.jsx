import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Flag, Paperclip } from 'lucide-react'
import { sigittnApi } from '../../api/sigittn.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  Btn, Badge, Card, ErrorMsg, Field, Input, Select, fmtFechaHora,
} from '../../components/ui.jsx'

export default function TicketDetailPage() {
  const { id } = useParams()
  const { usuario, tieneModulo } = useAuth()
  const esAdmin = tieneModulo('sigittn')

  const [ticket, setTicket] = useState(null)
  const [catalogos, setCatalogos] = useState(null)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const finChatRef = useRef(null)

  async function cargar() {
    try {
      const data = await sigittnApi.tickets.obtener(id)
      setTicket(data.ticket)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    cargar()
    sigittnApi.catalogos.obtener().then(setCatalogos).catch(() => {})
    sigittnApi.notificaciones.marcarTodosLeidos(id).catch(() => {})

    // refresco periódico del chat mientras la página está abierta
    const intervalo = setInterval(cargar, 15000)
    return () => clearInterval(intervalo)
  }, [id])

  useEffect(() => {
    finChatRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ticket?.mensajes?.length])

  async function cambiarEstado(e) {
    try {
      const data = await sigittnApi.tickets.cambiarEstado(id, e.target.value)
      setTicket(data.ticket)
    } catch (err) {
      setError(err.message)
    }
  }

  async function asignar(e) {
    try {
      const data = await sigittnApi.tickets.actualizar(id, { id_usuario_asignado: e.target.value || null })
      setTicket(data.ticket)
    } catch (err) {
      setError(err.message)
    }
  }

  async function enviarMensaje(e) {
    e.preventDefault()
    if (!texto.trim()) return
    setEnviando(true)
    try {
      await sigittnApi.mensajes.enviarTexto(id, texto.trim())
      setTexto('')
      cargar()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  async function enviarImagen(file) {
    if (!file) return
    setEnviando(true)
    try {
      const { url } = await sigittnApi.archivos.subir(file)
      await sigittnApi.mensajes.enviarImagen(id, url)
      cargar()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (error && !ticket) return <ErrorMsg>{error}</ErrorMsg>
  if (!ticket) return <Card>Cargando…</Card>

  const cerrado = ['Resuelto', 'Cerrado'].includes(ticket.estado)

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/sigittn/tickets" className="text-sm text-cyan-700 hover:underline dark:text-cyan-400">
        ← Volver a tickets
      </Link>

      <div className="mb-4 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{ticket.titulo_ticket}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
            <Badge valor={ticket.estado} />
            <span className="inline-flex items-center gap-1">
              <Flag className="h-3 w-3" aria-hidden="true" /> {ticket.nivel_urgencia}
            </span>
            <span>{ticket.modulo_origen}</span>
            <span>Creado {fmtFechaHora(ticket.fecha_creacion_ticket)}</span>
            {ticket.fecha_cierre_ticket && <span>Cerrado {fmtFechaHora(ticket.fecha_cierre_ticket)}</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Field label="Estado">
            <Select value={ticket.estado} onChange={cambiarEstado} className="w-40">
              {(catalogos?.estados_ticket || [ticket.estado]).map((est) => (
                <option key={est} value={est}>{est}</option>
              ))}
            </Select>
          </Field>
          {esAdmin && (
            <Field label="Asignado a">
              <Select value={ticket.usuario_asignado?._id || ''} onChange={asignar} className="w-48">
                <option value="">— Sin asignar —</option>
                {(catalogos?.usuarios || []).map((u) => (
                  <option key={u._id} value={u._id}>{u.nombre}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {ticket.descripcion_ticket && (
        <Card className="mb-4">
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{ticket.descripcion_ticket}</p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Creado por {ticket.usuario_creador?.nombre || '—'}
            {ticket.usuario_asignado && <> · Asignado a {ticket.usuario_asignado.nombre}</>}
          </p>
        </Card>
      )}

      <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
        Conversación ({ticket.mensajes.length})
      </h2>

      <Card className="mb-4 max-h-[50svh] overflow-y-auto">
        {ticket.mensajes.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Aún no hay mensajes. Escribe el primero.
          </p>
        ) : (
          <div className="space-y-3">
            {ticket.mensajes.map((m) => {
              const esMio = String(m.usuario?._id || m.usuario) === String(usuario.id_usuario)
              return (
                <div key={m._id} className={`flex ${esMio ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      esMio
                        ? 'bg-cyan-600/15 text-cyan-900 ring-1 ring-inset ring-cyan-600/30 dark:bg-cyan-400/15 dark:text-cyan-50 dark:ring-cyan-400/30'
                        : 'bg-slate-900/5 text-slate-800 dark:bg-white/5 dark:text-slate-100'
                    }`}
                  >
                    {!esMio && (
                      <p className="mb-0.5 text-xs font-semibold opacity-80">
                        {m.usuario?.nombre || m.usuario?.nombre_usuario || 'Usuario'}
                      </p>
                    )}
                    {m.texto_mensaje && <p className="whitespace-pre-wrap">{m.texto_mensaje}</p>}
                    {m.url_imagen_mensaje && (
                      <a href={m.url_imagen_mensaje} target="_blank" rel="noreferrer">
                        <img
                          src={m.url_imagen_mensaje}
                          alt="Imagen adjunta"
                          className="mt-1 max-h-60 rounded-lg"
                          loading="lazy"
                        />
                      </a>
                    )}
                    <p className={`mt-1 text-right text-[10px] ${esMio ? 'text-cyan-800/70 dark:text-cyan-300/70' : 'text-slate-500 dark:text-slate-400'}`}>
                      {fmtFechaHora(m.fecha_mensaje)}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={finChatRef} />
          </div>
        )}
      </Card>

      <form onSubmit={enviarMensaje} className="flex items-center gap-2">
        <label className="panel-btn-secundario cursor-pointer rounded-lg px-3 py-2 text-sm" title="Adjuntar imagen">
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              enviarImagen(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <Input
          placeholder={cerrado ? 'El ticket está cerrado, pero aún puedes comentar…' : 'Escribe un mensaje…'}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <Btn type="submit" disabled={enviando || !texto.trim()} onClick={enviarMensaje}>
          {enviando ? '…' : 'Enviar'}
        </Btn>
      </form>
    </div>
  )
}
