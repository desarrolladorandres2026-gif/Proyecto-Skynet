import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, ArrowLeft, Printer, Library, ChevronRight, ChevronDown } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Btn, Card, ErrorMsg, OkMsg, Select, TablaWrap, Th, Td, EmptyState, fmtFecha } from '../../components/ui.jsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import ArticuloSelector from './ArticuloSelector.jsx'

const ESTADOS_SUPERVISION = [
  { valor: '', label: 'Todos los estados' },
  { valor: 'pendiente_financiero', label: 'Pendiente Financiero' },
  { valor: 'pendiente_bodega', label: 'Aprobado (en Bodega)' },
  { valor: 'aprobado', label: 'Aprobado (sin Bodega)' },
  { valor: 'rechazado', label: 'Rechazado' },
]
const LABEL_ESTADO = Object.fromEntries(ESTADOS_SUPERVISION.filter((e) => e.valor).map((e) => [e.valor, e.label]))

function Resumen({ etiqueta, valor, alerta = false }) {
  return (
    <span>
      {etiqueta}:{' '}
      <strong className={alerta && valor > 0 ? 'text-warn-700 dark:text-warn-400' : 'text-slate-900 dark:text-slate-100'}>{valor}</strong>
    </span>
  )
}

// "2 paquete (x10)" o "5" cuando se pidió por unidad.
function textoPedido(l) {
  return l.presentacion ? `${l.cantidad} ${l.presentacion} (x${l.factor}) = ${l.unidades}` : String(l.cantidad)
}

function Desglose({ lineas, mostrarEstado = false }) {
  return (
    <ul className="divide-y divide-brand-600/10 text-sm dark:divide-brand-400/10">
      {lineas.map((l) => (
        <li key={l.itemId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5">
          <span className="text-slate-700 dark:text-slate-200">
            {l.solicitante}
            {l.destino ? <span className="text-slate-700 dark:text-slate-300"> · {l.destino}</span> : null}
            {l.textoOriginal ? <span className="text-slate-700 dark:text-slate-300"> · «{l.textoOriginal}»</span> : null}
            {mostrarEstado && l.estado ? <span className="text-slate-700 dark:text-slate-300"> · {LABEL_ESTADO[l.estado] || l.estado}</span> : null}
          </span>
          <span className="flex items-center gap-3">
            <span className="panel-mono text-xs text-slate-700 dark:text-slate-300">{fmtFecha(l.fecha)}</span>
            <span className="font-medium text-slate-800 dark:text-slate-100">{textoPedido(l)}</span>
            <Link to={`/requerimientos/${l.requerimientoId}`} className="text-brand-700 hover:underline print:hidden dark:text-brand-400">
              Abrir
            </Link>
          </span>
        </li>
      ))}
    </ul>
  )
}

function FilaSinIdentificar({ fila, onVincular, ocupado, soloLectura = false }) {
  const [texto, setTexto] = useState('')
  return (
    <div className="space-y-3 border-b border-brand-600/20 py-3 dark:border-brand-400/20">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">«{fila.texto}»</p>
        <p className="text-sm text-slate-700 dark:text-slate-300">Total pedido: <strong>{fila.total}</strong></p>
      </div>
      <Desglose lineas={fila.desglose} mostrarEstado={soloLectura} />
      {soloLectura ? (
        fila.sugerencias.length > 0 && (
          <p className="text-xs text-slate-700 dark:text-slate-300">
            Parecido a: {fila.sugerencias.map((s) => s.nombre).join(' · ')}
          </p>
        )
      ) : (
      <div className="space-y-2 print:hidden">
        {fila.sugerencias.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-700 dark:text-slate-300">¿Es alguno de estos?</span>
            {fila.sugerencias.map((s) => (
              <Btn key={s._id} variante="secundario" disabled={ocupado} onClick={() => onVincular(fila, s._id)} className="!px-2.5 !py-1 text-xs">
                {s.nombre}
              </Btn>
            ))}
          </div>
        )}
        <ArticuloSelector texto={texto} onTexto={setTexto} onElegir={(a) => onVincular(fila, a._id)} placeholder="O busca otro artículo del catálogo" />
      </div>
      )}
    </div>
  )
}

// supervision: misma pantalla en solo lectura sobre todos los requerimientos
// de compra (Admin), para comprobar cómo se identifica cada producto.
export default function ConsolidadoBodegaPage({ supervision = false }) {
  const [estado, setEstado] = useState('')
  // Bodega: los despachados salen de "Qué despachar" pero se pueden consultar aparte.
  const [despachados, setDespachados] = useState(false)
  const { data, cargando, error, recargarSilencioso } = useDatosConCache(
    supervision ? `requerimientos:consolidadoSupervision:${estado}` : `requerimientos:consolidadoBodega:${despachados}`,
    () => (supervision ? requerimientosApi.consolidadoSupervision(estado) : requerimientosApi.consolidadoBodega(despachados)),
    { ttlMs: 15_000 },
  )
  const [abiertos, setAbiertos] = useState(() => new Set())
  const [ocupado, setOcupado] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')
  const [ok, setOk] = useState('')

  useAutoRefresh(recargarSilencioso)

  function alternar(id) {
    setAbiertos((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  // Vincula TODAS las líneas que comparten ese texto libre al mismo artículo.
  async function vincularFila(fila, articuloId) {
    setOcupado(true)
    setErrorAccion('')
    setOk('')
    try {
      for (const l of fila.desglose) {
        // eslint-disable-next-line no-await-in-loop
        await requerimientosApi.vincularItem(l.requerimientoId, l.itemId, articuloId)
      }
      setOk(`«${fila.texto}» vinculado al catálogo`)
      await recargarSilencioso()
    } catch (err) {
      setErrorAccion(err.message)
    } finally {
      setOcupado(false)
    }
  }

  const articulos = data?.articulos || []
  const sinIdentificar = data?.sinIdentificar || []
  const soloLectura = supervision || despachados
  const vacio = !cargando && articulos.length === 0 && sinIdentificar.length === 0

  // Agrupa por "grupo" de Elisa, ya vienen ordenados por grupo y nombre.
  const grupos = []
  for (const fila of articulos) {
    const g = fila.articulo.grupo || 'SIN GRUPO'
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.nombre === g) ultimo.filas.push(fila)
    else grupos.push({ nombre: g, filas: [fila] })
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold !text-black dark:!text-white">
          <ClipboardList className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden="true" />
          {supervision ? 'Consolidado de productos' : despachados ? 'Ya despachado' : 'Qué despachar'}
        </h1>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {!supervision && (
            <Btn variante="secundario" onClick={() => setDespachados((v) => !v)}>
              {despachados ? 'Ver pendientes' : 'Ver despachados'}
            </Btn>
          )}
          {supervision && (
            <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-48">
              {ESTADOS_SUPERVISION.map((o) => (
                <option key={o.valor} value={o.valor}>{o.label}</option>
              ))}
            </Select>
          )}
          <Link to={supervision ? '/requerimientos/todos' : '/requerimientos/bodega'}>
            <Btn variante="secundario" className="flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {supervision ? 'Todos' : 'Bandeja'}
            </Btn>
          </Link>
          {!supervision && (
            <Link to="/requerimientos/catalogo">
              <Btn variante="secundario" className="flex items-center gap-1.5">
                <Library className="h-4 w-4" aria-hidden="true" /> Catálogo
              </Btn>
            </Link>
          )}
          <Btn variante="secundario" onClick={() => window.print()} className="flex items-center gap-1.5">
            <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir
          </Btn>
        </div>
      </div>

      <ErrorMsg>{error || errorAccion}</ErrorMsg>
      {ok && <OkMsg>{ok}</OkMsg>}

      {cargando ? (
        <Card>Cargando…</Card>
      ) : vacio ? (
        <EmptyState mensaje={supervision ? 'No hay productos con este filtro' : despachados ? 'Aún no se ha despachado nada' : 'No hay nada pendiente por despachar'} />
      ) : (
        <>
          <p className="flex flex-wrap gap-x-6 gap-y-1 border-y border-brand-600/20 py-2 text-sm text-slate-700 dark:border-brand-400/20 dark:text-slate-300">
            <Resumen etiqueta={supervision ? 'Requerimientos' : despachados ? 'Requerimientos despachados' : 'Requerimientos pendientes'} valor={data.requerimientos} />
            <Resumen etiqueta="Artículos" valor={articulos.length} />
            {!soloLectura && <Resumen etiqueta="Sin stock suficiente" valor={data.sinStock} alerta />}
            <Resumen etiqueta="Por identificar" valor={sinIdentificar.length} alerta />
          </p>

          {sinIdentificar.length > 0 && (
            <section>
              <h2 className="panel-mono text-xs uppercase tracking-[0.1em] text-warn-700 dark:text-warn-400">
                {supervision ? 'Sin identificar — no coinciden con el catálogo' : 'Por identificar — vincúlalos al catálogo para sumarlos'}
              </h2>
              {sinIdentificar.map((fila) => (
                <FilaSinIdentificar key={fila.texto} fila={fila} onVincular={vincularFila} ocupado={ocupado} soloLectura={soloLectura} />
              ))}
            </section>
          )}

          {grupos.map((g) => (
            <section key={g.nombre} className="space-y-2">
              <h2 className="panel-mono text-xs uppercase tracking-[0.1em] text-brand-700 dark:text-brand-400">{g.nombre}</h2>
              <TablaWrap cuadricula>
                <thead>
                  <tr>
                    <Th>Artículo (nombre en Elisa)</Th>
                    <Th>Despachar</Th>
                    <Th>En existencia</Th>
                    {!soloLectura && <Th>Estado</Th>}
                  </tr>
                </thead>
                <tbody>
                  {g.filas.map((f) => {
                    const id = f.articulo._id
                    const abierto = abiertos.has(id)
                    return (
                      <Fragment key={id}>
                        <tr onClick={() => alternar(id)} className="cursor-pointer">
                          <Td>
                            <span className="flex items-center gap-1.5 font-medium">
                              {abierto ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
                              {f.articulo.nombre}
                            </span>
                          </Td>
                          <Td className="text-base font-semibold">{f.total}</Td>
                          <Td>{f.articulo.existencia}</Td>
                          {!soloLectura && (
                            <Td>
                              {f.faltante > 0 ? (
                                <span className="text-warn-700 dark:text-warn-400">Faltan {f.faltante}</span>
                              ) : (
                                <span className="text-accent-700 dark:text-accent-400">Hay stock</span>
                              )}
                            </Td>
                          )}
                        </tr>
                        {abierto && (
                          <tr>
                            <Td colSpan={soloLectura ? 3 : 4} className="!bg-transparent">
                              <Desglose lineas={f.desglose} mostrarEstado={supervision} />
                            </Td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </TablaWrap>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
