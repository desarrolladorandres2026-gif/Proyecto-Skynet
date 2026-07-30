import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.jsx'
import { ProtectedRoute, ModuleRoute, PermissionRoute, ModuloActivoRoute } from './auth/ProtectedRoute.jsx'
import LoginPage from './auth/LoginPage.jsx'
import AppShell from './layout/AppShell.jsx'
import HomeRedirect from './layout/HomeRedirect.jsx'
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
import NuevoRequerimientoPage from './modules/requerimientos/NuevoRequerimientoPage.jsx'
import MisRequerimientosPage from './modules/requerimientos/MisRequerimientosPage.jsx'
import RequerimientoDetallePage from './modules/requerimientos/RequerimientoDetallePage.jsx'
import BandejaFinancieroPage from './modules/requerimientos/BandejaFinancieroPage.jsx'
import BandejaBodegaPage from './modules/requerimientos/BandejaBodegaPage.jsx'
import TodosRequerimientosPage from './modules/requerimientos/TodosRequerimientosPage.jsx'
import DashboardPage from './modules/operacion/DashboardPage.jsx'
import EmpresasPage from './modules/flota/EmpresasPage.jsx'
import VehiculosPage from './modules/flota/VehiculosPage.jsx'
import ConductoresPage from './modules/flota/ConductoresPage.jsx'
import PlataformasPage from './modules/flota/PlataformasPage.jsx'
import RutasHorariosPage from './modules/operacion/RutasHorariosPage.jsx'
import DespachosPage from './modules/operacion/DespachosPage.jsx'
import NovedadesPage from './modules/operacion/NovedadesPage.jsx'
import ObjetosPerdidosPage from './modules/operacion/ObjetosPerdidosPage.jsx'
import RolesPage from './modules/roles/RolesPage.jsx'
import AuditoriaPage from './modules/auditoria/AuditoriaPage.jsx'
import ModulosSistemaPage from './modules/sistema/ModulosSistemaPage.jsx'
import InduccionHome from './modules/induccion/InduccionHome.jsx'
import CertificadoPage from './modules/induccion/CertificadoPage.jsx'
import InstallBanner from './pwa/InstallBanner.jsx'
import PreferenciasNotificacionesPage from './modules/notificaciones/PreferenciasNotificacionesPage.jsx'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <InstallBanner />
        <Routes>
          <Route path="/login" element={<LoginPage />} />

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
            <Route path="danos/reportar" element={<ModuloActivoRoute modulo="danos"><ReportarDanoPage /></ModuloActivoRoute>} />
            <Route path="danos/tareas" element={<ModuloActivoRoute modulo="danos"><PermissionRoute permiso="danos:gestionar"><TareasDanosPage /></PermissionRoute></ModuloActivoRoute>} />

            {/* Requerimientos: crear + ver los propios son universales (como
                "Reportar daño"); las bandejas de gestión exigen su permiso. */}
            <Route path="requerimientos/nuevo" element={<ModuloActivoRoute modulo="requerimientos"><NuevoRequerimientoPage /></ModuloActivoRoute>} />
            <Route path="requerimientos/mios" element={<ModuloActivoRoute modulo="requerimientos"><MisRequerimientosPage /></ModuloActivoRoute>} />
            <Route path="requerimientos/financiero" element={<ModuloActivoRoute modulo="requerimientos"><PermissionRoute permiso="requerimientos:aprobar_financiero"><BandejaFinancieroPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="requerimientos/bodega" element={<ModuloActivoRoute modulo="requerimientos"><PermissionRoute permiso="requerimientos:gestionar_bodega"><BandejaBodegaPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="requerimientos/todos" element={<ModuloActivoRoute modulo="requerimientos"><PermissionRoute permiso="requerimientos:ver_todos"><TodosRequerimientosPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="requerimientos/:id" element={<ModuloActivoRoute modulo="requerimientos"><RequerimientoDetallePage /></ModuloActivoRoute>} />

            <Route path="flota/empresas" element={<ModuloActivoRoute modulo="flota"><PermissionRoute permiso="empresas:gestionar"><EmpresasPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="flota/vehiculos" element={<ModuloActivoRoute modulo="flota"><PermissionRoute permiso={['vehiculos:gestionar', 'vehiculos:consultar']}><VehiculosPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="flota/conductores" element={<ModuloActivoRoute modulo="flota"><PermissionRoute permiso={['conductores:gestionar', 'conductores:consultar']}><ConductoresPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="flota/plataformas" element={<ModuloActivoRoute modulo="flota"><PermissionRoute permiso={['plataformas:gestionar', 'plataformas:cambiar']}><PlataformasPage /></PermissionRoute></ModuloActivoRoute>} />

            <Route path="operacion/rutas" element={<ModuloActivoRoute modulo="operacion"><PermissionRoute permiso={['rutas:gestionar', 'horarios:gestionar', 'horarios:ver_programacion']}><RutasHorariosPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="operacion/despachos" element={<ModuloActivoRoute modulo="operacion"><PermissionRoute permiso={['despachos:registrar_salida', 'despachos:registrar_llegada', 'reportes:ver', 'empresas:ver_estadisticas']}><DespachosPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="operacion/novedades" element={<ModuloActivoRoute modulo="operacion"><PermissionRoute permiso={['novedades:registrar', 'novedades:registrar_incidente', 'novedades:consultar_historial']}><NovedadesPage /></PermissionRoute></ModuloActivoRoute>} />
            <Route path="operacion/objetos-perdidos" element={<ModuloActivoRoute modulo="operacion"><PermissionRoute permiso={['objetos_perdidos:registrar', 'objetos_perdidos:gestionar']}><ObjetosPerdidosPage /></PermissionRoute></ModuloActivoRoute>} />

            <Route path="usuarios" element={<PermissionRoute permiso="usuarios:gestionar"><UsuariosPage /></PermissionRoute>} />
            <Route path="roles" element={<PermissionRoute permiso="roles:gestionar"><RolesPage /></PermissionRoute>} />
            <Route path="auditoria" element={<PermissionRoute permiso="auditoria:leer"><AuditoriaPage /></PermissionRoute>} />
            <Route path="sistema/modulos" element={<PermissionRoute permiso="sistema:gestionar_modulos"><ModulosSistemaPage /></PermissionRoute>} />

            <Route path="induccion" element={<InduccionHome />} />
            <Route path="induccion/certificado" element={<CertificadoPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
