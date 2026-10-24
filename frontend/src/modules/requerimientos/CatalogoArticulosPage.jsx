import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Library, Upload, ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Btn, Card, ErrorMsg, OkMsg, Field, Input, Select, Textarea, Modal, TablaWrap, Th, Td, EmptyState, fmtFechaHora } from '../../components/ui.jsx'

// El export de Elisa llega en Windows-1252 (Ñ = 0xD1), que no es UTF-8 válido.
// Probar UTF-8 estricto primero deja pasar archivos ya convertidos.
async function leerTextoExport(file) {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

function EditarArticuloModal({ articulo, onCerrar, onGuardado }) {
  const [alias, setAlias] = useState('')
  const [presentaciones, setPresentaciones] = useState([])
  const [activo, setActivo] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!articulo) return
    setAlias((articulo.alias || []).join('\n'))
    setPresentaciones((articulo.presentaciones || []).map((p) => ({ ...p })))
    setActivo(articulo.activo !== false)
    setError('')
  }, [articulo])

  function cambiarPresentacion(i, campo, valor) {
    setPresentaciones((prev) => prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)))
  }

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      await requerimientosApi.editarArticulo(articulo._id, {
        alias: alias.split('\n').map((a) => a.trim()).filter(Boolean),
        presentaciones: presentaciones.map((p) => ({ nombre: p.nombre, factor: Number(p.factor) })),
        activo,
      })
      onGuardado()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={Boolean(articulo)} titulo={articulo?.nombre || 'Artículo'} onCerrar={onCerrar}>
      <div className="space-y-4">
        <ErrorMsg>{error}</ErrorMsg>
        <Field label="Otros nombres (uno por línea)">
          <Textarea rows={4} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="bolsa negra grande" />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="panel-mono text-xs uppercase tracking-[0.1em] text-brand-700 dark:text-brand-300">Presentaciones</span>
            <Btn variante="secundario" onClick={() => setPresentaciones((p) => [...p, { nombre: '', factor: 1 }])} className="flex items-center gap-1.5 !px-2.5">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Agregar
            </Btn>
          </div>
          <p className="mb-2 text-xs text-slate-700 dark:text-slate-300">
            Cuántas unidades de Elisa trae cada presentación. Ej.: «paquete» = 10 para que 2 paquetes se despachen como 20.
          </p>
          <div className="space-y-2">
            {presentaciones.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="paquete" value={p.nombre} onChange={(e) => cambiarPresentacion(i, 'nombre', e.target.value)} />
                <Input type="number" min="1" className="w-24" value={p.factor} onChange={(e) => cambiarPresentacion(i, 'factor', e.target.value)} />
                <Btn variante="peligro" onClick={() => setPresentaciones((prev) => prev.filter((_, idx) => idx !== i))} className="!px-2" aria-label="Quitar presentación">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Btn>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Se ofrece a los solicitantes
        </label>

        <div className="flex justify-end gap-2">
          <Btn variante="secundario" onClick={onCerrar}>Cancelar</Btn>
          <Btn onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

export default function CatalogoArticulosPage() {
  const [q, setQ] = useState('')
  const [grupo, setGrupo] = useState('')
  const [datos, setDatos] = useState({ articulos: [], grupos: [] })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [importando, setImportando] = useState(false)
  const [editando, setEditando] = useState(null)
  const inputArchivo = useRef(null)

  async function cargar() {
    try {
      setDatos(await requerimientosApi.catalogo({ q: q.trim(), grupo }))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(cargar, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, grupo])

  async function importar(file) {
    if (!file) return
    setImportando(true)
    setError('')
    setOk('')
    try {
      const r = await requerimientosApi.importarArticulos(await leerTextoExport(file))
      setOk(`Inventario de Elisa cargado: ${r.creados} nuevos, ${r.actualizados} actualizados${r.duplicadosSumados ? `, ${r.duplicadosSumados} nombres repetidos sumados` : ''}.`)
      await cargar()
    } catch (err) {
      setError(err.message)
    } finally {
      setImportando(false)
      if (inputArchivo.current) inputArchivo.current.value = ''
    }
  }

  const { articulos, grupos } = datos

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide !text-black dark:!text-white">
          <Library className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden="true" />
          Catálogo de artículos
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/requerimientos/bodega/consolidado">
            <Btn variante="secundario" className="flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Qué despachar
            </Btn>
          </Link>
          <input ref={inputArchivo} type="file" accept=".txt,.csv,text/plain" className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
          <Btn onClick={() => inputArchivo.current?.click()} disabled={importando} className="flex items-center gap-1.5">
            <Upload className="h-4 w-4" aria-hidden="true" /> {importando ? 'Cargando…' : 'Cargar inventario de Elisa'}
          </Btn>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      {ok && <OkMsg>{ok}</OkMsg>}

      <Card className="grid gap-3 sm:grid-cols-2">
        <Field label="Buscar">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="escoba, bolsa negra…" />
        </Field>
        <Field label="Grupo">
          <Select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Todos</option>
            {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        </Field>
      </Card>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : articulos.length === 0 ? (
        <EmptyState mensaje={q || grupo ? 'Ningún artículo coincide' : 'El catálogo está vacío: carga el export de Elisa (Consulta.txt)'} />
      ) : (
        <TablaWrap cuadricula>
          <thead>
            <tr>
              <Th>Artículo (nombre en Elisa)</Th>
              <Th>Grupo</Th>
              <Th>Existencia</Th>
              <Th>Otros nombres</Th>
              <Th>Presentaciones</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {articulos.map((a) => (
              <tr key={a._id}>
                <Td className="font-medium">{a.nombre}{a.activo === false ? ' (oculto, no se ofrece)' : ''}</Td>
                <Td>{a.grupo}</Td>
                <Td title={a.existenciaActualizada ? `Actualizada ${fmtFechaHora(a.existenciaActualizada)}` : ''}>{a.existencia}</Td>
                <Td>{a.alias?.length ? a.alias.join(', ') : '—'}</Td>
                <Td>{a.presentaciones?.length ? a.presentaciones.map((p) => `${p.nombre} x${p.factor}`).join(', ') : '—'}</Td>
                <Td>
                  <Btn variante="fantasma" onClick={() => setEditando(a)} className="flex items-center gap-1.5 !px-2.5" aria-label={`Editar ${a.nombre}`}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
                  </Btn>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <EditarArticuloModal
        articulo={editando}
        onCerrar={() => setEditando(null)}
        onGuardado={() => {
          setEditando(null)
          setOk('Artículo actualizado')
          cargar()
        }}
      />
    </div>
  )
}
