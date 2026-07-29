import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Flag, Paperclip } from 'lucide-react'
import { soporte as soporteApi } from '../../api/soporte.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Btn, Badge, Card, ErrorMsg, Input, fmtFechaHora } from '../../components/ui.jsx'

export default function SoporteDetallePage() {
  const { id } = useParams()
  const { usuario } = useAuth()

  const [ticket, setTicket] = useState(null)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const finChatRef = useRef(null)

  async function cargar() {
    try {
      const data = await soporteApi.obtener(id)
      setTicket(data.ticket)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    cargar()
    soporteApi.mensajes.marcarTodosLeidos(id).catch(() => {})

    // refresco periódico del chat mientras la página está abierta
    const intervalo = setInterval(cargar, 15000)
    return () => clearInterval(intervalo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    finChatRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ticket?.mensajes?.length])

  async function enviarMensaje(e) {
    e.preventDefault()
    if (!texto.trim()) return
    setEnviando(true)
    try {
      await soporteApi.mensajes.enviarTexto(id, texto.trim())
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
      const { url } = await soporteApi.archivos.subir(file)
      await soporteApi.mensajes.enviarImagen(id, url)
      cargar()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (error && !ticket) return <ErrorMsg>{error}</ErrorMsg>
  if (!ticket) return <p className="text-sm text-[var(--mobile-text-dim)]">Cargando…</p>

  const cerrado = ['Resuelto', 'Cerrado'].includes(ticket.estado)

  return (
    <div className="mx-auto flex max-w-md flex-col md:max-w-2xl">
      <Link to="/soporte" className="mb-2 flex w-fit items-center gap-1 text-sm text-[var(--mobile-accent)]">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Mis solicitudes
      </Link>

      <div className="mb-3">
        <h1 className="text-xl font-bold text-[var(--mobile-text)]">{ticket.titulo_ticket}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--mobile-text-dim)]">
          <Badge valor={ticket.estado} />
          <span className="inline-flex items-center gap-1">
            <Flag className="h-3 w-3" aria-hidden="true" /> {ticket.nivel_urgencia}
          </span>
          <span>Creado {fmtFechaHora(ticket.fecha_creacion_ticket)}</span>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {ticket.descripcion_ticket && (
        <div className="m-card mb-4 rounded-2xl p-3">
          <p className="whitespace-pre-wrap text-sm text-[var(--mobile-text)]">{ticket.descripcion_ticket}</p>
          {ticket.usuario_asignado && (
            <p className="mt-2 text-xs text-[var(--mobile-text-dim)]">Te está atendiendo {ticket.usuario_asignado.nombre}</p>
          )}
        </div>
      )}

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
                        {m.usuario?.nombre || m.usuario?.nombre_usuario || 'Soporte'}
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

      <form onSubmit={enviarMensaje} className="flex items-center gap-2 pb-2">
        <label className="panel-btn-secundario cursor-pointer rounded-lg px-3 py-2 text-sm" title="Adjuntar foto">
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              enviarImagen(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <Input
          placeholder={cerrado ? 'La solicitud está cerrada, pero aún puedes comentar…' : 'Escribe un mensaje…'}
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
