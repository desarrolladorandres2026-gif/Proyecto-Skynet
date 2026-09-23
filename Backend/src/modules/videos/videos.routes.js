import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { recibirSubidaVideo } from './videos.almacenamiento.js'
import {
  obtenerDestacado,
  listarPublicados,
  obtenerCategorias,
  transmitirArchivo,
  listarGestion,
  crearVideo,
  actualizarVideo,
  eliminarVideo,
} from './videos.controller.js'

const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('videos'))

// Ver los videos publicados es capacidad universal de cualquier trabajador
// autenticado (mismo criterio que "reportar un daño": no es un permiso RBAC —
// ver seedData/rbac.data.js). Solo devuelven videos cuya fecha de publicación
// ya llegó; los programados a futuro no salen por aquí bajo ningún parámetro
// (ver filtroVisible en videos.service.js).
router.get('/destacado', obtenerDestacado)
router.get('/categorias', obtenerCategorias)
router.get('/', listarPublicados)
// El archivo de un video subido al VPS: mismo criterio de visibilidad, más
// la previsualización de programados para quien gestiona (ver
// obtenerArchivoParaReproducir).
router.get('/:id/archivo', transmitirArchivo)

// Gestión: exclusiva de quien tenga videos:gestionar (Super Admin bypassa por
// esSuperAdmin). El permiso va ANTES de recibir archivos para que quien no
// está autorizado no pueda ni siquiera subir un byte al servidor.
// recibirSubidaVideo = [espacio en disco → multer → verificación de contenido]
// (ver videos.almacenamiento.js); se expande porque safeRouter envuelve cada
// handler por separado.
router.get('/gestion', requierePermiso('videos:gestionar'), listarGestion)
router.post('/gestion', requierePermiso('videos:gestionar'), ...recibirSubidaVideo, crearVideo)
router.put('/gestion/:id', requierePermiso('videos:gestionar'), ...recibirSubidaVideo, actualizarVideo)
router.delete('/gestion/:id', requierePermiso('videos:gestionar'), eliminarVideo)

export default router
