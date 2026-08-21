import { useEffect, useState } from 'react'
import { GraduationCap, Plus, Eye, Check, X as XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { sig } from '../../api/sig.js'
import { catalogosApi } from '../../api/catalogos.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import {
  Btn, Badge, Card, ErrorMsg, Field, Input, Select, Textarea,
  TablaWrap, Th, Td, EmptyState, Modal, fmtFecha,
} from '../../components/ui.jsx'

const ESTADO_LABEL = { programada: 'Programada', realizada: 'Realizada', cancelada: 'Cancelada' }

const FORM_INICIAL = {
  tema: '',
  componenteSig: '',
  descripcion: '',
  fechaProgramada: '',
  dirigida: false,
  dependencias: [],
  cargos: [],
}

// Barra de avance minimalista: cuántos de los participantes ya reforzaron el
// tema. No hay un componente <Progress> reutilizable en ui.jsx todavía, así
// que se arma inline (mismo patrón de "2 divs" que otras barras del panel).
function BarraAvance({ resumen }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full rounded-full bg-cyan-600 dark:bg-cyan-500" style={{ width: `${resumen.porcentaje}%` }} />
      </div>
      <span className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
        {resumen.completados}/{resumen.total} · {resumen.porcentaje}%
      </span>
    </div>
  )
}

function ModalNuevaCapacitacion({ catalogos, onCerrar, onCreada }) {
  const [form, setForm] = useState(FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  function alternarMulti(campo, valor) {
    setForm((f) => {
      const lista = f[campo].includes(valor) ? f[campo].filter((v) => v !== valor) : [...f[campo], valor]
      return { ...f, [campo]: lista }
    })
  }

  async function guardar() {
    setError('')
    if (!form.tema.trim()) return setError('El tema es obligatorio')
    if (!form.fechaProgramada) return setError('La fecha programada es obligatoria')
    setGuardando(true)
    try {
      const { capacitacion } = await sig.capacitaciones.crear({
        tema: form.tema,
        componenteSig: form.componenteSig,
        descripcion: form.descripcion,
        fechaProgramada: form.fechaProgramada,
        audiencia: form.dirigida ? { todos: false, dependencias: form.dependencias, cargos: form.cargos } : { todos: true },
      })
      onCreada(capacitacion)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto titulo="Programar capacitación por tema" onCerrar={onCerrar}>
      <div className="space-y-4">
        <ErrorMsg>{error}</ErrorMsg>
        <Field label="Tema a reforzar">
          <Input value={form.tema} onChange={(e) => setForm({ ...form, tema: e.target.value })} placeholder="Ej. Uso de EPP en patio de maniobras" />
        </Field>
        <Field label="Componente SIG (opcional)">
          <Input value={form.componenteSig} onChange={(e) => setForm({ ...form, componenteSig: e.target.value })} />
        </Field>
        <Field label="Fecha programada">
          <Input type="date" value={form.fechaProgramada} onChange={(e) => setForm({ ...form, fechaProgramada: e.target.value })} />
        </Field>
        <Field label="Descripción (opcional)">
          <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
        </Field>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
          <span className="text-sm text-slate-700 dark:text-slate-200">Dirigir a un área o cargo (si no, es para todos)</span>
          <input
            type="checkbox"
            checked={form.dirigida}
            onChange={(e) => setForm({ ...form, dirigida: e.target.checked })}
          />
        </div>

        {form.dirigida && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dependencias">
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                {catalogos.dependencias.map((d) => (
                  <label key={d._id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={form.dependencias.includes(d.nombre)} onChange={() => alternarMulti('dependencias', d.nombre)} />
                    {d.nombre}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Cargos">
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                {catalogos.cargos.map((c) => (
                  <label key={c._id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={form.cargos.includes(c.nombre)} onChange={() => alternarMulti('cargos', c.nombre)} />
                    {c.nombre}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Btn variante="secundario" onClick={onCerrar}>Cancelar</Btn>
          <Btn onClick={guardar} disabled={guardando}>{guardando ? 'Programando…' : 'Programar'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// Detalle + resumen: la lista de participantes con quién ya reforzó el tema
// (marcado manual) y quién falta. El resumen (BarraAvance) es simplemente el
// conteo derivado de esas marcas — no hay evaluación automática detrás.
function ModalDetalleCapacitacion({ id, onCerrar, onCambio }) {
  const [capacitacion, setCapacitacion] = useState(null)
  const [error, setError] = useState('')
  const [marcando, setMarcando] = useState(null)

  async function cargar() {
    try {
      const { capacitacion: c } = await sig.capacitaciones.detalle(id)
      setCapacitacion(c)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function alternar(participante) {
    setMarcando(participante.usuario._id)
    try {
      const { capacitacion: actualizada } = await sig.capacitaciones.marcarParticipante(
        id,
        participante.usuario._id,
        !participante.completado
      )
      setCapacitacion(actualizada)
      onCambio(actualizada)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setMarcando(null)
    }
  }

  return (
    <Modal abierto titulo={capacitacion ? `Capacitación — ${capacitacion.tema}` : 'Capacitación'} onCerrar={onCerrar} ancho="max-w-2xl">
      <ErrorMsg>{error}</ErrorMsg>
      {!capacitacion ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">Cargando…</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {fmtFecha(capacitacion.fechaProgramada)}
              {capacitacion.descripcion ? ` — ${capacitacion.descripcion}` : ''}
            </div>
            <BarraAvance resumen={capacitacion.resumen} />
          </div>
          <TablaWrap>
            <thead>
              <tr>
                <Th>Trabajador</Th>
                <Th>Área</Th>
                <Th>Reforzado</Th>
              </tr>
            </thead>
            <tbody>
              {capacitacion.participantes.map((p) => (
                <tr key={p.usuario?._id}>
                  <Td>{p.usuario?.nombre || '(usuario eliminado)'}</Td>
                  <Td>{p.usuario?.dependencia || '—'}</Td>
                  <Td>
                    <Btn
                      variante={p.completado ? 'primario' : 'secundario'}
                      className="!py-1"
                      disabled={!p.usuario || marcando === p.usuario._id}
                      onClick={() => alternar(p)}
                    >
                      {p.completado ? <Check className="h-4 w-4" aria-hidden="true" /> : <XIcon className="h-4 w-4" aria-hidden="true" />}
                      {p.completado ? 'Reforzado' : 'Pendiente'}
                    </Btn>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TablaWrap>
        </div>
      )}
    </Modal>
  )
}

export default function CapacitacionesTemaPage() {
  const [creando, setCreando] = useState(false)
  const [detalleId, setDetalleId] = useState(null)

  const { data, cargando, error, actualizarLocal } = useDatosConCache(
    'sig:capacitaciones',
    () => Promise.all([sig.capacitaciones.listar(), catalogosApi.obtener()])
      .then(([{ capacitaciones: lista }, cat]) => ({ capacitaciones: lista, catalogos: cat })),
    { ttlMs: 30_000 },
  )
  const capacitaciones = data?.capacitaciones || []
  const catalogos = data?.catalogos || { dependencias: [], cargos: [] }

  function actualizarEnLista(actualizada) {
    actualizarLocal((d) => ({
      ...d,
      capacitaciones: d.capacitaciones.map((c) => (c._id === actualizada._id ? { ...actualizada, resumen: actualizada.resumen } : c)),
    }))
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <GraduationCap className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Capacitaciones por tema
        </h1>
        <Btn className="flex items-center gap-1.5" onClick={() => setCreando(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Programar capacitación
        </Btn>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : capacitaciones.length === 0 ? (
        <EmptyState mensaje="Todavía no hay capacitaciones por tema programadas" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Tema</Th>
              <Th>Fecha</Th>
              <Th>Estado</Th>
              <Th>Avance</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {capacitaciones.map((c) => (
              <tr key={c._id}>
                <Td>{c.tema}</Td>
                <Td className="whitespace-nowrap">{fmtFecha(c.fechaProgramada)}</Td>
                <Td><Badge valor={c.estado} label={ESTADO_LABEL[c.estado]} /></Td>
                <Td><BarraAvance resumen={c.resumen} /></Td>
                <Td className="text-right">
                  <Btn variante="fantasma" onClick={() => setDetalleId(c._id)}>
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Ver / marcar
                  </Btn>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      {creando && (
        <ModalNuevaCapacitacion
          catalogos={catalogos}
          onCerrar={() => setCreando(false)}
          onCreada={(capacitacion) => {
            actualizarLocal((d) => ({
              ...d,
              capacitaciones: [{ ...capacitacion, resumen: capacitacion.resumen }, ...d.capacitaciones],
            }))
            setCreando(false)
          }}
        />
      )}

      {detalleId && (
        <ModalDetalleCapacitacion id={detalleId} onCerrar={() => setDetalleId(null)} onCambio={actualizarEnLista} />
      )}
    </div>
  )
}
