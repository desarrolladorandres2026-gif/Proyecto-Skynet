import { Router } from 'express'
import authRoutes from '../modules/auth/auth.routes.js'
import usuariosRoutes from '../modules/usuarios/usuarios.routes.js'
import mantenimientoRoutes from '../modules/mantenimiento/mantenimiento.routes.js'
import ordenesRoutes from '../modules/mantenimiento/ordenes.routes.js'
import rolesRoutes from '../modules/roles/roles.routes.js'
import permisosRoutes from '../modules/permisos/permisos.routes.js'
import auditoriaRoutes from '../modules/auditoria/auditoria.routes.js'
import danosRoutes from '../modules/danos/danos.routes.js'
import requerimientosRoutes from '../modules/requerimientos/requerimientos.routes.js'
import emailRoutes from '../modules/email/email.routes.js'
import iaRoutes from '../modules/ia/ia.routes.js'
import ausenciasRoutes from '../modules/ausencias/ausencias.routes.js'
import operacionRoutes from '../modules/operacion/operacion.routes.js'
import sistemaRoutes from '../modules/sistema/sistema.routes.js'
import notificacionesRoutes from '../modules/notificaciones/notificaciones.routes.js'
import perfilRoutes from '../modules/perfil/perfil.routes.js'
import copilotoRoutes from '../modules/copiloto/copiloto.routes.js'
import backupRoutes from '../modules/backup/backup.routes.js'
import catalogosRoutes from '../modules/catalogos/catalogos.routes.js'

const router = Router()

router.use('/auth', authRoutes)
router.use('/usuarios', usuariosRoutes)
// Montado aparte (no dentro de mantenimiento.routes.js): usa RBAC granular
// nuevo, no el requireModulo('mantenimiento') binario legado — ver
// ordenes.routes.js. DEBE ir antes que '/mantenimiento' de abajo: Express
// matchea por prefijo en orden de registro, y el router legado exige
// requireModulo('mantenimiento') (el array Usuario.modulos, un checkbox
// aparte del rol RBAC) con un router.use() sin ruta — ese gate responde 403
// para CUALQUIER sub-ruta de /mantenimiento/*, incluida /ordenes/*, antes de
// que Express pueda "caer" al router nuevo. Montarlo primero aquí evita que
// alguien con el rol/permiso RBAC correcto pero sin ese checkbox legado
// quede bloqueado de todo el CMMS (bug real, encontrado en prueba de carga).
router.use('/mantenimiento/ordenes', ordenesRoutes)
router.use('/mantenimiento', mantenimientoRoutes)
router.use('/roles', rolesRoutes)
router.use('/permisos', permisosRoutes)
router.use('/auditoria', auditoriaRoutes)
router.use('/danos', danosRoutes)
router.use('/requerimientos', requerimientosRoutes)
router.use('/email', emailRoutes)
router.use('/ia', iaRoutes)
router.use('/ausencias', ausenciasRoutes)
router.use('/sistema', sistemaRoutes)
router.use('/notificaciones', notificacionesRoutes)
router.use('/perfil', perfilRoutes)
router.use('/copiloto', copilotoRoutes)
router.use('/backup', backupRoutes)
router.use('/catalogos', catalogosRoutes)
// operacion ahora solo expone /dashboard (núcleo, universal para todo rol);
// se monta en la raíz por eso.
router.use('/', operacionRoutes)

export default router
