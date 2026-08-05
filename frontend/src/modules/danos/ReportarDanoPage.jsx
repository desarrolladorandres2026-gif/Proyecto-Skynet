import { useEffect, useRef, useState } from 'react'
import { Camera, Images, Send, X, ShieldOff } from 'lucide-react'
import { danos as danosApi } from '../../api/danos.js'
import { normalizarFoto } from '../../utils/normalizarFoto.js'
import { useAuth } from '../../auth/AuthContext.jsx'
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
  const { tienePermiso } = useAuth()
  // Un técnico "puro" (ejecuta, no gestiona) no reporta daños — su función es
  // reparar lo que le asignan. Se detecta por permisos, no por slug de rol
  // (mismo criterio que el backend, ver esTecnicoPuro en danos.controller.js).
  const tecnicoPuro = tienePermiso('mantenimiento:ejecutar') && !tienePermiso('danos:gestionar')

  const [tipo, setTipo] = useState('dano')
  const [fecha, setFecha] = useState(ahoraLocal())
  const [descripcion, setDescripcion] = useState('')
  const [foto, setFoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [procesandoFoto, setProcesandoFoto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const inputCamaraRef = useRef(null)
  const inputGaleriaRef = useRef(null)
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

  async function elegirFoto(archivo) {
    if (!archivo) return
    setProcesandoFoto(true)
    try {
      setFoto(await normalizarFoto(archivo))
    } finally {
      setProcesandoFoto(false)
    }
  }

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
      if (inputCamaraRef.current) inputCamaraRef.current.value = ''
      if (inputGaleriaRef.current) inputGaleriaRef.current.value = ''
      cargarMios()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (tecnicoPuro) {
    return (
      <div className="mx-auto max-w-md md:max-w-2xl">
        <div className="m-card flex flex-col items-center gap-3 rounded-3xl p-8 text-center">
          <ShieldOff className="h-8 w-8 text-[var(--mobile-text-dim)]" aria-hidden="true" />
          <h1 className="text-lg font-bold text-[var(--mobile-text)]">Mantenimiento no reporta daños</h1>
          <p className="text-sm text-[var(--mobile-text-dim)]">
            Tu función es ejecutar las órdenes que te asignen. Ve a <strong>Mis tareas</strong> para ver y
            actualizar lo que tienes pendiente.
          </p>
        </div>
      </div>
    )
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
            {/* sr-only en vez de display:none: en iOS/Android, un input de
                cámara con display:none puede hacer que el navegador pierda el
                estado de la página al volver de la app de cámara nativa
                (recarga en blanco, la foto tomada no llega a React). */}
            <input
              ref={inputCamaraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => elegirFoto(e.target.files?.[0])}
              className="sr-only"
            />
            <input
              ref={inputGaleriaRef}
              type="file"
              accept="image/*"
              onChange={(e) => elegirFoto(e.target.files?.[0])}
              className="sr-only"
            />
            <div className="flex gap-2">
              <Btn
                type="button"
                variante="secundario"
                disabled={procesandoFoto}
                onClick={() => inputCamaraRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-2"
              >
                <Camera className="h-4 w-4" aria-hidden="true" /> Cámara
              </Btn>
              <Btn
                type="button"
                variante="secundario"
                disabled={procesandoFoto}
                onClick={() => inputGaleriaRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-2"
              >
                <Images className="h-4 w-4" aria-hidden="true" /> Galería
              </Btn>
            </div>
            {procesandoFoto && (
              <p className="mt-1.5 text-xs text-[var(--mobile-text-dim)]">Procesando foto…</p>
            )}
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
            <div className="relative md:col-span-2">
              <img
                src={preview}
                alt="Vista previa de la foto del daño"
                className="max-h-64 w-full rounded-2xl border border-cyan-600/25 object-contain dark:border-cyan-400/20"
              />
              <button
                type="button"
                onClick={() => {
                  setFoto(null)
                  if (inputCamaraRef.current) inputCamaraRef.current.value = ''
                  if (inputGaleriaRef.current) inputGaleriaRef.current.value = ''
                }}
                aria-label="Quitar foto"
                className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="md:col-span-2">
            <Btn type="submit" disabled={enviando || procesandoFoto} className="flex w-full items-center justify-center gap-2 rounded-2xl py-3">
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
