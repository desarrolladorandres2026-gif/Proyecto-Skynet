import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Inbox } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../DropdownMenu.jsx'
import { Tooltip } from '../Tooltip.jsx'
import { useCentroNotificaciones } from './useCentroNotificaciones.js'

const ETIQUETA_CATEGORIA = {
  mantenimiento: 'Mantenimiento',
  danos: 'Daños',
  requerimientos: 'Requerimientos',
  ausencias: 'Ausencias',
  sig_pregunta_dia: 'Cuestionarios',
  sistema: 'Sistema',
}

function etiquetaDe(categoria) {
  return ETIQUETA_CATEGORIA[categoria] || categoria
}

// "hace 5 min" / "hace 3 h" / fecha corta: una notificación reciente importa
// por cuánto hace que pasó, no por la hora exacta — eso ya se ve al abrir el
// historial completo (CentroNotificacionesPage).
function tiempoRelativo(valor) {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  const minutos = Math.round((Date.now() - fecha.getTime()) / 60_000)
  if (minutos < 1) return 'ahora'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.round(horas / 24)
  if (dias < 7) return `hace ${dias} d`
  return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

export function NotificacionesBell() {
  const navigate = useNavigate()
  const { noLeidas, notificaciones, cargando, cargarLista, marcarLeida, marcarTodasLeidas } = useCentroNotificaciones()

  async function alHacerClic(n) {
    if (!n.leida) marcarLeida(n._id)
    if (n.url) navigate(n.url)
  }

  return (
    <DropdownMenu onOpenChange={(abierto) => abierto && cargarLista()}>
      <DropdownMenuTrigger asChild>
        <Tooltip label="Notificaciones" side="bottom">
          <button
            type="button"
            className="group relative flex shrink-0 items-center justify-center rounded-xl p-2 transition-all duration-300 bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-cyan-500/30 text-slate-700 dark:text-cyan-300 hover:border-cyan-400 dark:hover:border-cyan-400 dark:shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:scale-105 active:scale-95"
            aria-label={noLeidas > 0 ? `Notificaciones, ${noLeidas} sin leer` : 'Notificaciones'}
          >
            <Bell className="h-4 w-4 text-cyan-600 dark:text-cyan-400 group-hover:rotate-12 transition-transform duration-300" aria-hidden="true" />
            {noLeidas > 0 && (
              <span className="panel-mono absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_8px_rgba(244,63,94,0.6)]">
                {noLeidas > 9 ? '9+' : noLeidas}
              </span>
            )}
          </button>
        </Tooltip>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="bottom" align="end" sideOffset={10} className="w-96 max-w-[90vw] p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <DropdownMenuLabel className="p-0">Notificaciones</DropdownMenuLabel>
          {noLeidas > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                marcarTodasLeidas()
              }}
              className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Marcar todas leídas
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />

        <div className="max-h-[60vh] overflow-y-auto overscroll-contain py-1">
          {cargando && notificaciones.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">Cargando…</p>
          )}
          {!cargando && notificaciones.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <Inbox className="h-5 w-5 text-slate-300 dark:text-slate-600" aria-hidden="true" />
              <p className="text-xs text-slate-400 dark:text-slate-500">No tienes notificaciones todavía</p>
            </div>
          )}
          {notificaciones.map((n) => (
            <DropdownMenuItem
              key={n._id}
              onSelect={(e) => {
                e.preventDefault()
                alHacerClic(n)
              }}
              className="flex-col items-stretch gap-0.5 whitespace-normal py-2.5"
            >
              <div className="flex w-full items-start gap-2">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${n.leida ? 'bg-transparent' : 'bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.8)]'}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-[13px] ${n.leida ? 'font-normal text-slate-600 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-white'}`}>
                      {n.titulo}
                    </p>
                    <span className="panel-mono shrink-0 text-[10px] text-slate-400 dark:text-slate-500">{tiempoRelativo(n.createdAt)}</span>
                  </div>
                  {n.cuerpo && <p className="mt-0.5 line-clamp-2 text-[12px] text-slate-500 dark:text-slate-400">{n.cuerpo}</p>}
                  <span className="panel-mono mt-1 inline-block rounded-full bg-brand-600/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-400/10 dark:text-brand-300">
                    {etiquetaDe(n.categoria)}
                  </span>
                </div>
              </div>
            </DropdownMenuItem>
          ))}
        </div>

        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem asChild className="justify-center rounded-none rounded-b-xl">
          <button type="button" onClick={() => navigate('/notificaciones/centro')} className="w-full text-center text-[12px] font-medium">
            Ver todas las notificaciones
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
