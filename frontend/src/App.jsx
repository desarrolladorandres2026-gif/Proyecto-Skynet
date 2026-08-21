import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.jsx'
import { ProtectedRoute, ModuleRoute, PermissionRoute, ModuloActivoRoute, SuperAdminRoute } from './auth/ProtectedRoute.jsx'
import LoginPage from './auth/LoginPage.jsx'
import AppShell from './layout/AppShell.jsx'
import HomeRedirect from './layout/HomeRedirect.jsx'
import NoEncontrado from './layout/NoEncontrado.jsx'
import MantenimientoHome from './modules/mantenimiento/MantenimientoHome.jsx'
import EquiposPage from './modules/mantenimiento/EquiposPage.jsx'
import EquipoFichaPage from './modules/mantenimiento/EquipoFichaPage.jsx'
import MantenimientosPage from './modules/mantenimiento/MantenimientosPage.jsx'
import CatalogosPage from './modules/mantenimiento/CatalogosPage.jsx'
import OrdenesTrabajoPage from './modules/mantenimiento/OrdenesTrabajoPage.jsx'
import OrdenDetallePage from './modules/mantenimiento/OrdenDetallePage.jsx'
import SeguimientoPage from './modules/mantenimiento/SeguimientoPage.jsx'
import SupervisorPage from './modules/mantenimiento/SupervisorPage.jsx'
import UsuariosPage from './modules/usuarios/UsuariosPage.jsx'
import ReportarDanoPage from './modules/danos/ReportarDanoPage.jsx'
import TareasDanosPage from './modules/danos/TareasDanosPage.jsx'
import MisTareasPage from './modules/danos/MisTareasPage.jsx'
import EmailPage from './modules/email/EmailPage.jsx'
import EmailConfiguracionPage from './modules/email/EmailConfiguracionPage.jsx'
import PreferenciasIAPage from './modules/ia/PreferenciasIAPage.jsx'
import ConfiguracionIAPage from './modules/ia/ConfiguracionIAPage.jsx'
import NuevoRequerimientoPage from './modules/requerimientos/NuevoRequerimientoPage.jsx'
import MisRequerimientosPage from './modules/requerimientos/MisRequerimientosPage.jsx'
import MiFirmaPage from './modules/requerimientos/MiFirmaPage.jsx'
import RequerimientoDetallePage from './modules/requerimientos/RequerimientoDetallePage.jsx'
import BandejaFinancieroPage from './modules/requerimientos/BandejaFinancieroPage.jsx'
import BandejaBodegaPage from './modules/requerimientos/BandejaBodegaPage.jsx'
import TodosRequerimientosPage from './modules/requerimientos/TodosRequerimientosPage.jsx'
import BancoPreguntasPage from './modules/sig_pregunta_dia/BancoPreguntasPage.jsx'
import PreguntaDelDiaPage from './modules/sig_pregunta_dia/PreguntaDelDiaPage.jsx'
import MiHistorialSigPage from './modules/sig_pregunta_dia/MiHistorialSigPage.jsx'
import ProgramacionesPage from './modules/sig_pregunta_dia/ProgramacionesPage.jsx'
import CampanasListaPage from './modules/sig_pregunta_dia/CampanasListaPage.jsx'
import NuevaCampanaWizard from './modules/sig_pregunta_dia/NuevaCampanaWizard.jsx'
import DashboardSigPage from './modules/sig_pregunta_dia/DashboardSigPage.jsx'
import ReporteIndividualPage from './modules/sig_pregunta_dia/ReporteIndividualPage.jsx'
import PlanRefuerzoPage from './modules/sig_pregunta_dia/PlanRefuerzoPage.jsx'
import CapacitacionesTemaPage from './modules/sig_pregunta_dia/CapacitacionesTemaPage.jsx'
import ConfiguracionSigPage from './modules/sig_pregunta_dia/ConfiguracionSigPage.jsx'
import CalendarioSigPage from './modules/sig_pregunta_dia/CalendarioSigPage.jsx'
import MisAusenciasPage from './modules/ausencias/MisAusenciasPage.jsx'
import BandejaAusenciasPage from './modules/ausencias/BandejaAusenciasPage.jsx'
import CalendarioAusenciasPage from './modules/ausencias/CalendarioAusenciasPage.jsx'
import DashboardPage from './modules/operacion/DashboardPage.jsx'
import RolesPage from './modules/roles/RolesPage.jsx'
import DependenciasCargosPage from './modules/catalogos/CatalogosPage.jsx'
import AuditoriaPage from './modules/auditoria/AuditoriaPage.jsx'
import ModulosSistemaPage from './modules/sistema/ModulosSistemaPage.jsx'
import BackupPage from './modules/backup/BackupPage.jsx'
import InduccionHome from './modules/induccion/InduccionHome.jsx'
import CertificadoPage from './modules/induccion/CertificadoPage.jsx'
import InstallBanner from './pwa/InstallBanner.jsx'
import CookieConsent from './legal/CookieConsent.jsx'
import LegalPage from './legal/LegalPage.jsx'
import PreferenciasNotificacionesPage from './modules/notificaciones/PreferenciasNotificacionesPage.jsx'
import CentroNotificacionesPage from './modules/notificaciones/CentroNotificacionesPage.jsx'
import HistorialEnviosPage from './modules/notificaciones/HistorialEnviosPage.jsx'
import AsistentePage from './escritorio/AsistentePage.jsx'
import DiagnosticoPage from './escritorio/DiagnosticoPage.jsx'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <CookieConsent />
        <InstallBanner />
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
              path="notificaciones/historial"
              element={
                <PermissionRoute permiso="notificaciones:ver_historial">
                  <HistorialEnviosPage />
                </PermissionRoute>
              }
            />
            <Route path="ia/preferencias" element={<ModuloActivoRoute modulo="ia"><PreferenciasIAPage /></ModuloActivoRoute>} />
            <Route path="ia/configuracion" element={<ModuloActivoRoute modulo="ia"><PermissionRoute permiso="ia:configurar"><ConfiguracionIAPage /></PermissionRoute></ModuloActivoRoute>} />
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
      </BrowserRouter>
    </AuthProvider>
  )
}
