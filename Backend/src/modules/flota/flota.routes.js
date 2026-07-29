import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso, cargarScopeEmpresa } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import {
  listarEmpresas, crearEmpresa, actualizarEmpresa, eliminarEmpresa, estadisticasEmpresa,
} from './empresas.controller.js'
import {
  listarVehiculos, crearVehiculo, actualizarVehiculo, eliminarVehiculo,
} from './vehiculos.controller.js'
import {
  listarConductores, crearConductor, actualizarConductor, eliminarConductor,
} from './conductores.controller.js'
import {
  listarPlataformas, crearPlataforma, cambiarEstadoPlataforma, eliminarPlataforma,
} from './plataformas.controller.js'

const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('flota'), cargarScopeEmpresa)

// Empresas: catálogo maestro. El listado lo necesitan también los selects de
// vehículos/conductores/usuarios, por eso basta cualquiera de esos permisos.
router.get(
  '/empresas',
  requierePermiso('empresas:gestionar', 'vehiculos:gestionar', 'conductores:gestionar', 'usuarios:gestionar'),
  listarEmpresas
)
router.post('/empresas', requierePermiso('empresas:gestionar'), crearEmpresa)
router.put('/empresas/:id', requierePermiso('empresas:gestionar'), actualizarEmpresa)
router.delete('/empresas/:id', requierePermiso('empresas:gestionar'), eliminarEmpresa)
router.get(
  '/empresas/:id/estadisticas',
  requierePermiso('empresas:gestionar', 'empresas:ver_estadisticas'),
  estadisticasEmpresa
)

// Vehículos: gestionar (admin/empresa scoped) o consultar (despachador/seguridad).
router.get('/vehiculos', requierePermiso('vehiculos:gestionar', 'vehiculos:consultar'), listarVehiculos)
router.post('/vehiculos', requierePermiso('vehiculos:gestionar'), crearVehiculo)
router.put('/vehiculos/:id', requierePermiso('vehiculos:gestionar'), actualizarVehiculo)
router.delete('/vehiculos/:id', requierePermiso('vehiculos:gestionar'), eliminarVehiculo)

// Conductores: mismo esquema.
router.get('/conductores', requierePermiso('conductores:gestionar', 'conductores:consultar'), listarConductores)
router.post('/conductores', requierePermiso('conductores:gestionar'), crearConductor)
router.put('/conductores/:id', requierePermiso('conductores:gestionar'), actualizarConductor)
router.delete('/conductores/:id', requierePermiso('conductores:gestionar'), eliminarConductor)

// Plataformas: el tablero lo ven gestores y despachadores; el cambio de
// estado es la función central del Despachador (plataformas:cambiar).
router.get('/plataformas', requierePermiso('plataformas:gestionar', 'plataformas:cambiar'), listarPlataformas)
router.post('/plataformas', requierePermiso('plataformas:gestionar'), crearPlataforma)
router.patch('/plataformas/:id/estado', requierePermiso('plataformas:gestionar', 'plataformas:cambiar'), cambiarEstadoPlataforma)
router.delete('/plataformas/:id', requierePermiso('plataformas:gestionar'), eliminarPlataforma)

export default router
