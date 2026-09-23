import { Link } from 'react-router-dom'
import {
  Users, Wrench, FileText, CalendarDays, ShieldCheck, ScrollText, Bell,
} from 'lucide-react'
import { useAuth, usaPanelDenso } from '../../auth/AuthContext.jsx'
import { useEsMovil } from '../../layout/useEsMovil.js'
import { useModulosVisibles } from '../../layout/AppLayout.jsx'
import { dashboard } from '../../api/operacion.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { ErrorMsg } from '../../components/ui.jsx'
import { QuickAction } from '../../components/mobileUi.jsx'
import { MOBILE_NAV_POR_ROL } from '../../config/mobileNavPorRol.js'
import { DashboardHeader } from '../../components/dashboard/DashboardHeader.jsx'
import { KpiRibbon } from '../../components/dashboard/KpiRibbon.jsx'
import { StatCard } from '../../components/dashboard/StatCard.jsx'
import { ModalPersonalizacionDashboard } from '../../components/dashboard/ModalPersonalizacionDashboard.jsx'
import { usePersonalizacionDashboardCompleta } from '../../components/dashboard/usePersonalizacionDashboardCompleta.js'
import { ACCESOS_RAPIDOS_PANEL_DENSO } from '../../config/accesosRapidosPorRol.js'
import VideoDestacado from '../../components/videos/VideoDestacado.jsx'

const TARJETAS = [
  { clave: 'notificaciones', label: 'Notificaciones sin leer', icon: Bell, to: '/notificaciones/centro', tono: 'brand' },
  { clave: 'usuarios', label: 'Usuarios activos', icon: Users, to: '/usuarios', tono: 'brand' },
  { clave: 'danosPendientes', label: 'Daños pendientes', icon: Wrench, to: '/danos/tareas', tono: 'brand' },
  { clave: 'requerimientosPendientes', label: 'Requerimientos en trámite', icon: FileText, to: '/requerimientos/todos', tono: 'brand' },
  { clave: 'requerimientosPorDespachar', label: 'Por despachar (Bodega)', icon: FileText, to: '/requerimientos/bodega', tono: 'brand' },
  { clave: 'ausenciasPendientes', label: 'Ausencias por decidir', icon: CalendarDays, to: '/ausencias/bandeja', tono: 'brand' },
  { clave: 'mantenimientoAbiertas', label: 'Órdenes de trabajo abiertas', icon: Wrench, to: '/mantenimiento/ordenes', tono: 'brand' },
  { clave: 'rolesActivos', label: 'Roles activos', icon: ShieldCheck, to: '/roles', tono: 'brand' },
  { clave: 'auditoriaHoy', label: 'Eventos de auditoría hoy', icon: ScrollText, to: '/auditoria', tono: 'brand' },
  { clave: 'misDanosReportados', label: 'Mis daños sin resolver', icon: Wrench, to: '/danos/reportar', tono: 'brand' },
  { clave: 'misTareasMantenimiento', label: 'Mis tareas asignadas', icon: Wrench, to: '/danos/mis-tareas', tono: 'brand' },
]

const ANCHO_CLASES = {
  compacto: 'lg:col-span-5',
  medio: 'lg:col-span-6',
  expandido: 'lg:col-span-7',
  completo: 'lg:col-span-12',
}

function HomeFeed({ usuario, onRefrescar, cargando }) {
  const modulosVisibles = useModulosVisibles()
  const rutasPermitidas = new Set(modulosVisibles.flatMap((m) => m.items.map((i) => i.to)))
  const accesos = (MOBILE_NAV_POR_ROL[usuario?.rol?.slug] || []).filter((a) => rutasPermitidas.has(a.to))

  return (
    <div className="mx-auto max-w-md space-y-6 pb-6">
      {/* Header móvil enriquecido */}
      <DashboardHeader
        usuario={usuario}
        accesos={[]}
        onRefrescar={onRefrescar}
        cargando={cargando}
      />

      {/* Accesos rápidos */}
      {accesos.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-1">
          {accesos.map((a) => (
            <QuickAction key={a.to} icon={a.icon} label={a.label} to={a.to} />
          ))}
        </div>
      )}

      {/* Video informativo destacado (no se muestra si no hay publicados) */}
      <VideoDestacado />
    </div>
  )
}

function PanelDenso({ usuario, visibles, data, onRefrescar, cargando }) {
  const modulosVisibles = useModulosVisibles()
  const rutasPermitidas = new Set(modulosVisibles.flatMap((m) => m.items.map((i) => i.to)))
  const accesos = (ACCESOS_RAPIDOS_PANEL_DENSO[usuario?.rol?.slug] || []).filter((a) => rutasPermitidas.has(a.to))

  const { tarjetas } = data

  const {
    modalAbierto,
    setModalAbierto,
    secciones,
    estiloKpi,
    tarjetasOrdenadas,
    tarjetasFiltradas,
    esTarjetaOculta,
    alternarSeccion,
    moverSeccion,
    cambiarAnchoSeccion,
    cambiarEstiloKpi,
    alternarTarjeta,
    moverTarjeta,
    restablecerTodo,
  } = usePersonalizacionDashboardCompleta(visibles)

  return (
    <div className="w-full space-y-3.5 pb-2">
      {/* 1. Header Ejecutivo Compacto con botón de Personalizar */}
      <DashboardHeader
        usuario={usuario}
        accesos={accesos}
        setPersonalizando={() => setModalAbierto(true)}
        onRefrescar={onRefrescar}
        cargando={cargando}
      />

      {/* Video informativo destacado: fuera del grid personalizable porque es
          un comunicado institucional para todo el personal, no una métrica
          que cada persona pueda ocultar. No se pinta si no hay publicados. */}
      <VideoDestacado />

      {/* 2. Grid Dinámico Personalizable */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-[var(--ui-gap)] items-start">
        {secciones
          .filter((s) => s.visible)
          .map((sec) => {
            const colClass = ANCHO_CLASES[sec.ancho] || 'lg:col-span-6'

            if (sec.id === 'kpis') {
              return (
                <div key={sec.id} className={colClass}>
                  {estiloKpi === 'grid' ? (
                    <div className="grid grid-cols-2 gap-[var(--ui-gap)] sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7">
                      {tarjetasFiltradas.map((t) => (
                        <Link key={t.clave} to={t.to}>
                          <StatCard
                            icon={t.icon}
                            label={t.label}
                            valor={tarjetas?.[t.clave]}
                            tono={t.tono}
                          />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <KpiRibbon
                      visibles={tarjetasFiltradas}
                      tarjetas={tarjetas || {}}
                    />
                  )}
                </div>
              )
            }

            return null
          })}
      </div>

      {/* Modal de Personalización */}
      <ModalPersonalizacionDashboard
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        secciones={secciones}
        estiloKpi={estiloKpi}
        tarjetasOrdenadas={tarjetasOrdenadas}
        esTarjetaOculta={esTarjetaOculta}
        alternarSeccion={alternarSeccion}
        moverSeccion={moverSeccion}
        cambiarAnchoSeccion={cambiarAnchoSeccion}
        cambiarEstiloKpi={cambiarEstiloKpi}
        alternarTarjeta={alternarTarjeta}
        moverTarjeta={moverTarjeta}
        onRestablecer={restablecerTodo}
      />
    </div>
  )
}

export default function DashboardPage() {
  const { usuario } = useAuth()
  const esMovil = useEsMovil()

  // Datos frescos por 2 minutos: entrar/salir de otras páginas y volver al
  // dashboard ya no repite la petición completa (tarjetas + flujo semanal)
  // cada vez, solo cuando la caché venció o la
  // persona pide "Refrescar" explícitamente.
  const { data: resumen, cargando, error, recargar } = useDatosConCache(
    'dashboard:resumen',
    () => dashboard.resumen(),
    { ttlMs: 2 * 60_000 },
  )

  const data = {
    tarjetas: resumen?.tarjetas || null,
    tendencias: resumen?.tendencias || {},
    flujoSemanal: resumen?.flujoSemanal || [],
  }

  const visibles = data.tarjetas ? TARJETAS.filter((t) => data.tarjetas[t.clave] !== undefined) : []

  return (
    <>
      <ErrorMsg>{error}</ErrorMsg>
      {usaPanelDenso(usuario) && !esMovil ? (
        <PanelDenso
          usuario={usuario}
          visibles={visibles}
          data={data}
          onRefrescar={recargar}
          cargando={cargando}
        />
      ) : (
        <HomeFeed
          usuario={usuario}
          onRefrescar={recargar}
          cargando={cargando}
        />
      )}
    </>
  )
}
