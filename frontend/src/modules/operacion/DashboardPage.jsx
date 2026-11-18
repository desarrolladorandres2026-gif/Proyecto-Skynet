import { useLayoutEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
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
import { ModalPersonalizacionDashboard } from '../../components/dashboard/ModalPersonalizacionDashboard.jsx'
import { usePersonalizacionDashboardCompleta } from '../../components/dashboard/usePersonalizacionDashboardCompleta.js'
import { ACCESOS_RAPIDOS_PANEL_DENSO } from '../../config/accesosRapidosPorRol.js'
import { StatCard } from '../../components/dashboard/StatCard.jsx'
import { AccesoRapidoDenso } from '../../components/dashboard/AccesoRapidoDenso.jsx'
import VideoDestacado from '../../components/videos/VideoDestacado.jsx'
import { TematicaEscena } from '../../tematicas/index.js'

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

      {/* Escena de la temática activa (no ocupa espacio sin temática) */}
      <TematicaEscena movil />

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

  const kpisVisibles = secciones.some((s) => s.id === 'kpis' && s.visible)
  const reducir = useReducedMotion()
  const contenedor = {
    oculto: {},
    visible: { transition: { staggerChildren: reducir ? 0 : 0.07, delayChildren: 0.05 } },
  }
  const item = {
    oculto: reducir ? { opacity: 0 } : { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  }

  // El panel ocupa exactamente el área útil del <main> (sin scroll): se mide
  // en vez de estimar con calc() para no depender de la barra superior.
  const raiz = useRef(null)
  const [alto, setAlto] = useState(0)
  useLayoutEffect(() => {
    const main = raiz.current?.closest('main')
    if (!main) return undefined
    const medir = () => {
      const cs = getComputedStyle(main)
      setAlto(main.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom))
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(main)
    return () => ro.disconnect()
  }, [])

  return (
    <motion.div
      ref={raiz}
      style={{ height: alto || undefined }}
      variants={contenedor}
      initial="oculto"
      animate="visible"
      className="relative flex w-full flex-col gap-3 overflow-hidden"
    >
      {/* Resplandor decorativo de fondo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-0 -z-10 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl motion-safe:animate-pulse"
      />

      <DashboardHeader
        usuario={usuario}
        accesos={[]}
        onRefrescar={onRefrescar}
        cargando={cargando}
      />

      {/* Accesos rápidos del rol */}
      {accesos.length > 0 && (
        <motion.div variants={item} className="flex flex-wrap gap-2">
          {accesos.map((a) => (
            <motion.div key={a.to} whileHover={reducir ? undefined : { y: -2 }} whileTap={reducir ? undefined : { scale: 0.97 }}>
              <AccesoRapidoDenso icon={a.icon} label={a.label} to={a.to} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Video informativo destacado: comunicado institucional, fuera del grid
          personalizable. No se pinta si no hay publicados. */}
      <motion.div variants={item} className="flex min-h-0 flex-1 flex-col">
        <VideoDestacado llenar />
      </motion.div>

      {/* Métricas */}
      {kpisVisibles && tarjetasFiltradas.length > 0 && (
        <motion.div variants={contenedor} className="grid shrink-0 grid-cols-2 gap-2.5 lg:grid-cols-3 2xl:grid-cols-4">
          {tarjetasFiltradas.map((t) => (
            <motion.div key={t.clave} variants={item} whileHover={reducir ? undefined : { y: -3 }}>
              <Link
                to={t.to}
                className="group relative block overflow-hidden rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 shadow-sm backdrop-blur transition-shadow hover:shadow-lg hover:shadow-brand-500/10 dark:border-slate-800/80 dark:bg-slate-900/60"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-brand-500 to-brand-300 transition-transform duration-300 group-hover:scale-x-100"
                />
                <StatCard compacto icon={t.icon} label={t.label} valor={tarjetas?.[t.clave]} tono={t.tono} />
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}

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
    </motion.div>
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
