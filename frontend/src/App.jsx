import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.jsx'
import { PlataformaProvider } from './plataforma/PlataformaContext.jsx'
import GateMantenimiento from './plataforma/GateMantenimiento.jsx'
import { ProtectedRoute, ModuleRoute, PermissionRoute, ModuloActivoRoute, SuperAdminRoute } from './auth/ProtectedRoute.jsx'
import LoginPage from './auth/LoginPage.jsx'
import AppShell from './layout/AppShell.jsx'
import HomeRedirect from './layout/HomeRedirect.jsx'
import NoEncontrado from './layout/NoEncontrado.jsx'
const MantenimientoHome = lazy(() => import('./modules/mantenimiento/MantenimientoHome.jsx'))
const EquiposPage = lazy(() => import('./modules/mantenimiento/EquiposPage.jsx'))
const EquipoFichaPage = lazy(() => import('./modules/mantenimiento/EquipoFichaPage.jsx'))
const MantenimientosPage = lazy(() => import('./modules/mantenimiento/MantenimientosPage.jsx'))
const CatalogosPage = lazy(() => import('./modules/mantenimiento/CatalogosPage.jsx'))
const OrdenesTrabajoPage = lazy(() => import('./modules/mantenimiento/OrdenesTrabajoPage.jsx'))
const OrdenDetallePage = lazy(() => import('./modules/mantenimiento/OrdenDetallePage.jsx'))
const SeguimientoPage = lazy(() => import('./modules/mantenimiento/SeguimientoPage.jsx'))
const SupervisorPage = lazy(() => import('./modules/mantenimiento/SupervisorPage.jsx'))
const UsuariosPage = lazy(() => import('./modules/usuarios/UsuariosPage.jsx'))
const ReportarDanoPage = lazy(() => import('./modules/danos/ReportarDanoPage.jsx'))
const TareasDanosPage = lazy(() => import('./modules/danos/TareasDanosPage.jsx'))
const MisTareasPage = lazy(() => import('./modules/danos/MisTareasPage.jsx'))
const EmailPage = lazy(() => import('./modules/email/EmailPage.jsx'))
const EmailConfiguracionPage = lazy(() => import('./modules/email/EmailConfiguracionPage.jsx'))
const PreferenciasIAPage = lazy(() => import('./modules/ia/PreferenciasIAPage.jsx'))
const ConfiguracionIAPage = lazy(() => import('./modules/ia/ConfiguracionIAPage.jsx'))
const NuevoRequerimientoPage = lazy(() => import('./modules/requerimientos/NuevoRequerimientoPage.jsx'))
const MisRequerimientosPage = lazy(() => import('./modules/requerimientos/MisRequerimientosPage.jsx'))
const MiFirmaPage = lazy(() => import('./modules/requerimientos/MiFirmaPage.jsx'))
const RequerimientoDetallePage = lazy(() => import('./modules/requerimientos/RequerimientoDetallePage.jsx'))
const BandejaFinancieroPage = lazy(() => import('./modules/requerimientos/BandejaFinancieroPage.jsx'))
const BandejaBodegaPage = lazy(() => import('./modules/requerimientos/BandejaBodegaPage.jsx'))
const ConsolidadoBodegaPage = lazy(() => import('./modules/requerimientos/ConsolidadoBodegaPage.jsx'))
const CatalogoArticulosPage = lazy(() => import('./modules/requerimientos/CatalogoArticulosPage.jsx'))
const TodosRequerimientosPage = lazy(() => import('./modules/requerimientos/TodosRequerimientosPage.jsx'))
const BancoPreguntasPage = lazy(() => import('./modules/sig_pregunta_dia/BancoPreguntasPage.jsx'))
const PreguntaDelDiaPage = lazy(() => import('./modules/sig_pregunta_dia/PreguntaDelDiaPage.jsx'))
const MiHistorialSigPage = lazy(() => import('./modules/sig_pregunta_dia/MiHistorialSigPage.jsx'))
const ProgramacionesPage = lazy(() => import('./modules/sig_pregunta_dia/ProgramacionesPage.jsx'))
const CampanasListaPage = lazy(() => import('./modules/sig_pregunta_dia/CampanasListaPage.jsx'))
const NuevaCampanaWizard = lazy(() => import('./modules/sig_pregunta_dia/NuevaCampanaWizard.jsx'))
const DashboardSigPage = lazy(() => import('./modules/sig_pregunta_dia/DashboardSigPage.jsx'))
const ReporteIndividualPage = lazy(() => import('./modules/sig_pregunta_dia/ReporteIndividualPage.jsx'))
const PlanRefuerzoPage = lazy(() => import('./modules/sig_pregunta_dia/PlanRefuerzoPage.jsx'))
const CapacitacionesTemaPage = lazy(() => import('./modules/sig_pregunta_dia/CapacitacionesTemaPage.jsx'))
const ConfiguracionSigPage = lazy(() => import('./modules/sig_pregunta_dia/ConfiguracionSigPage.jsx'))
const CalendarioSigPage = lazy(() => import('./modules/sig_pregunta_dia/CalendarioSigPage.jsx'))
const MisAusenciasPage = lazy(() => import('./modules/ausencias/MisAusenciasPage.jsx'))
const BandejaAusenciasPage = lazy(() => import('./modules/ausencias/BandejaAusenciasPage.jsx'))
const CalendarioAusenciasPage = lazy(() => import('./modules/ausencias/CalendarioAusenciasPage.jsx'))
const DashboardPage = lazy(() => import('./modules/operacion/DashboardPage.jsx'))
const RolesPage = lazy(() => import('./modules/roles/RolesPage.jsx'))
const DependenciasCargosPage = lazy(() => import('./modules/catalogos/CatalogosPage.jsx'))
const AuditoriaPage = lazy(() => import('./modules/auditoria/AuditoriaPage.jsx'))
const ModulosSistemaPage = lazy(() => import('./modules/sistema/ModulosSistemaPage.jsx'))
const EstadoPlataformaPage = lazy(() => import('./modules/sistema/EstadoPlataformaPage.jsx'))
const BackupPage = lazy(() => import('./modules/backup/BackupPage.jsx'))
const InduccionHome = lazy(() => import('./modules/induccion/InduccionHome.jsx'))
const CertificadoPage = lazy(() => import('./modules/induccion/CertificadoPage.jsx'))
import InstallBanner from './pwa/InstallBanner.jsx'
import CookieConsent from './legal/CookieConsent.jsx'
const LegalPage = lazy(() => import('./legal/LegalPage.jsx'))
const PreferenciasNotificacionesPage = lazy(() => import('./modules/notificaciones/PreferenciasNotificacionesPage.jsx'))
const CentroNotificacionesPage = lazy(() => import('./modules/notificaciones/CentroNotificacionesPage.jsx'))
const EleccionNotificacionesPage = lazy(() => import('./modules/notificaciones/EleccionNotificacionesPage.jsx'))
const TransmitirAvisoPage = lazy(() => import('./modules/avisos_terminal/TransmitirAvisoPage.jsx'))
const MisAvisosTerminalPage = lazy(() => import('./modules/avisos_terminal/MisAvisosTerminalPage.jsx'))
const AvisoTerminalDetallePage = lazy(() => import('./modules/avisos_terminal/AvisoTerminalDetallePage.jsx'))
const VideosPage = lazy(() => import('./modules/videos/VideosPage.jsx'))
const VideosGestionPage = lazy(() => import('./modules/videos/VideosGestionPage.jsx'))
const NoticiasPage = lazy(() => import('./modules/sitio_web/NoticiasPage.jsx'))
const EventosPage = lazy(() => import('./modules/sitio_web/EventosPage.jsx'))
const AvisosPage = lazy(() => import('./modules/sitio_web/AvisosPage.jsx'))
const MediosPage = lazy(() => import('./modules/sitio_web/MediosPage.jsx'))
const RadicadosPage = lazy(() => import('./modules/sitio_web/RadicadosPage.jsx'))
const SitioWebResumenPage = lazy(() => import('./modules/sitio_web/ResumenPage.jsx'))

const PERMISOS_SITIO_WEB = ['sitio_web:gestionar', 'noticias:gestionar', 'eventos:gestionar', 'publicaciones:gestionar']
const AsistentePage = lazy(() => import('./escritorio/AsistentePage.jsx'))
const DiagnosticoPage = lazy(() => import('./escritorio/DiagnosticoPage.jsx'))

export default function App() {
  return (
    <AuthProvider>
      {/* PlataformaProvider envuelve TODO y va por fuera de BrowserRouter: el
          estado de mantenimiento no depende de la ruta, y GateMantenimiento
          necesita poder sustituir la aplicación entera —incluido el login—
          por la pantalla de mantenimiento.

          Que el router quede desmontado durante la ventana es deliberado:
          además de impedir el acceso, detiene de golpe todos los sondeos y
          temporizadores de las pantallas abiertas, que si no seguirían
          golpeando un backend que solo va a devolverles 503. */}
      <PlataformaProvider>
        <GateMantenimiento>
      <BrowserRouter>
        <CookieConsent />
        <InstallBanner />
        <Suspense fallback={<p className="p-4 text-sm">Cargando…</p>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Pública a propósito: cualquiera debe poder consultar términos y
              privacidad sin haber iniciado sesión (desde el login) ni
              perder su sesión activa si la abre desde dentro del panel. */}
          <Route path="/legal" element={<LegalPage />} />

          {/* Asistente de escritorio. Van FUERA del AppShell a propósito: son
              lo que carga la ventana oculta de Electron, que no debe montar el
              sidebar, el widget flotante ni el resto del panel — sería trabajo
              de render permanente en una ventana que nadie ve.

              Tampoco van dentro de ProtectedRoute: sin sesión, esa ruta
              redirige al login, y en una ventana oculta eso deja al asistente
              en una pantalla de login invisible sin que nadie se entere.
              AsistentePage detecta la falta de sesión y le pide al proceso
              principal que abra el panel visible (ver skynet:sesion-caducada). */}
          <Route path="/asistente" element={<AsistentePage />} />
          <Route path="/asistente/diagnostico" element={<DiagnosticoPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomeRedirect />} />

            <Route path="mantenimiento" element={<ModuleRoute modulo="mantenimiento"><MantenimientoHome /></ModuleRoute>} />
            <Route path="mantenimiento/equipos" element={<ModuleRoute modulo="mantenimiento"><EquiposPage /></ModuleRoute>} />
            <Route path="mantenimiento/equipos/:id" element={<ModuleRoute modulo="mantenimiento"><EquipoFichaPage /></ModuleRoute>} />
            <Route path="mantenimiento/mantenimientos" element={<ModuleRoute modulo="mantenimiento"><MantenimientosPage /></ModuleRoute>} />
            <Route path="mantenimiento/catalogos" element={<ModuleRoute modulo="mantenimiento"><CatalogosPage /></ModuleRoute>} />
            {/* Ciclo de vida de la Orden de Trabajo (CMMS Fase 1): RBAC granular
                nuevo, no el ModuleRoute binario legado de las rutas de arriba. */}
            <Route
              path="mantenimiento/ordenes"
              element={
                <ModuloActivoRoute modulo="mantenimiento">
                  <PermissionRoute permiso={['mantenimiento:ejecutar', 'mantenimiento:ver_todas', 'mantenimiento:asignar', 'mantenimiento:aprobar_cerrar']}>
                    <OrdenesTrabajoPage />
                  </PermissionRoute>
                </ModuloActivoRoute>
              }
            />
            <Route
              path="mantenimiento/ordenes/:id"
              element={
                <ModuloActivoRoute modulo="mantenimiento">
                  <PermissionRoute permiso={['mantenimiento:ejecutar', 'mantenimiento:ver_todas', 'mantenimiento:asignar', 'mantenimiento:aprobar_cerrar']}>
                    <OrdenDetallePage />
                  </PermissionRoute>
                </ModuloActivoRoute>
              }
            />
            <Route
              path="mantenimiento/seguimiento"
              element={
                <ModuloActivoRoute modulo="mantenimiento">
                  <PermissionRoute permiso="mantenimiento:ver_todas">
                    <SeguimientoPage />
                  </PermissionRoute>
                </ModuloActivoRoute>
              }
            />
            <Route
              path="mantenimiento/supervisor"
              element={
                <ModuloActivoRoute modulo="mantenimiento">
                  <PermissionRoute permiso="mantenimiento:ver_todas">
                    <SupervisorPage />
                  </PermissionRoute>
                </ModuloActivoRoute>
              }
            />

            {/* Dashboard y reportar daño: universales, solo requieren sesión.
                ModuloActivoRoute gobierna los módulos desactivables por el
                Super Admin (/sistema/modulos); el dashboard es núcleo. */}
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="notificaciones" element={<PreferenciasNotificacionesPage />} />
            {/* Centro de notificaciones (campana): universal, cada quien ve
                solo lo suyo — el backend nunca confía en un usuarioId del
                cliente (ver notificaciones.routes.js). */}
            <Route path="notificaciones/centro" element={<CentroNotificacionesPage />} />
            <Route
              path="notificaciones/canales"
              element={
                <PermissionRoute permiso={['notificaciones:ver_historial', 'notificaciones:configurar_canales']}>
                  <EleccionNotificacionesPage />
                </PermissionRoute>
              }
            />
            <Route path="ia/preferencias" element={<ModuloActivoRoute modulo="ia"><PreferenciasIAPage /></ModuloActivoRoute>} />
            <Route path="ia/configuracion" element={<ModuloActivoRoute modulo="ia"><PermissionRoute permiso="ia:configurar"><ConfiguracionIAPage /></PermissionRoute></ModuloActivoRoute>} />
            {/* Avisos Terminal de Neiva: "Mis avisos" (recibir) es universal,
                igual que la campana — el backend nunca confía en un usuarioId
                del cliente (ver avisos.routes.js). Transmitir/ver historial
                exige el permiso avisos_terminal:transmitir|ver_historial. */}
            <Route path="avisos-terminal/mios" element={<ModuloActivoRoute modulo="avisos_terminal"><MisAvisosTerminalPage /></ModuloActivoRoute>} />
            <Route
              path="avisos-terminal/transmitir"
              element={
                <ModuloActivoRoute modulo="avisos_terminal">
                  <PermissionRoute permiso="avisos_terminal:transmitir">
                    <TransmitirAvisoPage />
                  </PermissionRoute>
                </ModuloActivoRoute>
              }
            />
            <Route
              path="avisos-terminal/:id"
              element={
                <ModuloActivoRoute modulo="avisos_terminal">
                  <PermissionRoute permiso={['avisos_terminal:transmitir', 'avisos_terminal:ver_historial']}>
                    <AvisoTerminalDetallePage />
                  </PermissionRoute>
                </ModuloActivoRoute>
              }
            />
            {/* Videos informativos: ver el historial de publicados es universal
                (igual que "Reportar daño"); gestionar exige videos:gestionar.
                El backend vuelve a validar ambos — esto solo evita mostrar
                una pantalla que después respondería 403. */}
            <Route path="videos" element={<ModuloActivoRoute modulo="videos"><VideosPage /></ModuloActivoRoute>} />
            <Route
              path="videos/gestion"
              element={
                <ModuloActivoRoute modulo="videos">
                  <PermissionRoute permiso="videos:gestionar">
                    <VideosGestionPage />
                  </PermissionRoute>
                </ModuloActivoRoute>
              }
            />
            {/* Sitio web público: sin vista universal, todo exige permiso. El
                resumen y las imágenes sirven a las tres secciones. */}
            <Route path="sitio-web" element={<ModuloActivoRoute modulo="sitio_web"><PermissionRoute permiso={PERMISOS_SITIO_WEB}><SitioWebResumenPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sitio-web/noticias" element={<ModuloActivoRoute modulo="sitio_web"><PermissionRoute permiso={['sitio_web:gestionar', 'noticias:gestionar']}><NoticiasPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sitio-web/eventos" element={<ModuloActivoRoute modulo="sitio_web"><PermissionRoute permiso={['sitio_web:gestionar', 'eventos:gestionar']}><EventosPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sitio-web/avisos" element={<ModuloActivoRoute modulo="sitio_web"><PermissionRoute permiso={['sitio_web:gestionar', 'publicaciones:gestionar']}><AvisosPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sitio-web/radicados" element={<ModuloActivoRoute modulo="sitio_web"><PermissionRoute permiso={['sitio_web:gestionar', 'pqrs:gestionar']}><RadicadosPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sitio-web/medios" element={<ModuloActivoRoute modulo="sitio_web"><PermissionRoute permiso={PERMISOS_SITIO_WEB}><MediosPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="danos/reportar" element={<ModuloActivoRoute modulo="danos"><ReportarDanoPage /></ModuloActivoRoute>} />
            <Route path="danos/tareas" element={<ModuloActivoRoute modulo="danos"><PermissionRoute permiso="danos:gestionar"><TareasDanosPage /></PermissionRoute></ModuloActivoRoute>} />
            {/* Mantenimiento (mantenimiento:ejecutar sin danos:gestionar): solo ve y
                avanza lo que tiene asignado — el backend recorta el listado. */}
            <Route path="danos/mis-tareas" element={<ModuloActivoRoute modulo="danos"><PermissionRoute permiso="mantenimiento:ejecutar"><MisTareasPage /></PermissionRoute></ModuloActivoRoute>} />

            {/* Requerimientos: crear + ver los propios son universales (como
                "Reportar daño"); las bandejas de gestión y "Mi firma" (solo
                tiene sentido para quien puede aprobar/firmar) exigen su
                permiso. */}
            <Route path="email" element={<ModuloActivoRoute modulo="email"><PermissionRoute permiso="email:ver"><EmailPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="email/configuracion" element={<ModuloActivoRoute modulo="email"><PermissionRoute permiso="email:configurar"><EmailConfiguracionPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="email/:carpeta" element={<ModuloActivoRoute modulo="email"><PermissionRoute permiso="email:ver"><EmailPage /></PermissionRoute></ModuloActivoRoute>} />

            <Route path="requerimientos/nuevo" element={<ModuloActivoRoute modulo="requerimientos"><NuevoRequerimientoPage /></ModuloActivoRoute>} />
            <Route path="requerimientos/mios" element={<ModuloActivoRoute modulo="requerimientos"><MisRequerimientosPage /></ModuloActivoRoute>} />
            <Route path="requerimientos/mi-firma" element={<ModuloActivoRoute modulo="requerimientos"><PermissionRoute permiso="requerimientos:aprobar_financiero"><MiFirmaPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="requerimientos/financiero" element={<ModuloActivoRoute modulo="requerimientos"><PermissionRoute permiso="requerimientos:aprobar_financiero"><BandejaFinancieroPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="requerimientos/bodega" element={<ModuloActivoRoute modulo="requerimientos"><PermissionRoute permiso="requerimientos:gestionar_bodega"><BandejaBodegaPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="requerimientos/bodega/consolidado" element={<ModuloActivoRoute modulo="requerimientos"><PermissionRoute permiso="requerimientos:gestionar_bodega"><ConsolidadoBodegaPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="requerimientos/catalogo" element={<ModuloActivoRoute modulo="requerimientos"><PermissionRoute permiso="requerimientos:gestionar_bodega"><CatalogoArticulosPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="requerimientos/todos" element={<ModuloActivoRoute modulo="requerimientos"><PermissionRoute permiso="requerimientos:ver_todos"><TodosRequerimientosPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="requerimientos/:id" element={<ModuloActivoRoute modulo="requerimientos"><RequerimientoDetallePage /></ModuloActivoRoute>} />

            <Route path="sig/pregunta-del-dia" element={<ModuloActivoRoute modulo="sig_pregunta_dia"><PreguntaDelDiaPage /></ModuloActivoRoute>} />
            <Route path="sig/mi-historial" element={<ModuloActivoRoute modulo="sig_pregunta_dia"><MiHistorialSigPage /></ModuloActivoRoute>} />
            <Route path="sig/banco" element={<ModuloActivoRoute modulo="sig_pregunta_dia"><PermissionRoute permiso="sig_pregunta_dia:gestionar_banco"><BancoPreguntasPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sig/programacion" element={<ModuloActivoRoute modulo="sig_pregunta_dia"><PermissionRoute permiso="sig_pregunta_dia:programar"><ProgramacionesPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sig/programacion/campanas" element={<ModuloActivoRoute modulo="sig_pregunta_dia"><PermissionRoute permiso="sig_pregunta_dia:programar"><CampanasListaPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sig/programacion/campanas/nueva" element={<ModuloActivoRoute modulo="sig_pregunta_dia"><PermissionRoute permiso="sig_pregunta_dia:programar"><NuevaCampanaWizard /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sig/dashboard" element={<ModuloActivoRoute modulo="sig_pregunta_dia"><PermissionRoute permiso="sig_pregunta_dia:ver_reportes"><DashboardSigPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sig/reportes/individual" element={<ModuloActivoRoute modulo="sig_pregunta_dia"><PermissionRoute permiso="sig_pregunta_dia:ver_reportes"><ReporteIndividualPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sig/reportes/plan-refuerzo" element={<ModuloActivoRoute modulo="sig_pregunta_dia"><PermissionRoute permiso="sig_pregunta_dia:ver_reportes"><PlanRefuerzoPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sig/capacitaciones" element={<ModuloActivoRoute modulo="sig_pregunta_dia"><PermissionRoute permiso="sig_pregunta_dia:programar"><CapacitacionesTemaPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sig/configuracion" element={<ModuloActivoRoute modulo="sig_pregunta_dia"><PermissionRoute permiso="sig_pregunta_dia:configurar"><ConfiguracionSigPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="sig/calendario" element={<ModuloActivoRoute modulo="sig_pregunta_dia"><PermissionRoute permiso="sig_pregunta_dia:programar"><CalendarioSigPage /></PermissionRoute></ModuloActivoRoute>} />

            {/* Ausencias: pedir vacaciones y ver las propias son universales
                (como "Reportar daño"); decidir y ver el calendario del
                personal exigen permiso. */}
            <Route path="ausencias/mias" element={<ModuloActivoRoute modulo="ausencias"><MisAusenciasPage /></ModuloActivoRoute>} />
            <Route path="ausencias/bandeja" element={<ModuloActivoRoute modulo="ausencias"><PermissionRoute permiso="ausencias:aprobar"><BandejaAusenciasPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="ausencias/calendario" element={<ModuloActivoRoute modulo="ausencias"><PermissionRoute permiso={['ausencias:aprobar', 'ausencias:ver_todas']}><CalendarioAusenciasPage /></PermissionRoute></ModuloActivoRoute>} />

            <Route path="usuarios" element={<PermissionRoute permiso="usuarios:gestionar"><UsuariosPage /></PermissionRoute>} />
            <Route path="roles" element={<PermissionRoute permiso="roles:gestionar"><RolesPage /></PermissionRoute>} />
            <Route path="catalogos" element={<PermissionRoute permiso="catalogos:gestionar"><DependenciasCargosPage /></PermissionRoute>} />
            <Route path="auditoria" element={<PermissionRoute permiso="auditoria:leer"><AuditoriaPage /></PermissionRoute>} />
            <Route path="sistema/modulos" element={<PermissionRoute permiso="sistema:gestionar_modulos"><ModulosSistemaPage /></PermissionRoute>} />
            <Route path="sistema/plataforma" element={<PermissionRoute permiso="plataforma:gestionar"><EstadoPlataformaPage /></PermissionRoute>} />
            <Route path="sistema/backup" element={<SuperAdminRoute><BackupPage /></SuperAdminRoute>} />

            <Route path="induccion" element={<InduccionHome />} />
            <Route path="induccion/certificado" element={<CertificadoPage />} />

            {/* Comodín DENTRO del layout: una URL desconocida conserva el
                sidebar y la barra inferior en vez de dejar la pantalla en
                blanco (que es lo que hacía <Routes> al no encontrar ninguna
                coincidencia). Sin sesión no llega hasta aquí: ProtectedRoute
                redirige al login primero. */}
            <Route path="*" element={<NoEncontrado />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
        </GateMantenimiento>
      </PlataformaProvider>
    </AuthProvider>
  )
}
