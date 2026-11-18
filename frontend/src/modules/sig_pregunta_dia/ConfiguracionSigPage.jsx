import { useState } from 'react'
import { toast } from 'sonner'
import { sig } from '../../api/sig.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Btn, Card, ErrorMsg, Field, Input, SeccionLateral, Switch } from '../../components/ui.jsx'

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
          <span key={c} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
            {c}
            <button type="button" aria-label={`Quitar ${c}`} className="text-sm font-semibold text-red-700 underline dark:text-red-300" onClick={() => onChange(componentes.filter((x) => x !== c))}>
              Quitar
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input aria-label="Nuevo componente" placeholder="Nuevo componente…" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        <Btn variante="secundario" onClick={agregar}>Agregar</Btn>
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
        <div key={i} className="grid grid-cols-[1fr_1fr_4rem_2.5rem_auto] items-center gap-2">
          <Input aria-label="Nombre visible" placeholder="Nombre visible" value={n.nombre} onChange={(e) => actualizarFila(i, 'nombre', e.target.value)} />
          <Input aria-label="Clave interna" placeholder="clave_interna" value={n.clave} onChange={(e) => actualizarFila(i, 'clave', e.target.value)} />
          <Input aria-label="Umbral mínimo" type="number" min={0} max={100} value={n.umbralMinimo} onChange={(e) => actualizarFila(i, 'umbralMinimo', Number(e.target.value))} />
          <input type="color" aria-label="Color" value={n.color} onChange={(e) => actualizarFila(i, 'color', e.target.value)} className="h-9 w-9 rounded" />
          <Btn variante="fantasma" className="!text-red-700 dark:!text-red-300" onClick={() => quitarNivel(i)}>
            Quitar
          </Btn>
        </div>
      ))}
      <Btn variante="secundario" onClick={agregarNivel}>Agregar nivel</Btn>
      <p className="text-sm text-slate-700 dark:text-slate-200">
        El % de acierto es el umbral MÍNIMO para alcanzar ese nivel. El nivel más bajo debe llegar a 0.
      </p>
    </div>
  )
}

export default function ConfiguracionSigPage() {
  const { data: config, cargando, error, actualizarLocal } = useDatosConCache(
    'sig:configuracion',
    () => sig.configuracion.obtener().then((d) => d.configuracion),
    { ttlMs: 5 * 60_000 },
  )
  const [guardando, setGuardando] = useState(false)

  function setConfig(nuevo) {
    actualizarLocal(nuevo)
  }

  async function guardar() {
    setGuardando(true)
    try {
      const { configuracion } = await sig.configuracion.actualizar({
        horaPublicacionDefecto: config.horaPublicacionDefecto,
        componentes: config.componentes,
        nivelesDesempeno: config.nivelesDesempeno.map((n, i) => ({ ...n, orden: i + 1 })),
        ventanaDesempenoDias: config.ventanaDesempenoDias,
        notificarAlPublicar: config.notificarAlPublicar,
      })
      actualizarLocal(configuracion)
      toast.success('Configuración guardada')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (cargando || !config) {
    return <Card>Cargando…</Card>
  }

  return (
    <div>
      <h1 className="panel-mono mb-4 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">Configuración SIG</h1>

      <ErrorMsg>{error}</ErrorMsg>

      <SeccionLateral titulo="Publicación" descripcion="Cuándo se publican las preguntas y si se avisa al equipo.">
        <Field label="Hora de publicación por defecto">
          <Input
            type="time"
            value={config.horaPublicacionDefecto}
            onChange={(e) => setConfig({ ...config, horaPublicacionDefecto: e.target.value })}
          />
        </Field>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">Notificar a los trabajadores al publicar</span>
          <Switch
            checked={config.notificarAlPublicar}
            onChange={(v) => setConfig({ ...config, notificarAlPublicar: v })}
            label="Notificar a los trabajadores al publicar"
          />
        </div>
      </SeccionLateral>

      <SeccionLateral titulo="Desempeño" descripcion="Periodo con el que se calcula el nivel de cada persona.">
        <Field label="Ventana de cálculo (días; vacío = histórico completo)">
          <Input
            type="number"
            min={1}
            value={config.ventanaDesempenoDias ?? ''}
            onChange={(e) => setConfig({ ...config, ventanaDesempenoDias: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
      </SeccionLateral>

      <SeccionLateral titulo="Componentes SIG" descripcion="Lista de componentes disponibles para clasificar preguntas.">
        <ListaComponentes componentes={config.componentes} onChange={(v) => setConfig({ ...config, componentes: v })} />
      </SeccionLateral>

      <SeccionLateral
        titulo="Niveles de desempeño"
        descripcion="Nombre, umbral y color de cada nivel."
        acciones={<Btn disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar configuración'}</Btn>}
      >
        <TablaNiveles niveles={config.nivelesDesempeno} onChange={(v) => setConfig({ ...config, nivelesDesempeno: v })} />
      </SeccionLateral>
    </div>
  )
}
