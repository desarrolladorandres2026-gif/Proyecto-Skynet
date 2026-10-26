import { useEffect, useRef, useState } from 'react'
import { Download, FileDown, Inbox, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../auth/AuthContext.jsx'
import { sitioWebApi } from '../../api/sitioWeb.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Badge, Btn, ErrorMsg, Field, Input, Modal, Pager, Td, Textarea, Th, fmtFecha, fmtFechaHora } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'
import { generarPdfRadicado } from '../../pdf/radicadoPdf.js'
import { EncabezadoSeccion } from './comun.jsx'

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

// Lo que escribas aquí aparece en la consulta pública del radicado
// (elterminalneiva.com → Consultar estado de radicado), junto con el PDF.
function RespuestaCiudadano({ radicado, onEnviada }) {
  const [nota, setNota] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [marcarTramitado, setMarcarTramitado] = useState(radicado.estado !== 'tramitado')
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
      const res = await sitioWebApi.responderRadicado(radicado.id, { nota, archivo, marcarTramitado })
      toast.success('Respuesta publicada: el ciudadano la verá al consultar su radicado')
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
    <div className="border-t border-slate-200/80 pt-4 dark:border-slate-800/80">
      <p className="panel-mono mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Respuesta al ciudadano · se publica en la consulta de radicado de la web
      </p>

      {radicado.respuestas.length > 0 && (
        <ul className="mb-4 space-y-3">
          {radicado.respuestas.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200/80 p-3 text-sm dark:border-slate-800/80">
              <p className="panel-mono mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                {fecha(r.fecha)}{r.autor ? ` · ${r.autor}` : ''}
              </p>
              {r.nota && <p className="whitespace-pre-wrap break-words text-slate-900 dark:text-slate-100">{r.nota}</p>}
              {r.archivoUrl && (
                <a href={r.archivoUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 break-all text-brand-600 underline dark:text-brand-400">
                  <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {r.archivoNombre || 'documento.pdf'}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={enviar} className="space-y-3">
        <Field label={`Nota para el ciudadano (${nota.length}/${MAX_NOTA})`}>
          <Textarea rows={4} value={nota} maxLength={MAX_NOTA} onChange={(e) => setNota(e.target.value)} placeholder="Respuesta o información que verá quien consulte este radicado…" disabled={enviando} />
        </Field>
        <Field label={`Documento PDF (opcional, máx. ${MAX_PDF_MB} MB)`}>
          <Input key={claveArchivo} type="file" accept="application/pdf,.pdf" onChange={elegirArchivo} disabled={enviando} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={marcarTramitado} onChange={(e) => setMarcarTramitado(e.target.checked)} disabled={enviando} />
          Marcar el radicado como tramitado / resuelto al publicar
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Es público: lo ve cualquiera que conozca el número de radicado. No incluyas cédulas, direcciones ni datos sensibles.
        </p>
        <Btn type="submit" disabled={enviando || (!nota.trim() && !archivo)}>
          {enviando ? 'Publicando…' : 'Publicar respuesta'}
        </Btn>
      </form>
    </div>
  )
}

function Detalle({ id, onCerrar, onCambio, onEliminar }) {
  const { data, cargando, error, actualizarLocal, recargar } = useDatosConCache(`sitioweb:radicado:${id}`, () => sitioWebApi.obtenerRadicado(id), {
    ttlMs: 60_000,
  })
  const radicado = data?.radicado
  // Mismo criterio que el backend (sitio_web.routes.js): el Operador responde pero no elimina.
  const { tienePermiso } = useAuth()
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

  return (
    <Modal abierto titulo={radicado ? `Radicado ${radicado.radicado}` : 'Radicado'} onCerrar={onCerrar} ancho="max-w-2xl">
      <ErrorMsg>{error}</ErrorMsg>
      {cargando && !radicado ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : radicado ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span>{radicado.formulario?.titulo}</span>
            <span className="panel-mono text-xs">{fecha(radicado.fecha)}</span>
          </div>

          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {radicado.campos.map((c) => (
              <div key={c.clave} className={c.valor.length > 80 ? 'sm:col-span-2' : ''}>
                <dt className="panel-mono text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{c.etiqueta}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-900 dark:text-slate-100">
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

          <RespuestaCiudadano
            key={radicado.respuestas.length}
            radicado={radicado}
            onEnviada={(res) => {
              if (res.estado) actualizarLocal((previo) => (previo ? { ...previo, radicado: { ...previo.radicado, estado: res.estado } } : previo))
              recargar()
              onCambio()
            }}
          />

          <div className="border-t border-slate-200/80 pt-4 dark:border-slate-800/80">
            <p className="panel-mono mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Estado del trámite · lo ve el ciudadano al consultar su radicado
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(ETIQUETA).map((estado) => (
                <Btn
                  key={estado}
                  variante={radicado.estado === estado ? 'primario' : 'secundario'}
                  aria-pressed={radicado.estado === estado}
                  disabled={guardando || radicado.estado === estado}
                  onClick={() => cambiar(estado)}
                >
                  {ETIQUETA[estado]}
                </Btn>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4 dark:border-slate-800/80">
            <p className="panel-mono text-[11px] text-slate-500 dark:text-slate-400">IP {radicado.ip || '—'}</p>
            <div className="flex flex-wrap gap-2">
              <Btn variante="secundario" onClick={descargarPdf} disabled={generandoPdf}>
                <FileDown className="h-4 w-4" aria-hidden="true" />
                {generandoPdf ? 'Generando…' : 'Descargar PDF'}
              </Btn>
              {puedeEliminar && (
                <Btn variante="fantasma" className="!text-red-600 dark:!text-red-400" onClick={() => onEliminar(radicado)}>
                  Eliminar
                </Btn>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

export default function RadicadosPage() {
  const [page, setPage] = useState(1)
  const [abierto, setAbierto] = useState(null)
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [exportando, setExportando] = useState(false)

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
        <Btn variante="secundario" onClick={exportar} disabled={exportando}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {exportando ? 'Exportando…' : 'Exportar CSV'}
        </Btn>
      </EncabezadoSeccion>

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
                    <span className="block truncate font-medium text-slate-900 dark:text-white">{r.resumen.asunto || '(sin asunto)'}</span>
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
