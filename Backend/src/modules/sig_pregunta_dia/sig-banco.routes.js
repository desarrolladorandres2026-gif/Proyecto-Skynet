import multer from 'multer'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import {
  crear, listar, detalle, editar, archivar, eliminar,
  importarExcel, plantillaExcel,
} from './sig-banco.controller.js'

// Banco de preguntas: gestión exclusiva de quien tenga
// sig_pregunta_dia:gestionar_banco (rol SIG/HSEQ o Super Admin). Nadie "solo
// ve" el banco sin poder gestionarlo — a diferencia de "responder la
// pregunta del día" (universal, ver sig-respuestas.routes.js), esto no es
// una capacidad de cualquier trabajador.
const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('sig_pregunta_dia'), requierePermiso('sig_pregunta_dia:gestionar_banco'))

// memoryStorage: el .xlsx se parsea en RAM con ExcelJS y no queda en disco
// (mismo criterio que ausencias.routes.js). 5 MB alcanzan de sobra para miles
// de preguntas en texto.
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const esXlsx =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.originalname.toLowerCase().endsWith('.xlsx')
    if (esXlsx) return cb(null, true)
    cb(new Error('El archivo debe ser un Excel .xlsx'))
  },
})

router.post('/', crear)
router.get('/', listar)

// Rutas literales antes de '/:id': si no, Express trataría 'plantilla' como
// un id de pregunta.
router.get('/plantilla', plantillaExcel)
router.post('/importar', uploadExcel.single('archivo'), importarExcel)

router.get('/:id', detalle)
router.patch('/:id', editar)
router.patch('/:id/archivar', archivar)
router.delete('/:id', eliminar)

export default router
