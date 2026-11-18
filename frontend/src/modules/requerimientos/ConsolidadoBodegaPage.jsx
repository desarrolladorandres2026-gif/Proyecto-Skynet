import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, ArrowLeft, Printer, Library } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import ReautenticacionModal from '../../components/ReautenticacionModal.jsx'
import { Btn, Card, ErrorMsg, OkMsg, Select, TablaWrap, Th, Td, EmptyState, fmtFecha } from '../../components/ui.jsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { useDatosConCache, invalidarCachePorPrefijo } from '../../hooks/useDatosConCache.js'

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

function Desglose({ lineas, mostrarEstado = false, onDespachar }) {
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
            {onDespachar && (
              <Btn onClick={() => onDespachar({ ids: [l.requerimientoId], etiqueta: `Requerimiento de ${l.solicitante}` })} className="!px-2.5 !py-1 text-xs print:hidden">
                Despachado
              </Btn>
            )}
          </span>
        </li>
      ))}
    </ul>
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
  // Línea cuyo requerimiento Bodega está marcando como despachado.
  const [porDespachar, setPorDespachar] = useState(null)
  const [ok, setOk] = useState('')

  // Al despachar, el requerimiento pasa a bodega.estado = 'aprobada' y sale
  // solo de "Qué despachar" (el consolidado filtra por 'pendiente').
  async function despachar(password) {
    for (const rid of porDespachar.ids) {
      // eslint-disable-next-line no-await-in-loop
      await requerimientosApi.marcarEstadoBodega(rid, 'aprobada', undefined, password)
    }
    setOk(`${porDespachar.etiqueta} despachado`)
    invalidarCachePorPrefijo('requerimientos:')
    await recargarSilencioso()
  }

  useAutoRefresh(recargarSilencioso)

  function alternar(id) {
    setAbiertos((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  const articulos = data?.articulos || []
  const soloLectura = supervision || despachados
  // Los productos escritos a mano (sin vincular al catálogo) también se despachan:
  // van en la misma tabla, sin dato de existencia.
  const libres = (data?.sinIdentificar || []).map((f) => ({
    articulo: { _id: `libre:${f.texto}`, nombre: f.texto, existencia: '—' },
    total: f.total,
    faltante: 0,
    desglose: f.desglose,
  }))
  const filas = [...articulos, ...libres]
  const vacio = !cargando && filas.length === 0

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

      <ErrorMsg>{error}</ErrorMsg>
      {ok && <OkMsg>{ok}</OkMsg>}
      <ReautenticacionModal
        abierto={!!porDespachar}
        titulo="Confirmar despacho"
        descripcion={`Reingresa tu contraseña para despachar ${porDespachar?.ids.length || 0} requerimiento(s) completo(s). Saldrán de «Qué despachar».`}
        onConfirmar={despachar}
        onCerrar={() => setPorDespachar(null)}
      />

      {cargando ? (
        <Card>Cargando…</Card>
      ) : vacio ? (
        <EmptyState mensaje={supervision ? 'No hay productos con este filtro' : despachados ? 'Aún no se ha despachado nada' : 'No hay nada pendiente por despachar'} />
      ) : (
        <>
          <p className="flex flex-wrap gap-x-6 gap-y-1 border-y border-brand-600/20 py-2 text-sm text-slate-700 dark:border-brand-400/20 dark:text-slate-300">
            <Resumen etiqueta="Requerimientos" valor={data.requerimientos} />
            <Resumen etiqueta="Artículos" valor={filas.length} />
            {!soloLectura && <Resumen etiqueta="Sin stock suficiente" valor={data.sinStock} alerta />}
          </p>

          <TablaWrap cuadricula>
            <thead>
              <tr>
                <Th>Artículo</Th>
                <Th>Despachar</Th>
                <Th className="print:hidden"> </Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const id = f.articulo._id
                const abierto = abiertos.has(id)
                return (
                  <Fragment key={id}>
                    <tr>
                      <Td className="font-medium">{f.articulo.nombre}</Td>
                      <Td className="text-base font-semibold">{f.total}</Td>
                      <Td className="text-right print:hidden">
                        <span className="inline-flex items-center gap-2">
                        <Btn variante="secundario" onClick={() => alternar(id)} className="!px-2.5 !py-1 text-xs">
                          {abierto ? 'Ocultar' : `Ver requerimientos (${f.desglose.length})`}
                        </Btn>
                        {!soloLectura && (
                          <Btn
                            onClick={() => setPorDespachar({
                              ids: [...new Set(f.desglose.map((l) => l.requerimientoId))],
                              etiqueta: `«${f.articulo.nombre}» (${new Set(f.desglose.map((l) => l.requerimientoId)).size} requerimiento/s)`,
                            })}
                            className="!px-2.5 !py-1 text-xs"
                          >
                            Despachar
                          </Btn>
                        )}
                        </span>
                      </Td>
                    </tr>
                    {abierto && (
                      <tr>
                        <Td colSpan={3} className="!bg-transparent">
                          <Desglose lineas={f.desglose} mostrarEstado={supervision} onDespachar={soloLectura ? undefined : setPorDespachar} />
                        </Td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </TablaWrap>
        </>
      )}
    </div>
  )
}
