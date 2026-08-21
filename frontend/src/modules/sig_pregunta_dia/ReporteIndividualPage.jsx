import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { UserRoundSearch, Search, ArrowLeft, ChevronRight } from 'lucide-react'
import { sig } from '../../api/sig.js'
import { catalogosApi } from '../../api/catalogos.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import {
  Btn, Card, ErrorMsg, Input, Badge, TablaWrap, Th, Td, EmptyState, fmtFecha,
} from '../../components/ui.jsx'
import FiltrosDashboardSig from '../../components/sig/FiltrosDashboardSig.jsx'

const FILTROS_VACIOS = { desde: '', hasta: '', dependencia: '', cargo: '', componenteSig: '', tema: '', resultado: '' }

// Sin tildes y en minúsculas: buscar "jose" tiene que encontrar a "José".
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export default function ReporteIndividualPage() {
  const [busqueda, setBusqueda] = useState('')
  const [usuarioId, setUsuarioId] = useState('')
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [reporte, setReporte] = useState(null)
  const [cargando, setCargando] = useState(false)

  const { data: configYCatalogos } = useDatosConCache(
    'sig:reporteIndividual:configYCatalogos',
    () => Promise.all([sig.configuracion.obtener(), catalogosApi.obtener()])
      .then(([config, cat]) => ({ componentes: config.configuracion.componentes, catalogos: cat })),
    { ttlMs: 5 * 60_000 },
  )
  const componentes = configYCatalogos?.componentes || []
  const catalogos = configYCatalogos?.catalogos || { dependencias: [], cargos: [] }

  // La lista respeta los mismos filtros que el detalle: si no, la tabla diría
  // "48 respondidas" y al abrir a esa persona con el rango aplicado saldrían
  // 12, y no habría forma de saber cuál de los dos número es el bueno.
  const {
    data: trabajadores,
    cargando: cargandoLista,
    error,
    recargar: recargarLista,
  } = useDatosConCache(
    `sig:reporteIndividual:lista:${JSON.stringify(filtros)}`,
    () => sig.trabajadoresParticipantes(filtros).then((d) => d.trabajadores),
    { ttlMs: 30_000 },
  )

  async function consultarDetalle(id = usuarioId, filtrosActuales = filtros) {
    if (!id) return
    setCargando(true)
    try {
      setReporte(await sig.reporteTrabajador(id, filtrosActuales))
    } catch (err) {
      toast.error(err.message)
      setReporte(null)
    } finally {
      setCargando(false)
    }
  }

  function aplicarFiltros() {
    recargarLista()
    if (usuarioId) consultarDetalle()
  }

  function abrirTrabajador(id) {
    setUsuarioId(id)
    setReporte(null)
    consultarDetalle(id)
  }

  function volverAlListado() {
    setUsuarioId('')
    setReporte(null)
  }

  const visibles = useMemo(() => {
    const lista = trabajadores || []
    const texto = normalizar(busqueda.trim())
    if (!texto) return lista
    return lista.filter(
      (t) =>
        normalizar(t.nombre).includes(texto) ||
        normalizar(t.nombre_usuario).includes(texto) ||
        normalizar(t.cargo).includes(texto) ||
        normalizar(t.dependencia).includes(texto)
    )
  }, [trabajadores, busqueda])

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        {usuarioId && (
          <Btn variante="fantasma" className="flex items-center gap-1.5 !px-2" onClick={volverAlListado}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Listado
          </Btn>
        )}
        <UserRoundSearch className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <h1 className="panel-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          Reporte individual
        </h1>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <FiltrosDashboardSig
        filtros={filtros}
        onChange={setFiltros}
        onAplicar={aplicarFiltros}
        componentes={componentes}
        catalogos={catalogos}
      />

      {!usuarioId ? (
        <>
          <Card className="mb-4">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                className="!pl-8"
                placeholder="Filtrar por nombre, cargo o dependencia…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Filtrar el listado por nombre"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {cargandoLista
                ? 'Cargando…'
                : `${visibles.length} de ${(trabajadores || []).length} trabajador${(trabajadores || []).length === 1 ? '' : 'es'} con respuestas registradas`}
            </p>
          </Card>

          {cargandoLista ? (
            <Card>Cargando…</Card>
          ) : visibles.length === 0 ? (
            <EmptyState
              mensaje={
                (trabajadores || []).length === 0
                  ? 'Todavía nadie ha respondido dentro de los filtros aplicados'
                  : 'Ningún trabajador coincide con la búsqueda'
              }
            />
          ) : (
            <TablaWrap>
              <thead>
                <tr>
                  <Th>Trabajador</Th>
                  <Th>Cargo</Th>
                  <Th>Dependencia</Th>
                  <Th>Respondidas</Th>
                  <Th>Acierto</Th>
                  <Th>Nivel</Th>
                  <Th>Última respuesta</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((t) => (
                  <tr
                    key={t._id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Ver el reporte de ${t.nombre}`}
                    className="cursor-pointer transition-colors hover:bg-cyan-500/5 focus-visible:bg-cyan-500/10 focus-visible:outline-none"
                    onClick={() => abrirTrabajador(t._id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        abrirTrabajador(t._id)
                      }
                    }}
                  >
                    <Td>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{t.nombre}</span>
                      {!t.activo && (
                        <span className="ml-1.5 text-[11px] text-slate-400">(inactivo)</span>
                      )}
                    </Td>
                    <Td>{t.cargo || '—'}</Td>
                    <Td>{t.dependencia || '—'}</Td>
                    <Td className="whitespace-nowrap">
                      {t.total}
                      <span className="text-xs text-slate-400"> ({t.correctas}✓ / {t.incorrectas}✗)</span>
                    </Td>
                    <Td className="font-semibold whitespace-nowrap">{t.porcentaje}%</Td>
                    <Td className="whitespace-nowrap">
                      {t.nivel ? (
                        <span className="font-semibold" style={{ color: t.nivel.color }}>{t.nivel.nombre}</span>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{fmtFecha(t.ultimaRespuesta)}</Td>
                    <Td className="text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-slate-400" aria-hidden="true" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TablaWrap>
          )}
        </>
      ) : cargando || !reporte ? (
        <Card>Cargando…</Card>
      ) : (
        <>
          <Card className="mb-4">
            <p className="text-base font-semibold text-slate-900 dark:text-white">{reporte.trabajador.nombre}</p>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              {reporte.trabajador.cargo || 'Sin cargo'} · {reporte.trabajador.dependencia || 'Sin dependencia'}
            </p>
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{reporte.total}</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Respondidas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{reporte.correctas}</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Correctas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{reporte.incorrectas}</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Incorrectas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{reporte.porcentaje}%</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Acierto</p>
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: reporte.nivel?.color }}>{reporte.nivel?.nombre || '—'}</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Nivel</p>
              </div>
            </div>
          </Card>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Desempeño por componente</p>
              {reporte.porComponente.length === 0 ? (
                <EmptyState mensaje="Sin datos" />
              ) : (
                <div className="space-y-2">
                  {reporte.porComponente.map((c) => (
                    <div key={c.componenteSig} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">{c.componenteSig}</span>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{c.correctas}/{c.total} ({c.porcentaje}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Temas con más errores</p>
              {reporte.temasConMasErrores.length === 0 ? (
                <EmptyState mensaje="Sin errores registrados" />
              ) : (
                <div className="space-y-2">
                  {reporte.temasConMasErrores.map((t) => (
                    <div key={t.tema} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">{t.tema}</span>
                      <Badge valor="incorrecta" label={`${t.errores} error${t.errores === 1 ? '' : 'es'}`} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card>
            <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Historial de respuestas</p>
            {reporte.historial.length === 0 ? (
              <EmptyState mensaje="Sin respuestas en el rango filtrado" />
            ) : (
              <TablaWrap>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Componente</Th>
                    <Th>Tema</Th>
                    <Th>Resultado</Th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.historial.map((r) => (
                    <tr key={r._id}>
                      <Td className="whitespace-nowrap">{fmtFecha(r.fechaProgramada)}</Td>
                      <Td>{r.componenteSigSnapshot}</Td>
                      <Td>{r.temaSnapshot}</Td>
                      <Td>{r.esCorrecta ? <Badge valor="correcta" label="Correcta" /> : <Badge valor="incorrecta" label="Incorrecta" />}</Td>
                    </tr>
                  ))}
                </tbody>
              </TablaWrap>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
