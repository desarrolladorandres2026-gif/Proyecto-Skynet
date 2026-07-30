import { useEffect, useRef, useState } from 'react'
import { Camera, Send } from 'lucide-react'
import { danos as danosApi } from '../../api/danos.js'
import {
  Btn, Badge, ErrorMsg, OkMsg, Field, Input, Textarea,
  EmptyState, fmtFechaHora,
} from '../../components/ui.jsx'
import { ListRow, SectionHeader, ChipTabs } from '../../components/mobileUi.jsx'

// "YYYY-MM-DDTHH:mm" local, para el value por defecto de datetime-local
// (toISOString() no sirve: devuelve UTC y correría la hora).
function ahoraLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// Generaliza lo que era solo "reportar daño" a cualquier cosa que un usuario
// quiera reportar: un daño físico sigue exigiendo foto (evidencia para
// mantenimiento), el resto de tipos la deja opcional — ver
// Backend/src/models/ReporteDano.js.
const TIPOS = [
  { value: 'dano', label: 'Daño' },
  { value: 'novedad', label: 'Novedad' },
  { value: 'sugerencia', label: 'Sugerencia' },
  { value: 'otro', label: 'Otro' },
]
const TIPO_LABELS = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]))

export default function ReportarDanoPage() {
  const [tipo, setTipo] = useState('dano')
  const [fecha, setFecha] = useState(ahoraLocal())
  const [descripcion, setDescripcion] = useState('')
  const [foto, setFoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const inputFotoRef = useRef(null)
  const fotoObligatoria = tipo === 'dano'

  const [misReportes, setMisReportes] = useState([])
  const [cargando, setCargando] = useState(true)

  async function cargarMios() {
    setCargando(true)
    try {
      const data = await danosApi.mios()
      setMisReportes(data.reportes)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargarMios()
  }, [])

  useEffect(() => {
    if (!foto) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(foto)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [foto])

  async function enviar(e) {
    e.preventDefault()
    setError('')
    setOk('')
    if (fotoObligatoria && !foto) {
      setError('Adjunta una foto del daño')
      return
    }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('tipo', tipo)
      fd.append('fecha', new Date(fecha).toISOString())
      fd.append('descripcion', descripcion)
      if (foto) fd.append('foto', foto)
      await danosApi.reportar(fd)
      setOk(
        tipo === 'dano'
          ? 'Daño reportado correctamente. Mantenimiento lo verá como tarea pendiente.'
          : 'Reporte enviado correctamente.'
      )
      setDescripcion('')
      setFoto(null)
      setFecha(ahoraLocal())
      if (inputFotoRef.current) inputFotoRef.current.value = ''
      cargarMios()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto max-w-md md:max-w-2xl">
      <h1 className="mb-1 text-xl font-bold text-[var(--mobile-text)]">Reportar</h1>
      <p className="mb-4 text-sm text-[var(--mobile-text-dim)]">
        Daños físicos, novedades, sugerencias o cualquier otra cosa que quieras contarnos.
      </p>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      <div className="m-card mb-6 rounded-3xl p-4">
        <form onSubmit={enviar} className="flex flex-col gap-4 md:grid md:grid-cols-2">
          <div className="md:col-span-2">
            <ChipTabs opciones={TIPOS} valor={tipo} onChange={setTipo} />
          </div>

          <Field label={tipo === 'dano' ? 'Fecha y hora del daño' : 'Fecha y hora'}>
            <Input
              type="datetime-local"
              value={fecha}
              max={ahoraLocal()}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </Field>

          <Field label={fotoObligatoria ? 'Foto del daño' : 'Foto (opcional)'}>
            <input
              ref={inputFotoRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFoto(e.target.files?.[0] || null)}
              className="panel-input w-full rounded-lg px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-cyan-600/10 file:px-3 file:py-1 file:text-cyan-700 dark:file:bg-cyan-400/10 dark:file:text-cyan-300"
              required={fotoObligatoria}
            />
          </Field>

          <Field label="Descripción" className="md:col-span-2">
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={
                tipo === 'dano'
                  ? 'Describe qué está dañado, dónde queda y cualquier detalle útil para mantenimiento…'
                  : 'Cuéntanos qué pasó, dónde y cualquier detalle útil…'
              }
              required
            />
          </Field>

          {preview && (
            <div className="md:col-span-2">
              <img
                src={preview}
                alt="Vista previa de la foto del daño"
                className="max-h-64 w-full rounded-2xl border border-cyan-600/25 object-contain dark:border-cyan-400/20"
              />
            </div>
          )}

          <div className="md:col-span-2">
            <Btn type="submit" disabled={enviando} className="flex w-full items-center justify-center gap-2 rounded-2xl py-3">
              {enviando ? 'Enviando…' : (<><Send className="h-4 w-4" aria-hidden="true" /> Enviar</>)}
            </Btn>
          </div>
        </form>
      </div>

      <SectionHeader className="flex items-center gap-2">
        <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Mis reportes
      </SectionHeader>

      {cargando ? (
        <p className="text-sm text-[var(--mobile-text-dim)]">Cargando…</p>
      ) : misReportes.length === 0 ? (
        <EmptyState mensaje="Aún no has reportado nada" />
      ) : (
        <div className="flex flex-col gap-2">
          {misReportes.map((r) => (
            <ListRow
              key={r._id}
              leading={
                r.foto?.url ? (
                  <a href={r.foto.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    <img src={r.foto.url} alt="Foto adjunta" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                  </a>
                ) : undefined
              }
              icon={r.foto?.url ? undefined : Camera}
              title={r.descripcion}
              subtitle={`${TIPO_LABELS[r.tipo] || 'Daño'} · ${fmtFechaHora(r.fecha)}${
                r.asignadoA?.nombre
                  ? ` · ${r.asignadoA.nombre}`
                  : r.atendidoPor?.nombre
                    ? ` · ${r.atendidoPor.nombre}`
                    : ''
              }`}
              badge={<Badge valor={r.estado} />}
              trailing={null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
