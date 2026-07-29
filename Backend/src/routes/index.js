import { Router } from 'express'
import authRoutes from '../modules/auth/auth.routes.js'
import usuariosRoutes from '../modules/usuarios/usuarios.routes.js'
import mantenimientoRoutes from '../modules/mantenimiento/mantenimiento.routes.js'
import ordenesRoutes from '../modules/mantenimiento/ordenes.routes.js'
import sigittnRoutes from '../modules/sigittn/sigittn.routes.js'
import soporteRoutes from '../modules/sigittn/soporte.routes.js'
import rolesRoutes from '../modules/roles/roles.routes.js'
import permisosRoutes from '../modules/permisos/permisos.routes.js'
import auditoriaRoutes from '../modules/auditoria/auditoria.routes.js'
import danosRoutes from '../modules/danos/danos.routes.js'
import requerimientosRoutes from '../modules/requerimientos/requerimientos.routes.js'
import flotaRoutes from '../modules/flota/flota.routes.js'
import operacionRoutes from '../modules/operacion/operacion.routes.js'
import sistemaRoutes from '../modules/sistema/sistema.routes.js'

const router = Router()

router.use('/auth', authRoutes)
router.use('/usuarios', usuariosRoutes)
router.use('/mantenimiento', mantenimientoRoutes)
// Montado aparte (no dentro de mantenimiento.routes.js): usa RBAC granular
// nuevo, no el requireModulo('mantenimiento') binario legado — ver
// ordenes.routes.js. Express prueba primero el prefijo /mantenimiento de
// arriba; como ninguna de sus rutas matchea /ordenes/*, cae aquí.
router.use('/mantenimiento/ordenes', ordenesRoutes)
router.use('/sigittn', sigittnRoutes)
router.use('/soporte', soporteRoutes)
router.use('/roles', rolesRoutes)
router.use('/permisos', permisosRoutes)
router.use('/auditoria', auditoriaRoutes)
router.use('/danos', danosRoutes)
router.use('/requerimientos', requerimientosRoutes)
router.use('/sistema', sistemaRoutes)
// flota expone /empresas, /vehiculos, /conductores, /plataformas;
// operacion expone /rutas, /horarios, /despachos, /novedades,
// /objetos-perdidos y /dashboard — por eso van montados en la raíz.
router.use('/', flotaRoutes)
router.use('/', operacionRoutes)

export default router
