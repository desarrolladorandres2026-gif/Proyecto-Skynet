import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { mantenimientoApi } from '../../api/mantenimiento.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import {
  Btn, Badge, Card, ErrorMsg, OkMsg, Field, Input, Textarea, Modal,
  TablaWrap, Th, Td, EmptyState, fmtFecha,
} from '../../components/ui.jsx'

// Endpoint autorizado por-recurso (reemplaza /storage servido con
// express.static — ver auditoría de producción 2026-08-22, Fase 2).
function urlPdf(id, filename) {
  return `/api/mantenimiento/mantenimientos/${id}/archivo/${filename}`
}

const FORM_VACIO = { fecha: '', tipo: '', tecnico: '', descripcion: '' }

export default function EquipoFichaPage() {
  const { id } = useParams()
  const [ok, setOk] = useState('')

  const { data: ficha, error, recargar } = useDatosConCache(
    `mantenimiento:equipoFicha:${id}`,
    () => mantenimientoApi.equipos.ficha(id),
    { ttlMs: 30_000 },
  )

  const [modalAbierto, setModalAbierto] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [archivo, setArchivo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  async function registrar(e) {
    e.preventDefault()
    setGuardando(true)
    setErrorForm('')
    try {
      await mantenimientoApi.equipos.registrarMantenimientoConPdf(id, form, archivo)
      setOk('Mantenimiento registrado')
      setModalAbierto(false)
      setForm(FORM_VACIO)
      setArchivo(null)
      recargar()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!ficha) return <Card>Cargando…</Card>

  const { equipo, mantenimientos } = ficha

  const specs = [
    ['Procesador', equipo.procesador],
    ['RAM', equipo.ram],
    ['Disco duro', equipo.disco_duro],
    ['Sistema operativo', equipo.sistema_operativo],
    ['Proveedor', equipo.proveedor],
    ['Fecha de compra', equipo.fecha_compra ? fmtFecha(equipo.fecha_compra) : null],
  ].filter(([, v]) => v)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/mantenimiento/equipos" className="text-sm text-cyan-700 hover:underline dark:text-cyan-400">
            ← Volver a equipos
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            {equipo.tipo?.nombre} {equipo.marca?.nombre} — {equipo.numero_inventario}
          </h1>
        </div>
        <Btn onClick={() => setModalAbierto(true)}>+ Registrar mantenimiento</Btn>
      </div>

      <OkMsg>{ok}</OkMsg>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">Datos generales</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ['Inventario', equipo.numero_inventario],
              ['Serial', equipo.serial],
              ['Modelo', equipo.modelo],
              ['Estado', equipo.estado_actual],
              ['Ubicación', equipo.ubicacion],
              ['Responsable', equipo.responsable],
              ['Dependencia', equipo.dependencia],
              ['Registrado', fmtFecha(equipo.fecha_registro)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                <dd className="font-medium text-slate-800 dark:text-slate-100">{v || '—'}</dd>
              </div>
            ))}
          </dl>
          {equipo.observaciones && (
            <p className="mt-3 rounded-lg bg-slate-900/5 p-2 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
              {equipo.observaciones}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">Especificaciones técnicas</h2>
          {specs.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Sin especificaciones registradas.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {specs.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-100">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">
        Historial de mantenimientos ({mantenimientos.length})
      </h2>

      {mantenimientos.length === 0 ? (
        <EmptyState mensaje="Este equipo no tiene mantenimientos registrados" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Realizado</Th>
              <Th>Tipo</Th>
              <Th>Técnico</Th>
              <Th>Descripción</Th>
              <Th>Estado</Th>
              <Th>PDF</Th>
            </tr>
          </thead>
          <tbody>
            {mantenimientos.map((m) => (
              <tr key={m._id} className="panel-row">
                <Td>{fmtFecha(m.fecha)}</Td>
                <Td>{fmtFecha(m.fecha_realizacion)}</Td>
                <Td>{m.tipo}</Td>
                <Td>{m.tecnico}</Td>
                <Td className="max-w-xs truncate" title={m.descripcion}>{m.descripcion}</Td>
                <Td><Badge valor={m.estado} /></Td>
                <Td>
                  {m.archivo_pdf ? (
                    <a
                      href={urlPdf(m._id, m.archivo_pdf)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-700 hover:underline dark:text-cyan-400"
                    >
                      Ver PDF
                    </a>
                  ) : (
                    '—'
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Modal abierto={modalAbierto} titulo="Registrar mantenimiento" onCerrar={() => setModalAbierto(false)}>
        <form onSubmit={registrar} className="space-y-4">
          <ErrorMsg>{errorForm}</ErrorMsg>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha">
              <Input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
            <Field label="Tipo">
              <Input placeholder="Preventivo / Correctivo…" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} />
            </Field>
          </div>

          <Field label="Técnico">
            <Input value={form.tecnico} onChange={(e) => setForm({ ...form, tecnico: e.target.value })} />
          </Field>

          <Field label="Descripción">
            <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Field>

          <Field label="Informe PDF (opcional)">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setArchivo(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-cyan-700 dark:text-slate-300 dark:file:bg-cyan-400/10 dark:file:text-cyan-300"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Btn variante="secundario" onClick={() => setModalAbierto(false)}>Cancelar</Btn>
            <button
              type="submit"
              disabled={guardando}
              className="panel-btn-primario rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Registrar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
