import { useState } from 'react'
import { Megaphone, Volume2, Square } from 'lucide-react'
import { avisosTerminal } from '../../api/avisosTerminal.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { EmptyState, ErrorMsg, Pager, fmtFechaHora } from '../../components/ui.jsx'
import { useAnuncioVoz } from './useAnuncioVoz.js'
import { SelectorVozAviso } from './SelectorVozAviso.jsx'

// "Mantener una pantalla o sección de historial de avisos recibidos" (ver
// requisitos de experiencia móvil): universal para cualquier autenticado —
// recibir avisos institucionales no depende de ningún permiso, solo del
// módulo activo (ver App.jsx).
export default function MisAvisosTerminalPage() {
  const [page, setPage] = useState(1)
  const { data, cargando, error } = useDatosConCache(
    `avisosTerminal:mias:${page}`,
    () => avisosTerminal.misAvisos({ page }),
    { ttlMs: 15_000 }
  )
  const entregas = data?.entregas || []
  const pages = data?.pages || 1

  const { reproducir, detener, reproduciendo, vocesDisponibles, vozElegidaURI, elegirVoz, probarVoz } = useAnuncioVoz()
  const [reproduciendoId, setReproduciendoId] = useState(null)

  function alternar(entrega) {
    if (reproduciendoId === entrega._id && reproduciendo) {
      detener()
      setReproduciendoId(null)
      return
    }
    setReproduciendoId(entrega._id)
    reproducir({ textoLocucion: entrega.aviso.textoLocucion, avisoId: entrega.aviso._id }).finally(() =>
      setReproduciendoId(null)
    )
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-2.5">
        <Megaphone className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Mis avisos</h1>
      </div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        Anuncios institucionales del Terminal de Transportes de Neiva que has recibido.
      </p>

      {vocesDisponibles.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Voz de los avisos en este dispositivo:</span>
          <SelectorVozAviso voces={vocesDisponibles} vozElegidaURI={vozElegidaURI} onElegir={elegirVoz} onProbar={probarVoz} />
        </div>
      )}

      <ErrorMsg>{error}</ErrorMsg>

      {!cargando && entregas.length === 0 ? (
        <EmptyState mensaje="Todavía no has recibido ningún aviso institucional" />
      ) : (
        <div className="flex flex-col gap-2">
          {entregas.map((e) => {
            const activo = reproduciendoId === e._id && reproduciendo
            return (
              <div key={e._id} className="panel-card flex items-center gap-3 rounded-xl p-3.5">
                <button
                  type="button"
                  onClick={() => alternar(e)}
                  aria-label={activo ? 'Detener' : 'Reproducir de nuevo'}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-700 transition-colors hover:bg-brand-500/20 dark:text-brand-300"
                >
                  {activo ? <Square className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 dark:text-slate-200">{e.aviso.texto}</p>
                  <p className="panel-mono mt-0.5 text-[11px] tracking-wide text-slate-400 uppercase">
                    {fmtFechaHora(e.aviso.createdAt)} ·{' '}
                    {e.estado === 'reproducido'
                      ? 'Reproducido'
                      : e.estado === 'entregado'
                        ? 'Recibido'
                        : e.estado === 'cancelado'
                          ? 'Reemplazado por un aviso más nuevo'
                          : 'Enviado'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Pager page={page} pages={pages} onPage={setPage} />
    </div>
  )
}
