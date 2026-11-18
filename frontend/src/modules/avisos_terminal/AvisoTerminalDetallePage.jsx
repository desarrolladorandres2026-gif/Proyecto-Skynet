import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Megaphone, RotateCcw } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { avisosTerminal } from '../../api/avisosTerminal.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Badge, Btn, EmptyState, ErrorMsg, TablaWrap, Th, Td, fmtFechaHora } from '../../components/ui.jsx'
import { SkeletonTable } from '../../components/Skeleton.jsx'

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  enviado: 'Enviado',
  entregado: 'Recibido',
  reproducido: 'Reproducido',
  fallido: 'Fallido',
  cancelado: 'Reemplazado',
}
const ESTADO_COLOR = {
  pendiente: 'pendiente',
  enviado: 'programado',
  entregado: 'programado',
  reproducido: 'activo',
  fallido: 'error',
  cancelado: 'cancelado',
}

// Por dónde le puede llegar el aviso a cada persona (calculado por el backend
// en obtenerDetalle). Lo que importa al administrador: quién NO lo va a oír
// con el teléfono bloqueado.
const CANAL_LABEL = {
  app: 'App conectada',
  app_sin_conexion: 'App sin conexión',
  web: 'Solo navegador',
  ninguno: 'Sin dispositivo',
}
const CANAL_COLOR = {
  app: 'activo',
  app_sin_conexion: 'pendiente',
  web: 'programado',
  ninguno: 'error',
}

function Resumen({ entregas }) {
  const total = entregas.length
  const conteo = (fn) => entregas.filter(fn).length
  const items = [
    { etiqueta: 'Destinatarios', valor: total },
    { etiqueta: 'Recibieron', valor: conteo((e) => e.estado === 'entregado' || e.estado === 'reproducido') },
    { etiqueta: 'Escucharon', valor: conteo((e) => e.estado === 'reproducido') },
    { etiqueta: 'Sin oírlo', valor: conteo((e) => e.estado !== 'reproducido') },
    { etiqueta: 'App sin conexión', valor: conteo((e) => e.canal === 'app_sin_conexion') },
    { etiqueta: 'Sin app ni dispositivo', valor: conteo((e) => e.canal === 'ninguno' || e.canal === 'web') },
  ]
  return (
    <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((i) => (
        <div key={i.etiqueta} className="panel-card rounded-xl p-3">
          <dt className="text-xs text-slate-500 dark:text-slate-400">{i.etiqueta}</dt>
          <dd className="mt-0.5 text-xl font-bold text-slate-900 dark:text-white">{i.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function AvisoTerminalDetallePage() {
  const { id } = useParams()
  const { tienePermiso } = useAuth()
  const { data, cargando, error, recargar } = useDatosConCache(`avisosTerminal:detalle:${id}`, () => avisosTerminal.detalle(id), {
    ttlMs: 15_000,
  })
  const [reenviando, setReenviando] = useState(false)
  const puedeReenviar = Boolean(tienePermiso('avisos_terminal:transmitir'))
  const sinEscuchar = data?.entregas.filter((e) => ['pendiente', 'enviado', 'entregado'].includes(e.estado)).length || 0

  async function reenviar() {
    setReenviando(true)
    try {
      const { reenviados } = await avisosTerminal.reenviar(id)
      toast.success(`Aviso reenviado a ${reenviados} persona${reenviados === 1 ? '' : 's'} que no lo habían escuchado.`)
      recargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setReenviando(false)
    }
  }

  return (
    <div>
      <Link to="/avisos-terminal/transmitir" className="mb-3 inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline dark:text-brand-300">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver a Avisos Terminal de Neiva
      </Link>

      <div className="mb-1 flex items-center gap-2.5">
        <Megaphone className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Detalle del aviso</h1>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando && <SkeletonTable filas={6} />}

      {data && (
        <>
          <div className="panel-card mb-5 rounded-xl p-[var(--ui-card-padding)]">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-semibold">El Terminal de Transportes de Neiva informa que:</span> {data.aviso.texto}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span>Transmitido por <strong>{data.aviso.creadoPor?.nombre}</strong></span>
              <span>{fmtFechaHora(data.aviso.createdAt)}</span>
              <span>
                Destinatarios: <Badge valor={data.aviso.destinatarios?.tipo} label={data.aviso.destinatarios?.etiqueta || data.aviso.destinatarios?.tipo} />
              </span>
            </div>
          </div>

          {data.entregas.length > 0 && <Resumen entregas={data.entregas} />}

          {puedeReenviar && sinEscuchar > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Btn variante="secundario" disabled={reenviando} onClick={reenviar}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {reenviando ? 'Reenviando…' : `Reenviar a quienes no lo escucharon (${sinEscuchar})`}
              </Btn>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Solo se puede reenviar el aviso más reciente.
              </span>
            </div>
          )}

          {data.entregas.length === 0 ? (
            <EmptyState mensaje="Sin destinatarios registrados" />
          ) : (
            <TablaWrap>
              <thead>
                <tr>
                  <Th>Destinatario</Th>
                  <Th>Dependencia</Th>
                  <Th>Estado</Th>
                  <Th>Canal</Th>
                  <Th>Enviado</Th>
                  <Th>Recibido</Th>
                  <Th>Reproducido</Th>
                </tr>
              </thead>
              <tbody>
                {data.entregas.map((e) => (
                  <tr key={e._id}>
                    <Td>{e.usuario?.nombre || '(usuario eliminado)'}</Td>
                    <Td>{e.usuario?.dependencia || '—'}</Td>
                    <Td><Badge valor={ESTADO_COLOR[e.estado]} label={ESTADO_LABEL[e.estado]} /></Td>
                    <Td><Badge valor={CANAL_COLOR[e.canal]} label={CANAL_LABEL[e.canal] || '—'} /></Td>
                    <Td>{fmtFechaHora(e.enviadoEn)}</Td>
                    <Td>{fmtFechaHora(e.entregadoEn)}</Td>
                    <Td>{fmtFechaHora(e.reproducidoEn)}</Td>
                  </tr>
                ))}
              </tbody>
            </TablaWrap>
          )}
        </>
      )}
    </div>
  )
}
