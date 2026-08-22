import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { backup as backupApi } from '../../api/backup.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Btn, Field, Input, Select, ErrorMsg, OkMsg } from '../../components/ui.jsx'
import { CheckboxLabel } from '../../components/Checkbox.jsx'

const FORMATOS = [
  { valor: 'xlsx', label: 'Excel (.xlsx) — una hoja por colección' },
  { valor: 'csv', label: 'CSV (.zip) — un .csv por colección' },
  { valor: 'json', label: 'JSON — un archivo con todo' },
]

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function BackupPersonalizadoPanel() {
  const { data: catalogoData, cargando: cargandoCatalogo, error: errorCatalogo } = useDatosConCache(
    'backup:colecciones',
    () => backupApi.listarColecciones().then((d) => d.colecciones),
    { ttlMs: 5 * 60_000 },
  )
  const catalogo = catalogoData || []
  const [seleccionadas, setSeleccionadas] = useState(new Set())
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [formato, setFormato] = useState('xlsx')
  const [generando, setGenerando] = useState(false)
  const [errorGenerar, setErrorGenerar] = useState('')
  const [ok, setOk] = useState('')
  const error = errorGenerar || errorCatalogo

  // Selecciona todo por defecto en cuanto el catálogo llega (de la red o de
  // la caché) — no depende de si esta fue la primera vez que se pidió.
  useEffect(() => {
    if (catalogoData) setSeleccionadas(new Set(catalogoData.map((c) => c.clave)))
  }, [catalogoData])

  function alternar(clave) {
    setSeleccionadas((actual) => {
      const nuevo = new Set(actual)
      if (nuevo.has(clave)) nuevo.delete(clave)
      else nuevo.add(clave)
      return nuevo
    })
  }

  const hayColeccionesConFecha = catalogo.some((c) => c.filtrablePorFecha)

  async function generar() {
    setErrorGenerar('')
    setOk('')
    if (seleccionadas.size === 0) {
      setErrorGenerar('Selecciona al menos una colección')
      return
    }
    setGenerando(true)
    try {
      const { blob, nombre } = await backupApi.exportarPersonalizado({
        colecciones: seleccionadas.size === catalogo.length ? undefined : Array.from(seleccionadas),
        desde: desde || undefined,
        hasta: hasta || undefined,
        formato,
      })
      descargar(blob, nombre)
      setOk('Backup generado y descargado correctamente.')
    } catch (err) {
      setErrorGenerar(err.message)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Genera un backup con toda la información de la plataforma (usuarios, roles, requerimientos, reportes de
        daños, ausencias, mantenimiento, auditoría y más), o personaliza qué colecciones, qué rango de fechas y
        en qué formato.
      </p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        No hay backups automáticos ni programados: tú decides cuándo generarlo. Los registros de{' '}
        <strong>Auditoría</strong> se eliminan solos pasados unos meses (ver módulo Sistema), así que conviene
        descargar un backup de vez en cuando para no perder ese historial.
      </p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Por seguridad, el archivo nunca incluye contraseñas ni credenciales — solo información de negocio.
        Guárdalo en un lugar de confianza: contiene datos personales de todo el personal.
      </p>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      <div className="mt-5 space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Colecciones</p>
            <div className="flex gap-3 text-xs">
              <button type="button" className="text-brand-600 hover:underline dark:text-brand-400" onClick={() => setSeleccionadas(new Set(catalogo.map((c) => c.clave)))}>
                Todas
              </button>
              <button type="button" className="text-brand-600 hover:underline dark:text-brand-400" onClick={() => setSeleccionadas(new Set())}>
                Ninguna
              </button>
            </div>
          </div>
          {cargandoCatalogo ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-3">
              {catalogo.map((c) => (
                <CheckboxLabel key={c.clave} checked={seleccionadas.has(c.clave)} onCheckedChange={() => alternar(c.clave)}>
                  {c.hoja}
                </CheckboxLabel>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde (opcional)">
            <Input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta (opcional)">
            <Input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          </Field>
        </div>
        {(desde || hasta) && hayColeccionesConFecha && (
          <p className="-mt-3 text-xs text-slate-500 dark:text-slate-400">
            El rango solo filtra colecciones con fecha propia (Requerimientos, Auditoría, Ausencias, etc.); los
            catálogos sin fecha (Usuarios, Roles, Equipos...) se incluyen completos.
          </p>
        )}

        <Field label="Formato">
          <Select value={formato} onChange={(e) => setFormato(e.target.value)}>
            {FORMATOS.map((f) => (
              <option key={f.valor} value={f.valor}>{f.label}</option>
            ))}
          </Select>
        </Field>

        <Btn onClick={generar} disabled={generando || cargandoCatalogo} className="flex items-center gap-2">
          <Download className="h-4 w-4" aria-hidden="true" />
          {generando ? 'Generando backup…' : 'Generar y descargar backup'}
        </Btn>
      </div>
    </div>
  )
}
