import { useEffect, useState } from 'react'
import { Settings, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { sig } from '../../api/sig.js'
import { Btn, Card, ErrorMsg, Field, Input, Switch } from '../../components/ui.jsx'

function ListaComponentes({ componentes, onChange }) {
  const [nuevo, setNuevo] = useState('')

  function agregar() {
    const v = nuevo.trim()
    if (!v || componentes.includes(v)) return
    onChange([...componentes, v])
    setNuevo('')
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {componentes.map((c) => (
          <span key={c} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {c}
            <button type="button" aria-label={`Quitar ${c}`} onClick={() => onChange(componentes.filter((x) => x !== c))}>
              <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Nuevo componente…" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        <Btn variante="secundario" onClick={agregar}><Plus className="h-4 w-4" aria-hidden="true" /></Btn>
      </div>
    </div>
  )
}

function TablaNiveles({ niveles, onChange }) {
  function actualizarFila(i, campo, valor) {
    onChange(niveles.map((n, idx) => (idx === i ? { ...n, [campo]: valor } : n)))
  }

  function agregarNivel() {
    onChange([...niveles, { clave: '', nombre: '', umbralMinimo: 0, color: '#64748b', orden: niveles.length + 1 }])
  }

  function quitarNivel(i) {
    onChange(niveles.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      {[...niveles].sort((a, b) => a.orden - b.orden).map((n, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_5rem_3rem_auto] items-center gap-2">
          <Input placeholder="Nombre visible" value={n.nombre} onChange={(e) => actualizarFila(i, 'nombre', e.target.value)} />
          <Input placeholder="clave_interna" value={n.clave} onChange={(e) => actualizarFila(i, 'clave', e.target.value)} />
          <Input type="number" min={0} max={100} value={n.umbralMinimo} onChange={(e) => actualizarFila(i, 'umbralMinimo', Number(e.target.value))} />
          <input type="color" value={n.color} onChange={(e) => actualizarFila(i, 'color', e.target.value)} className="h-9 w-9 rounded" />
          <Btn variante="fantasma" className="!p-2 !text-red-600 dark:!text-red-400" onClick={() => quitarNivel(i)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Btn>
        </div>
      ))}
      <Btn variante="secundario" className="flex items-center gap-1.5" onClick={agregarNivel}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Agregar nivel
      </Btn>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        El % de acierto es el umbral MÍNIMO para alcanzar ese nivel. El nivel más bajo debe llegar a 0.
      </p>
    </div>
  )
}

export default function ConfiguracionSigPage() {
  const [config, setConfig] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    sig.configuracion.obtener()
      .then((data) => setConfig(data.configuracion))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      const { configuracion } = await sig.configuracion.actualizar({
        horaPublicacionDefecto: config.horaPublicacionDefecto,
        componentes: config.componentes,
        nivelesDesempeno: config.nivelesDesempeno.map((n, i) => ({ ...n, orden: i + 1 })),
        ventanaDesempenoDias: config.ventanaDesempenoDias,
        notificarAlPublicar: config.notificarAlPublicar,
      })
      setConfig(configuracion)
      toast.success('Configuración guardada')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (cargando || !config) {
    return <Card>Cargando…</Card>
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-2.5">
        <Settings className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">Configuración SIG</h1>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <Card className="mb-4 space-y-4">
        <Field label="Hora de publicación por defecto">
          <Input
            type="time"
            value={config.horaPublicacionDefecto}
            onChange={(e) => setConfig({ ...config, horaPublicacionDefecto: e.target.value })}
          />
        </Field>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
          <span className="text-sm text-slate-700 dark:text-slate-200">Notificar a los trabajadores al publicar</span>
          <Switch
            checked={config.notificarAlPublicar}
            onChange={(v) => setConfig({ ...config, notificarAlPublicar: v })}
            label="Notificar a los trabajadores al publicar"
          />
        </div>

        <Field label="Ventana de cálculo del nivel de desempeño (días; vacío = histórico completo)">
          <Input
            type="number"
            min={1}
            value={config.ventanaDesempenoDias ?? ''}
            onChange={(e) => setConfig({ ...config, ventanaDesempenoDias: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
      </Card>

      <Card className="mb-4">
        <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Componentes SIG</p>
        <ListaComponentes componentes={config.componentes} onChange={(v) => setConfig({ ...config, componentes: v })} />
      </Card>

      <Card className="mb-4">
        <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Niveles de desempeño</p>
        <TablaNiveles niveles={config.nivelesDesempeno} onChange={(v) => setConfig({ ...config, nivelesDesempeno: v })} />
      </Card>

      <div className="flex justify-end">
        <Btn disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar configuración'}</Btn>
      </div>
    </div>
  )
}
