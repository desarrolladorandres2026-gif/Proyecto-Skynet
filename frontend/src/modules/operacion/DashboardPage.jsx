import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Building2, Bus, IdCard, LayoutGrid, Send, AlertTriangle,
  PackageSearch, Wrench, Gauge,
} from 'lucide-react'
import { useAuth, esRolAdmin } from '../../auth/AuthContext.jsx'
import { useModulosVisibles } from '../../layout/AppLayout.jsx'
import { dashboard } from '../../api/operacion.js'
import { ErrorMsg } from '../../components/ui.jsx'
import { ListRow, QuickAction, SectionHeader } from '../../components/mobileUi.jsx'
import { MOBILE_NAV_POR_ROL } from '../../config/mobileNavPorRol.js'
import { StatCard } from '../../components/dashboard/StatCard.jsx'
import { TrendBadge } from '../../components/dashboard/TrendBadge.jsx'
import { SkeletonStatCards } from '../../components/Skeleton.jsx'

// Cada tarjeta declara su clave en la respuesta de /api/dashboard; solo se
// pintan las claves que el backend devolvió (que a su vez dependen de los
// permisos del rol). `to` la vuelve un acceso directo al módulo. `trendKey`
// (opcional) apunta a `tendencias[trendKey]` — solo despachosHoy tiene un
// delta real hoy (ver dashboard.controller.js: es la única tarjeta que ya
// es un conteo acotado a fecha, así que "hoy vs. ayer" es la MISMA métrica
// en dos días; el resto son conteos del padrón actual, sin forma barata de
// saber el valor de hace una semana sin inventar un número).
const TARJETAS = [
  { clave: 'usuarios', label: 'Usuarios activos', icon: Users, to: '/usuarios' },
  { clave: 'empresas', label: 'Empresas activas', icon: Building2, to: '/flota/empresas' },
  { clave: 'vehiculosActivos', label: 'Vehículos activos', icon: Bus, to: '/flota/vehiculos' },
  { clave: 'conductoresActivos', label: 'Conductores activos', icon: IdCard, to: '/flota/conductores' },
  { clave: 'plataformasLibres', label: 'Plataformas libres', icon: LayoutGrid, to: '/flota/plataformas', tono: 'emerald' },
  { clave: 'plataformasOcupadas', label: 'Plataformas ocupadas', icon: LayoutGrid, to: '/flota/plataformas', tono: 'amber' },
  { clave: 'despachosHoy', label: 'Despachos hoy', icon: Send, to: '/operacion/despachos', trendKey: 'despachosHoy', incrementoEsBueno: true },
  { clave: 'despachosEnViaje', label: 'En viaje', icon: Bus, to: '/operacion/despachos' },
  { clave: 'despachosRetrasados', label: 'Retrasados', icon: AlertTriangle, to: '/operacion/despachos', tono: 'amber' },
  { clave: 'novedadesAbiertas', label: 'Novedades abiertas', icon: AlertTriangle, to: '/operacion/novedades', tono: 'amber' },
  { clave: 'objetosEnCustodia', label: 'Objetos en custodia', icon: PackageSearch, to: '/operacion/objetos-perdidos' },
  { clave: 'danosPendientes', label: 'Daños pendientes', icon: Wrench, to: '/danos/tareas', tono: 'amber' },
  { clave: 'misDanosReportados', label: 'Mis daños sin resolver', icon: Wrench, to: '/danos/reportar' },
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
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <Gauge className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          Panel de control
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          {usuario?.nombre} · <span className="text-brand-700/80 dark:text-brand-400/80">{usuario?.rol?.nombre}</span>
        </p>
      </div>

      {!tarjetas ? (
        <SkeletonStatCards cantidad={8} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibles.map((t) => {
            const delta = t.trendKey ? tendencias?.[t.trendKey] : null
            return (
              <Link key={t.clave} to={t.to}>
                <StatCard
                  icon={t.icon}
                  label={t.label}
                  valor={tarjetas[t.clave]}
                  tono={t.tono || 'brand'}
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
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { usuario } = useAuth()
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
      {esRolAdmin(usuario) ? (
        <PanelDenso usuario={usuario} visibles={visibles} tarjetas={tarjetas} tendencias={tendencias} />
      ) : (
        <HomeFeed usuario={usuario} visibles={visibles} tarjetas={tarjetas} />
      )}
    </>
  )
}
