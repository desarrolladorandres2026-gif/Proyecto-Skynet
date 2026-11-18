import { useEffect, useRef, useState } from 'react'
import { Check, Clock, Download, FileDown, Inbox, Info, Mail, MailCheck, MailWarning, Paperclip, PlayCircle, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../auth/AuthContext.jsx'
import { sitioWebApi } from '../../api/sitioWeb.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Badge, Btn, ErrorMsg, Field, Input, Modal, Pager, Td, Textarea, Th, fmtFecha, fmtFechaHora } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'
import { generarPdfRadicado } from '../../pdf/radicadoPdf.js'
import { EncabezadoSeccion } from './comun.jsx'
import ModalFormatoPqrsdf from './ModalFormatoPqrsdf.jsx'

const POR_PAGINA = 15

// En la tabla no hay espacio para el texto largo: las etiquetas completas quedan para filtros y detalle.
const ETIQUETA_CORTA = { sin_leer: 'Sin leer', leido: 'Leído', tramitado: 'Tramitado' }
const ETIQUETA = { sin_leer: 'Sin leer', leido: 'Leído / en revisión', tramitado: 'Tramitado / resuelto' }
// Valores de BADGE_COLORES (ui.jsx): ámbar / azul / verde.
const COLOR = { sin_leer: 'pendiente', leido: 'programado', tramitado: 'finalizado' }

// "YYYY-MM-DD HH:mm:ss" (hora del sitio) -> Date válido en todos los navegadores.
const fecha = (valor) => fmtFechaHora(valor ? String(valor).replace(' ', 'T') : '')
const soloFecha = (valor) => fmtFecha(valor ? String(valor).replace(' ', 'T') : '')


// Nombre legible del adjunto: último tramo de la URL de la mediateca.
function nombreAdjunto(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'archivo adjunto'
  } catch {
    return 'archivo adjunto'
  }
}

function guardarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

const MAX_NOTA = 3000
const MAX_PDF_MB = 10

// Etapas del trámite, en orden. Cada una corresponde a un estado que el
// ciudadano ve al consultar su radicado.
const ETAPAS = [
  { estado: 'sin_leer', titulo: 'Recibido', detalle: 'Sin leer' },
  { estado: 'leido', titulo: 'En revisión', detalle: 'Leído' },
  { estado: 'tramitado', titulo: 'Resuelto', detalle: 'Tramitado' },
]

// Clases completas (Tailwind no resuelve nombres armados con variables).
const TONO = {
  sin_leer: {
    chip: 'bg-warn-400/10 text-warn-700 ring-warn-400/40 dark:text-warn-300',
    punto: 'bg-warn-500',
    activa: 'border-warn-500/60 bg-warn-400/10',
  },
  leido: {
    chip: 'bg-brand-400/10 text-brand-700 ring-brand-400/40 dark:text-brand-300',
    punto: 'bg-brand-500',
    activa: 'border-brand-500/60 bg-brand-400/10',
  },
  tramitado: {
    chip: 'bg-accent-400/10 text-accent-700 ring-accent-400/40 dark:text-accent-300',
    punto: 'bg-accent-500',
    activa: 'border-accent-500/60 bg-accent-400/10',
  },
}

const aDate = (valor) => {
  const d = new Date(valor ? String(valor).replace(' ', 'T') : '')
  return Number.isNaN(d.getTime()) ? null : d
}

// Días calendario entre dos fechas (nunca negativo).
const diasEntre = (desde, hasta) => Math.max(0, Math.floor((hasta - desde) / 86_400_000))
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

function Seccion({ numero, titulo, nota, className = '', children }) {
  return (
    <section aria-labelledby={`sec-${numero}`} className={`flex min-h-0 flex-col rounded-xl border border-slate-200/80 dark:border-slate-800/80 ${className}`}>
      <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 border-b border-slate-200/80 px-3 py-2 dark:border-slate-800/80">
        <h3 id={`sec-${numero}`} className="panel-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">
          <span className="mr-2 text-brand-600 dark:text-brand-300">{numero}</span>
          {titulo}
        </h3>
        {nota && <p className="text-[11px] text-slate-500 dark:text-slate-400">{nota}</p>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  )
}

function DatoMeta({ etiqueta, children }) {
  return (
    <div className="min-w-0">
      <dt className="panel-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{etiqueta}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  )
}

function Aviso({ children }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-warn-400/30 bg-warn-400/10 px-3 py-2 text-xs text-warn-700 dark:text-warn-300">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

// Constancia de una respuesta: si el correo con la respuesta salió hacia quien
// hizo la petición. Las respuestas anteriores a este registro no la tienen.
function EstadoCorreo({ radicadoId, constancia, onActualizar }) {
  const [reenviando, setReenviando] = useState(false)

  async function reenviar() {
    setReenviando(true)
    try {
      const res = await sitioWebApi.reenviarCorreoRespuesta(radicadoId, constancia.id)
      if (res.avisoCorreo) toast.warning(res.avisoCorreo)
      else toast.success('Correo reenviado al solicitante')
      onActualizar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setReenviando(false)
    }
  }

  const base = 'mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'
  if (!constancia) {
    return (
      <p className={`${base} text-slate-500 dark:text-slate-400`}>
        <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Sin constancia de envío por correo (respuesta anterior a este registro).
      </p>
    )
  }
  const { correo } = constancia
  if (correo.estado === 'enviado') {
    return (
      <p className={`${base} text-accent-700 dark:text-accent-300`}>
        <MailCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="break-all">
          Enviada por correo a {correo.destinatario} · {fecha(correo.enviadoEn)}
          {correo.adjuntoIncluido ? ' · con el PDF adjunto' : ''}
        </span>
      </p>
    )
  }
  if (correo.estado === 'sin_correo') {
    return (
      <p className={`${base} text-warn-700 dark:text-warn-300`}>
        <MailWarning className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        La solicitud no trae un correo válido: esta respuesta no se envió por correo.
      </p>
    )
  }
  if (correo.estado === 'no_enviado') {
    return (
      <div className={`${base} text-slate-500 dark:text-slate-400`}>
        <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="break-all">No se envió por correo (decisión de quien respondió).</span>
        <Btn type="button" variante="secundario" onClick={reenviar} disabled={reenviando}>
          {reenviando ? 'Enviando…' : `Enviar a ${correo.destinatario}`}
        </Btn>
      </div>
    )
  }
  return (
    <div className={`${base} text-red-600 dark:text-red-400`}>
      <MailWarning className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="break-all">No se pudo enviar el correo a {correo.destinatario}.</span>
      <Btn type="button" variante="secundario" onClick={reenviar} disabled={reenviando}>
        {reenviando ? 'Reenviando…' : 'Reenviar correo'}
      </Btn>
    </div>
  )
}

// Respuestas ya publicadas, en orden, con la constancia de envío por correo.
function HistorialRespuestas({ radicado, onActualizar }) {
  if (radicado.respuestas.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Aún no se ha publicado ninguna respuesta oficial para este radicado.</p>
  }
  return (
    <ol className="relative ml-1.5 space-y-3 border-l border-slate-200 pl-5 dark:border-slate-800">
      {radicado.respuestas.map((r, i) => (
        <li key={r.id} className="relative">
          <span className="absolute -left-[1.62rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white dark:ring-slate-900" aria-hidden="true" />
          <p className="panel-mono text-[11px] text-slate-500 dark:text-slate-400">
            Respuesta {i + 1} · {fecha(r.constancia?.fecha || r.fecha)}
            {r.constancia?.respondidoPor || r.autor ? ` · Respondió: ${r.constancia?.respondidoPor || r.autor}` : ''}
          </p>
          {r.nota && <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-slate-900 dark:text-slate-100">{r.nota}</p>}
          {r.archivoUrl && (
            <a
              href={r.archivoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1.5 break-all text-[13px] text-brand-600 underline dark:text-brand-400"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {r.archivoNombre || 'documento.pdf'}
            </a>
          )}
          <EstadoCorreo radicadoId={radicado.id} constancia={r.constancia} onActualizar={onActualizar} />
        </li>
      ))}
    </ol>
  )
}


// Lo que escribas aquí aparece en la consulta pública del radicado
// (elterminalneiva.com → Consultar estado de radicado), junto con el PDF, y se
// envía por correo a quien hizo la petición.
function RespuestaCiudadano({ radicado, onEnviada, onActualizar }) {
  const [nota, setNota] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [enviarCorreo, setEnviarCorreo] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [claveArchivo, setClaveArchivo] = useState(0)

  function elegirArchivo(e) {
    const f = e.target.files?.[0] || null
    if (f && f.size > MAX_PDF_MB * 1024 * 1024) {
      toast.error(`El PDF supera el máximo de ${MAX_PDF_MB} MB`)
      setClaveArchivo((k) => k + 1)
      return
    }
    setArchivo(f)
  }

  async function enviar(e) {
    e.preventDefault()
    setEnviando(true)
    try {
      const res = await sitioWebApi.responderRadicado(radicado.id, { nota, archivo, enviarCorreo: enviarCorreo && Boolean(radicado.correoRespuesta) })
      const correo = res.constancia?.correo
      toast.success(
        correo?.estado === 'enviado'
          ? `Respuesta publicada y enviada por correo a ${correo.destinatario}`
          : res.constancia?.correo?.estado === 'no_enviado'
            ? 'Respuesta publicada sin enviar correo: el ciudadano la verá al consultar su radicado'
            : 'Respuesta publicada: el ciudadano la verá al consultar su radicado',
      )
      if (res.avisoCorreo) toast.warning(res.avisoCorreo)
      if (res.avisoEstado) toast.warning(res.avisoEstado)
      setNota('')
      setArchivo(null)
      setClaveArchivo((k) => k + 1)
      onEnviada(res)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2.5 lg:h-full">
      <Field label={`Texto de la respuesta (${nota.length}/${MAX_NOTA})`} className="flex min-h-0 flex-1 flex-col">
        <Textarea
          rows={4}
          value={nota}
          maxLength={MAX_NOTA}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Redacte la respuesta que verá quien consulte este radicado…"
          disabled={enviando}
          className="min-h-[5rem] flex-1 resize-none"
        />
      </Field>
      <Field label={`PDF de soporte (opcional, máx. ${MAX_PDF_MB} MB)`} className="shrink-0">
        <Input key={claveArchivo} type="file" accept="application/pdf,.pdf" onChange={elegirArchivo} disabled={enviando} />
      </Field>
      <Aviso>Es pública: la ve cualquiera que tenga el número de radicado. No incluya cédulas, direcciones ni datos sensibles.</Aviso>
      {radicado.correoRespuesta ? (
        <label className="flex shrink-0 items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="mt-0.5" checked={enviarCorreo} onChange={(e) => setEnviarCorreo(e.target.checked)} disabled={enviando} />
          <span className="break-all">
            {enviarCorreo ? (
              <>
                Enviar también por correo a <strong>{radicado.correoRespuesta}</strong>
                {archivo ? ' con el PDF adjunto' : ''} y dejar constancia.
              </>
            ) : (
              'No se enviará por correo: solo se publica en la web. Podrás enviarlo después desde el historial.'
            )}
          </span>
        </label>
      ) : (
        <p className="flex shrink-0 items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Esta solicitud no trae un correo válido: se publicará en la web pero no se enviará por correo.</span>
        </p>
      )}
      <div className="flex shrink-0 justify-end">
        <Btn type="submit" disabled={enviando || (!nota.trim() && !archivo)}>
          <Send className="h-4 w-4" aria-hidden="true" />
          {enviando ? 'Publicando…' : 'Publicar respuesta'}
        </Btn>
      </div>
    </form>
  )
}

function Detalle({ id, onCerrar, onCambio, onEliminar }) {
  const { data, cargando, error, actualizarLocal, recargar } = useDatosConCache(`sitioweb:radicado:${id}`, () => sitioWebApi.obtenerRadicado(id), {
    ttlMs: 60_000,
  })
  const radicado = data?.radicado
  // Mismo criterio que el backend (sitio_web.routes.js): el Operador responde pero no elimina.
  const { tienePermiso, usuario } = useAuth()
  const [formatoAbierto, setFormatoAbierto] = useState(false)
  const puedeEliminar = tienePermiso('sitio_web:gestionar') || tienePermiso('pqrs:eliminar')
  const [guardando, setGuardando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  async function descargarPdf() {
    setGenerandoPdf(true)
    try {
      await generarPdfRadicado(radicado)
    } catch (err) {
      toast.error(err.message || 'No se pudo generar el PDF')
    } finally {
      setGenerandoPdf(false)
    }
  }

  async function cambiar(estado) {
    setGuardando(true)
    try {
      await sitioWebApi.cambiarEstadoRadicado(id, estado)
      actualizarLocal((previo) => (previo ? { ...previo, radicado: { ...previo.radicado, estado } } : previo))
      toast.success(`Radicado marcado como "${ETIQUETA[estado].toLowerCase()}"`)
      onCambio()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGuardando(false)
    }
  }

  // Igual que la bandeja de WordPress: abrir un radicado sin leer lo marca como
  // leído. Una sola vez por apertura (si el efecto reaccionara al estado local,
  // pulsar "Sin leer" lo devolvería a "leído" al instante) y condicionado en el
  // servidor: si otra persona ya lo tramitó, no se retrocede.
  const sinLeer = radicado?.estado === 'sin_leer'
  const marcadoAlAbrir = useRef(false)
  useEffect(() => {
    if (!sinLeer || marcadoAlAbrir.current) return
    marcadoAlAbrir.current = true
    sitioWebApi
      .cambiarEstadoRadicado(id, 'leido', { soloSiSinLeer: true })
      .then(({ estado }) => {
        actualizarLocal((previo) => (previo ? { ...previo, radicado: { ...previo.radicado, estado } } : previo))
        onCambio()
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinLeer, id])

  // Tiempos del trámite (días calendario, no hábiles): el cómputo de plazos
  // legales depende de festivos y del tipo de solicitud, así que aquí solo se
  // muestran los hechos verificables.
  const radicadaEn = aDate(radicado?.fecha)
  const fechasRespuestas = (radicado?.respuestas || []).map((r) => aDate(r.fecha)).filter(Boolean)
  const primeraRespuesta = fechasRespuestas.length ? new Date(Math.min(...fechasRespuestas)) : null
  const hastaPrimeraRespuesta = radicadaEn && primeraRespuesta ? diasEntre(radicadaEn, primeraRespuesta) : null
  const antiguedad = radicadaEn ? diasEntre(radicadaEn, new Date()) : null
  const tipo = radicado?.campos?.find((c) => /tipo/i.test(c.etiqueta))?.valor

  return (
    <Modal abierto titulo="Gestión de radicado" onCerrar={onCerrar} pantallaCompleta>
      <ErrorMsg>{error}</ErrorMsg>
      {cargando && !radicado ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : radicado ? (
        <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
          {/* Cabecera del expediente */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-2.5 dark:border-slate-800/80 dark:bg-slate-900/40">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <p className="panel-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">N.º de radicado</p>
                <p className="panel-mono break-all text-lg font-semibold leading-tight tracking-wide text-slate-900 dark:text-white">{radicado.radicado}</p>
              </div>
              <span
                className={`panel-mono inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${TONO[radicado.estado]?.chip || ''}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${TONO[radicado.estado]?.punto || 'bg-slate-400'}`} aria-hidden="true" />
                {ETIQUETA[radicado.estado] || radicado.estado}
              </span>
            </div>
            <dl className="grid flex-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
              <DatoMeta etiqueta="Tipo de solicitud">{tipo || radicado.formulario?.titulo || '—'}</DatoMeta>
              <DatoMeta etiqueta="Formulario">{radicado.formulario?.titulo || '—'}</DatoMeta>
              <DatoMeta etiqueta="Fecha de radicación">{fecha(radicado.fecha)}</DatoMeta>
              <DatoMeta etiqueta="Tiempo transcurrido">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {antiguedad === null ? '—' : plural(antiguedad, 'día', 'días')}
                  {hastaPrimeraRespuesta !== null && (
                    <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                      · 1.ª respuesta a los {plural(hastaPrimeraRespuesta, 'día', 'días')}
                    </span>
                  )}
                </span>
              </DatoMeta>
            </dl>
          </div>

          <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)]">
            <Seccion numero="01" titulo="Información de la solicitud" className="lg:h-full">
              <dl className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                {radicado.campos.map((c) => (
                  <div key={c.clave} className="grid gap-0.5 py-2 first:pt-0 last:pb-0 sm:grid-cols-[8.5rem_1fr] sm:gap-3">
                    <dt className="panel-mono text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{c.etiqueta}</dt>
                    <dd className="min-w-0 whitespace-pre-wrap break-words text-[13px] leading-snug text-slate-900 dark:text-slate-100">
                      {c.adjunto ? (
                        <a
                          href={c.valor}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="inline-flex items-center gap-1.5 break-all text-brand-600 underline dark:text-brand-400"
                        >
                          <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {nombreAdjunto(c.valor)}
                        </a>
                      ) : (
                        c.valor || '—'
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </Seccion>

            <div className="flex flex-col gap-3 lg:min-h-0">
              <Seccion numero="02" titulo="Estado del trámite" nota="Lo ve el ciudadano" className="shrink-0">
                <div role="radiogroup" aria-label="Estado del trámite" className="grid gap-1.5">
                  {ETAPAS.map((etapa, i) => {
                    const actual = radicado.estado === etapa.estado
                    return (
                      <button
                        key={etapa.estado}
                        type="button"
                        role="radio"
                        aria-checked={actual}
                        disabled={guardando || actual}
                        onClick={() => cambiar(etapa.estado)}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-1.5 text-left transition-colors disabled:cursor-default ${
                          actual
                            ? TONO[etapa.estado].activa
                            : 'border-slate-200/80 hover:border-brand-500/40 hover:bg-brand-400/5 disabled:opacity-60 dark:border-slate-800/80'
                        }`}
                      >
                        <span
                          className={`panel-mono flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                            actual ? `${TONO[etapa.estado].punto} text-white` : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {actual ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
                        </span>
                        <span className="min-w-0 text-sm font-medium text-slate-900 dark:text-slate-100">{etapa.titulo}</span>
                        <span className="panel-mono ml-auto text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{etapa.detalle}</span>
                      </button>
                    )
                  })}
                </div>
              </Seccion>

              <Seccion numero="03" titulo="Respuestas publicadas" nota={`${radicado.respuestas.length} en total`} className="lg:min-h-0 lg:flex-1">
                <HistorialRespuestas radicado={radicado} onActualizar={recargar} />
              </Seccion>
            </div>

            <Seccion numero="04" titulo="Nueva respuesta oficial" nota="Se publica en la web" className="lg:h-full">
              <RespuestaCiudadano
                key={radicado.respuestas.length}
                radicado={radicado}
                onEnviada={(res) => {
                  if (res.estado) actualizarLocal((previo) => (previo ? { ...previo, radicado: { ...previo.radicado, estado: res.estado } } : previo))
                  recargar()
                  onCambio()
                }}
              />
            </Seccion>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-3 dark:border-slate-800/80">
            <p className="panel-mono text-[11px] text-slate-500 dark:text-slate-400">
              Registro técnico · IP {radicado.ip || '—'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Btn variante="secundario" onClick={descargarPdf} disabled={generandoPdf}>
                <FileDown className="h-4 w-4" aria-hidden="true" />
                {generandoPdf ? 'Generando…' : 'Descargar PDF'}
              </Btn>
              <Btn variante="secundario" onClick={() => setFormatoAbierto(true)}>
                <FileDown className="h-4 w-4" aria-hidden="true" />
                Formato PQRSDF
              </Btn>
              {puedeEliminar && (
                <Btn variante="fantasma" className="!text-red-600 dark:!text-red-400" onClick={() => onEliminar(radicado)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Eliminar
                </Btn>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <ModalFormatoPqrsdf abierto={formatoAbierto} radicado={radicado} usuario={usuario} onCerrar={() => setFormatoAbierto(false)} />
    </Modal>
  )
}

export default function RadicadosPage() {
  const [page, setPage] = useState(1)
  const [abierto, setAbierto] = useState(null)
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [tutorialAbierto, setTutorialAbierto] = useState(false)

  const { data, cargando, error, recargar } = useDatosConCache(
    `sitioweb:radicados:${page}`,
    () => sitioWebApi.listarRadicados({ page, limit: POR_PAGINA }),
    { ttlMs: 60_000 }
  )
  const { data: dataForms, recargar: recargarForms } = useDatosConCache('sitioweb:radicados:formularios', () => sitioWebApi.radicadosFormularios(), {
    ttlMs: 60_000,
  })
  const radicados = data?.radicados || []
  const formularios = dataForms?.formularios || []

  async function confirmarEliminar() {
    setEliminando(true)
    try {
      await sitioWebApi.eliminarRadicado(porEliminar.id)
      toast.success(`Radicado ${porEliminar.radicado} eliminado`)
      setPorEliminar(null)
      setAbierto(null)
      recargar()
      recargarForms()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setEliminando(false)
    }
  }

  async function exportar() {
    setExportando(true)
    try {
      const blob = await sitioWebApi.exportarRadicados()
      guardarBlob(blob, `radicados-${new Date().toISOString().slice(0, 10)}.csv`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setExportando(false)
    }
  }

  const sinLeerTotal = formularios.reduce((suma, f) => suma + f.sinLeer, 0)

  return (
    <div className="-mx-[var(--zp-space-4)] px-[var(--zp-space-2)]">
      <EncabezadoSeccion
        icono={Inbox}
        titulo="Solicitudes del sitio web"
        descripcion={
          sinLeerTotal > 0
            ? `${sinLeerTotal} radicado${sinLeerTotal === 1 ? '' : 's'} sin leer. PQRSF, contacto y denuncias que llegan desde elterminalneiva.com.`
            : 'PQRSF, contacto y denuncias que llegan desde elterminalneiva.com. El estado que marques es el que ve el ciudadano al consultar su radicado.'
        }
      >
        <Btn variante="secundario" onClick={() => setTutorialAbierto(true)}>
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          Ver tutorial de gestión
        </Btn>
        <Btn variante="secundario" onClick={exportar} disabled={exportando}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {exportando ? 'Exportando…' : 'Exportar CSV'}
        </Btn>
      </EncabezadoSeccion>

      <Modal abierto={tutorialAbierto} titulo="Tutorial: cómo gestionar las solicitudes" onCerrar={() => setTutorialAbierto(false)} ancho="max-w-4xl">
        {tutorialAbierto && (
          <video className="w-full rounded-lg bg-black" src="/tutoriales/gestion-solicitudes.mp4" controls autoPlay preload="metadata" />
        )}
      </Modal>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando && !data ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Cargando radicados…</p>
      ) : radicados.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          Aún no hay radicados.
        </p>
      ) : (
        <div className="panel-table-wrap overflow-hidden rounded-xl">
          <table className="w-full table-fixed">
            <thead>
              <tr>
                <Th className="w-[8.5rem]">Radicado</Th>
                <Th>Solicitud</Th>
                <Th className="hidden w-[22%] md:table-cell">Solicitante</Th>
                <Th className="hidden w-[7.5rem] lg:table-cell">Fecha</Th>
                <Th className="w-[5.5rem]">Estado</Th>
                <Th className="w-[6.5rem] text-right">Acción</Th>
              </tr>
            </thead>
            <tbody>
              {radicados.map((r) => (
                <tr key={r.id}>
                  <Td className="panel-mono truncate font-medium">{r.radicado}</Td>
                  <Td>
                    <span className="block truncate font-medium text-slate-900 dark:text-white">
                      {r.posibleSpam && (
                        <span className="mr-2 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-600 dark:text-red-400">Posible spam</span>
                      )}
                      {r.resumen.asunto || '(sin asunto)'}
                    </span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {[r.resumen.tipo, r.formulario?.titulo].filter(Boolean).join(' · ')}
                    </span>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className="block truncate">{r.resumen.solicitante || '—'}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{r.resumen.correo}</span>
                  </Td>
                  <Td className="hidden whitespace-nowrap text-xs lg:table-cell">{soloFecha(r.fecha)}</Td>
                  <Td><Badge valor={COLOR[r.estado]} label={ETIQUETA_CORTA[r.estado] || r.estado} /></Td>
                  <Td className="text-right">
                    <Btn variante="fantasma" className="!px-2 !py-1" aria-label={`Gestionar radicado ${r.radicado}`} onClick={() => setAbierto(r.id)}>Gestionar</Btn>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pages={data?.totalPaginas || 1} onPage={setPage} />

      {abierto && (
        <Detalle
          key={abierto}
          id={abierto}
          onCerrar={() => setAbierto(null)}
          onEliminar={setPorEliminar}
          onCambio={() => {
            recargar()
            recargarForms()
          }}
        />
      )}

      <ConfirmDialog
        abierto={Boolean(porEliminar)}
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={confirmarEliminar}
        cargando={eliminando}
        titulo={`¿Eliminar el radicado ${porEliminar?.radicado}?`}
        descripcion="Se borra del sitio web con sus respuestas y los PDF que el Terminal le respondió, y el ciudadano ya no podrá consultarlo. El archivo que subió el ciudadano, si lo hay, queda en el servidor de WordPress. No se puede deshacer."
        confirmarLabel="Eliminar"
      />
    </div>
  )
}
