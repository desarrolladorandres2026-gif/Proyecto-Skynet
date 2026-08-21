import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Rocket, Plus, Pause, Play, Ban, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { sig } from '../../api/sig.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Btn, Badge, Card, ErrorMsg, Modal, TablaWrap, Th, Td, EmptyState, fmtFecha, fmtFechaHora } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'

export default function CampanasListaPage() {
  const { data: campanas, cargando, error, recargar } = useDatosConCache(
    'sig:campanas',
    () => sig.programacion.listarCampanas().then((d) => d.campanas),
    { ttlMs: 30_000 },
  )

  const [detalle, setDetalle] = useState(null)
  const [porCancelar, setPorCancelar] = useState(null)
  const [cancelando, setCancelando] = useState(false)

  async function verDetalle(campana) {
    try {
      const data = await sig.programacion.detalleCampana(campana._id)
      setDetalle(data)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function pausar(id) {
    try {
      await sig.programacion.pausarCampana(id)
      toast.success('Campaña pausada')
      recargar()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function reanudar(id) {
    try {
      await sig.programacion.reanudarCampana(id)
      toast.success('Campaña reanudada')
      recargar()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function confirmarCancelar() {
    if (!porCancelar) return
    setCancelando(true)
    try {
      await sig.programacion.cancelarCampana(porCancelar._id, '')
      toast.success('Campaña cancelada')
      recargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCancelando(false)
      setPorCancelar(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <Rocket className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Campañas SIG
        </h1>
        <div className="flex items-center gap-3">
          <Link to="/sig/programacion" className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-400">
            Ver programación individual
          </Link>
          <Link to="/sig/programacion/campanas/nueva">
            <Btn className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" aria-hidden="true" /> Programar campaña
            </Btn>
          </Link>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : !campanas || campanas.length === 0 ? (
        <EmptyState mensaje="Todavía no hay campañas programadas" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Rango</Th>
              <Th>Preguntas</Th>
              <Th>Estado</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {campanas.map((c) => (
              <tr key={c._id}>
                <Td>{c.nombre}</Td>
                <Td className="whitespace-nowrap">{fmtFecha(c.fechaInicio)} — {fmtFecha(c.fechaFin)}</Td>
                <Td>{c.totalProgramaciones}</Td>
                <Td>
                  <Badge
                    valor={c.estado}
                    label={{ activa: 'Activa', pausada: 'Pausada', finalizada: 'Finalizada', cancelada: 'Cancelada' }[c.estado]}
                  />
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <Btn variante="fantasma" className="!p-2" aria-label="Ver programaciones" onClick={() => verDetalle(c)}>
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  </Btn>
                  {c.estado === 'activa' && (
                    <Btn variante="fantasma" className="!p-2" aria-label="Pausar" onClick={() => pausar(c._id)}>
                      <Pause className="h-4 w-4" aria-hidden="true" />
                    </Btn>
                  )}
                  {c.estado === 'pausada' && (
                    <Btn variante="fantasma" className="!p-2" aria-label="Reanudar" onClick={() => reanudar(c._id)}>
                      <Play className="h-4 w-4" aria-hidden="true" />
                    </Btn>
                  )}
                  {['activa', 'pausada'].includes(c.estado) && (
                    <Btn variante="fantasma" className="!p-2 !text-red-600 dark:!text-red-400" aria-label="Cancelar" onClick={() => setPorCancelar(c)}>
                      <Ban className="h-4 w-4" aria-hidden="true" />
                    </Btn>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <Modal abierto={Boolean(detalle)} titulo={detalle?.campana?.nombre || 'Campaña'} onCerrar={() => setDetalle(null)} ancho="max-w-2xl">
        {detalle && (
          <TablaWrap>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Pregunta</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {detalle.programaciones.map((p) => (
                <tr key={p._id}>
                  <Td className="whitespace-nowrap">{fmtFechaHora(p.fechaHoraPublicacion)}</Td>
                  <Td>{p.pregunta?.enunciado || p.snapshotPregunta?.enunciado || '—'}</Td>
                  <Td><Badge valor={p.estado} label={{ programada: 'Programada', publicada: 'Publicada', cancelada: 'Cancelada' }[p.estado]} /></Td>
                </tr>
              ))}
            </tbody>
          </TablaWrap>
        )}
      </Modal>

      <ConfirmDialog
        abierto={Boolean(porCancelar)}
        onCancelar={() => setPorCancelar(null)}
        onConfirmar={confirmarCancelar}
        cargando={cancelando}
        titulo="¿Cancelar esta campaña?"
        descripcion="Las publicaciones futuras (aún no publicadas) se cancelan. Las que ya se publicaron y respondieron no se alteran."
        confirmarLabel="Cancelar campaña"
      />
    </div>
  )
}
