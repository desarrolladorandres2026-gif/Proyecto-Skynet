import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Building2, Bus, IdCard, LayoutGrid, Send, AlertTriangle,
  PackageSearch, Wrench, Gauge,
} from 'lucide-react'
import { useAuth, esRolAdmin } from '../../auth/AuthContext.jsx'
import { useModulosVisibles } from '../../layout/AppLayout.jsx'
import { dashboard } from '../../api/operacion.js'
import { Card, ErrorMsg } from '../../components/ui.jsx'
import { ListRow, QuickAction, SectionHeader } from '../../components/mobileUi.jsx'
import { MOBILE_NAV_POR_ROL } from '../../config/mobileNavPorRol.js'

// Cada tarjeta declara su clave en la respuesta de /api/dashboard; solo se
// pintan las claves que el backend devolvió (que a su vez dependen de los
// permisos del rol). `to` la vuelve un acceso directo al módulo.
const TARJETAS = [
  { clave: 'usuarios', label: 'Usuarios activos', icon: Users, to: '/usuarios' },
  { clave: 'empresas', label: 'Empresas activas', icon: Building2, to: '/flota/empresas' },
  { clave: 'vehiculosActivos', label: 'Vehículos activos', icon: Bus, to: '/flota/vehiculos' },
  { clave: 'conductoresActivos', label: 'Conductores activos', icon: IdCard, to: '/flota/conductores' },
  { clave: 'plataformasLibres', label: 'Plataformas libres', icon: LayoutGrid, to: '/flota/plataformas', tono: 'emerald' },
  { clave: 'plataformasOcupadas', label: 'Plataformas ocupadas', icon: LayoutGrid, to: '/flota/plataformas', tono: 'amber' },
  { clave: 'despachosHoy', label: 'Despachos hoy', icon: Send, to: '/operacion/despachos' },
  { clave: 'despachosEnViaje', label: 'En viaje', icon: Bus, to: '/operacion/despachos' },
  { clave: 'despachosRetrasados', label: 'Retrasados', icon: AlertTriangle, to: '/operacion/despachos', tono: 'amber' },
  { clave: 'novedadesAbiertas', label: 'Novedades abiertas', icon: AlertTriangle, to: '/operacion/novedades', tono: 'amber' },
  { clave: 'objetosEnCustodia', label: 'Objetos en custodia', icon: PackageSearch, to: '/operacion/objetos-perdidos' },
  { clave: 'danosPendientes', label: 'Daños pendientes', icon: Wrench, to: '/danos/tareas', tono: 'amber' },
  { clave: 'misDanosReportados', label: 'Mis daños sin resolver', icon: Wrench, to: '/danos/reportar' },
]

const TONOS = {
  cyan: 'text-cyan-700 dark:text-cyan-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  amber: 'text-amber-700 dark:text-amber-300',
}

const TONOS_MOVIL = {
  cyan: 'text-[var(--mobile-accent)]',
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

function PanelDenso({ usuario, visibles, tarjetas }) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <Gauge className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Panel de control
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {usuario?.nombre} · <span className="text-cyan-700/80 dark:text-cyan-400/80">{usuario?.rol?.nombre}</span>
        </p>
      </div>

      {!tarjetas ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibles.map((t) => (
            <Link key={t.clave} to={t.to} className="group">
              <Card className="transition group-hover:!border-cyan-400/40">
                <t.icon className={`mb-2 h-5 w-5 ${TONOS[t.tono] || TONOS.cyan}`} aria-hidden="true" />
                <p className={`text-3xl font-bold ${TONOS[t.tono] || 'text-slate-900 dark:text-white'}`}>{tarjetas[t.clave]}</p>
                <p className="panel-mono mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{t.label}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { usuario } = useAuth()
  const [tarjetas, setTarjetas] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    dashboard
      .resumen()
      .then((data) => setTarjetas(data.tarjetas))
      .catch((err) => setError(err.message))
  }, [])

  const visibles = tarjetas ? TARJETAS.filter((t) => tarjetas[t.clave] !== undefined) : []

  return (
    <>
      <ErrorMsg>{error}</ErrorMsg>
      {esRolAdmin(usuario) ? (
        <PanelDenso usuario={usuario} visibles={visibles} tarjetas={tarjetas} />
      ) : (
        <HomeFeed usuario={usuario} visibles={visibles} tarjetas={tarjetas} />
      )}
    </>
  )
}
