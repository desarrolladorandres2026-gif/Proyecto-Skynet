import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { obtener, actualizar } from './sig-configuracion.controller.js'

const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('sig_pregunta_dia'))

// Cualquiera de los 4 permisos de gestión necesita leer la configuración
// (catálogo de componentes, niveles de desempeño): el PATCH restringido a
// 'configurar' se agrega en la fase de configuración.
router.get(
  '/',
  requierePermiso(
    'sig_pregunta_dia:gestionar_banco',
    'sig_pregunta_dia:programar',
    'sig_pregunta_dia:ver_reportes',
    'sig_pregunta_dia:configurar'
  ),
  obtener
)

router.patch('/', requierePermiso('sig_pregunta_dia:configurar'), actualizar)

export default router
