import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Wrench, Gauge, FileText, CalendarDays, ShieldCheck, ScrollText, SlidersHorizontal, RotateCcw } from 'lucide-react'
import { useAuth, usaPanelDenso } from '../../auth/AuthContext.jsx'
import { useEsMovil } from '../../layout/useEsMovil.js'
import { useModulosVisibles } from '../../layout/AppLayout.jsx'
import { dashboard } from '../../api/operacion.js'
import { ErrorMsg } from '../../components/ui.jsx'
import { ListRow, QuickAction, SectionHeader } from '../../components/mobileUi.jsx'
import { MOBILE_NAV_POR_ROL } from '../../config/mobileNavPorRol.js'
import { StatCard } from '../../components/dashboard/StatCard.jsx'
import { TrendBadge } from '../../components/dashboard/TrendBadge.jsx'
import { AccesoRapidoDenso } from '../../components/dashboard/AccesoRapidoDenso.jsx'
import { ControlesTarjeta } from '../../components/dashboard/ControlesTarjeta.jsx'
import { usePersonalizacionDashboard } from '../../components/dashboard/usePersonalizacionDashboard.js'
import { SkeletonStatCards } from '../../components/Skeleton.jsx'
import { ACCESOS_RAPIDOS_PANEL_DENSO } from '../../config/accesosRapidosPorRol.js'
import { cn } from '../../lib/cn.js'

// Cada tarjeta declara su clave en la respuesta de /api/dashboard; solo se
// pintan las claves que el backend devolvió (que a su vez dependen de los
// permisos del rol). `to` la vuelve un acceso directo al módulo. `trendKey`
// (opcional) apunta a `tendencias[trendKey]` — ninguna tarjeta actual tiene
// un delta real (la única que lo tenía, despachosHoy, se retiró junto con
// el módulo flota/operación de despachos).
const TARJETAS = [
  { clave: 'usuarios', label: 'Usuarios activos', icon: Users, to: '/usuarios' },
  { clave: 'danosPendientes', label: 'Daños pendientes', icon: Wrench, to: '/danos/tareas', tono: 'amber' },
  { clave: 'requerimientosPendientes', label: 'Requerimientos pendientes', icon: FileText, to: '/requerimientos/todos', tono: 'amber' },
  { clave: 'requerimientosPorDespachar', label: 'Requerimientos por despachar', icon: FileText, to: '/requerimientos/bodega', tono: 'amber' },
  { clave: 'ausenciasPendientes', label: 'Ausencias por decidir', icon: CalendarDays, to: '/ausencias/bandeja', tono: 'amber' },
  { clave: 'mantenimientoAbiertas', label: 'Órdenes de trabajo abiertas', icon: Wrench, to: '/mantenimiento/ordenes', tono: 'amber' },
  { clave: 'rolesActivos', label: 'Roles activos', icon: ShieldCheck, to: '/roles' },
  { clave: 'auditoriaHoy', label: 'Eventos de auditoría hoy', icon: ScrollText, to: '/auditoria' },
  { clave: 'misDanosReportados', label: 'Mis daños sin resolver', icon: Wrench, to: '/danos/reportar' },
  { clave: 'misTareasMantenimiento', label: 'Mis tareas pendientes', icon: Wrench, to: '/danos/mis-tareas', tono: 'amber' },
]

const TONOS_MOVIL = {
  brand: 'text-[var(--mobile-accent)]',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
}

function saludo() {
  const hora = new Date().getHours()
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function HomeFeed({ usuario, visibles, tarjetas }) {
  // Mismo filtro defensivo que la barra inferior de MobileShell: un atajo
  // curado nunca debe apuntar a una ruta que este rol no tiene permiso de
  // ver (ver mobileNavPorRol.js).
  const modulosVisibles = useModulosVisibles()
  const rutasPermitidas = new Set(modulosVisibles.flatMap((m) => m.items.map((i) => i.to)))
  const accesos = (MOBILE_NAV_POR_ROL[usuario?.rol?.slug] || []).filter((a) => rutasPermitidas.has(a.to))
  const primerNombre = usuario?.nombre?.trim().split(/\s+/)[0] || usuario?.nombre

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6">
        <p className="text-sm text-[var(--mobile-text-dim)]">{saludo()}</p>
        <h1 className="text-xl font-bold text-[var(--mobile-text)]">{primerNombre}</h1>
      </div>

      {accesos.length > 0 && (
        <div className="mb-6 flex gap-4 overflow-x-auto pb-1">
          {accesos.map((a) => (
            <QuickAction key={a.to} icon={a.icon} label={a.label} to={a.to} />
          ))}
        </div>
      )}

      <SectionHeader>Resumen</SectionHeader>
      {!tarjetas ? (
        <p className="text-sm text-[var(--mobile-text-dim)]">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {visibles.map((t) => (
            <Link key={t.clave} to={t.to}>
              <ListRow
                icon={t.icon}
                title={t.label}
                trailing={
                  <span className={`text-2xl font-bold ${TONOS_MOVIL[t.tono] || 'text-[var(--mobile-text)]'}`}>
                    {tarjetas[t.clave]}
                  </span>
                }
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function PanelDenso({ usuario, visibles, tarjetas, tendencias }) {
  // Mismo filtro defensivo que HomeFeed (móvil): un atajo curado nunca debe
  // apuntar a una ruta que este rol no tiene permiso de ver.
  const modulosVisibles = useModulosVisibles()
  const rutasPermitidas = new Set(modulosVisibles.flatMap((m) => m.items.map((i) => i.to)))
  const accesos = (ACCESOS_RAPIDOS_PANEL_DENSO[usuario?.rol?.slug] || []).filter((a) => rutasPermitidas.has(a.to))

  const {
    personalizando,
    setPersonalizando,
    visiblesMostradas,
    mover,
    alternarOculta,
    esOculta,
    restablecer,
  } = usePersonalizacionDashboard(visibles)

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <Gauge className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            Panel de control
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            {usuario?.nombre} · <span className="text-brand-700/80 dark:text-brand-400/80">{usuario?.rol?.nombre}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {accesos.map((a) => (
            <AccesoRapidoDenso key={a.to} icon={a.icon} label={a.label} to={a.to} />
          ))}
          {personalizando && (
            <button
              type="button"
              onClick={restablecer}
              className="panel-btn-fantasma inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Restablecer
            </button>
          )}
          <button
            type="button"
            onClick={() => setPersonalizando((p) => !p)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
              personalizando ? 'panel-btn-primario' : 'panel-btn-secundario'
            )}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {personalizando ? 'Listo' : 'Personalizar'}
          </button>
        </div>
      </div>

      {!tarjetas ? (
        <SkeletonStatCards cantidad={8} />
      ) : (
        <>
          {personalizando && (
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Usa las flechas para reordenar y el ojo para ocultar/mostrar. Se guarda en este navegador.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visiblesMostradas.map((t, i) => {
              const delta = t.trendKey ? tendencias?.[t.trendKey] : null
              const tarjeta = (
                <StatCard
                  icon={t.icon}
                  label={t.label}
                  valor={tarjetas[t.clave]}
                  tono={t.tono || 'brand'}
                  className={personalizando ? cn('pt-9', esOculta(t.clave) && 'opacity-40') : undefined}
                  trend={
                    delta && (
                      <TrendBadge
                        actual={delta.actual}
                        anterior={delta.anterior}
                        incrementoEsBueno={t.incrementoEsBueno ?? true}
                        titulo="vs. ayer"
                      />
                    )
                  }
                />
              )
              if (!personalizando) {
                return (
                  <Link key={t.clave} to={t.to}>
                    {tarjeta}
                  </Link>
                )
              }
              return (
                <div key={t.clave} className="relative">
                  {tarjeta}
                  <ControlesTarjeta
                    oculta={esOculta(t.clave)}
                    puedeMoverIzquierda={i > 0}
                    puedeMoverDerecha={i < visiblesMostradas.length - 1}
                    onMoverIzquierda={() => mover(t.clave, -1)}
                    onMoverDerecha={() => mover(t.clave, 1)}
                    onAlternarOculta={() => alternarOculta(t.clave)}
                  />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { usuario } = useAuth()
  const esMovil = useEsMovil()
  const [tarjetas, setTarjetas] = useState(null)
  const [tendencias, setTendencias] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    dashboard
      .resumen()
      .then((data) => {
        setTarjetas(data.tarjetas)
        setTendencias(data.tendencias)
      })
      .catch((err) => setError(err.message))
  }, [])

  const visibles = tarjetas ? TARJETAS.filter((t) => tarjetas[t.clave] !== undefined) : []

  return (
    <>
      <ErrorMsg>{error}</ErrorMsg>
      {usaPanelDenso(usuario) && !esMovil ? (
        <PanelDenso usuario={usuario} visibles={visibles} tarjetas={tarjetas} tendencias={tendencias} />
      ) : (
        <HomeFeed usuario={usuario} visibles={visibles} tarjetas={tarjetas} />
      )}
    </>
  )
}
