import multer from 'multer'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { TAMANO_MAXIMO_IMAGEN } from './medios.service.js'
import { TAMANO_MAXIMO_PDF } from './radicados.service.js'
import { listar, obtener, categorias, crear, actualizar, eliminar } from './noticias.controller.js'
import {
  resumen,
  medios,
  subirImagen,
  eventosListar,
  eventosObtener,
  eventosSedes,
  eventosCrear,
  eventosActualizar,
  eventosEliminar,
  avisosListar,
  avisosObtener,
  avisosCrear,
  avisosActualizar,
  avisosEliminar,
  radicadosFormularios,
  radicadosListar,
  radicadosObtener,
  radicadosEstado,
  radicadosEliminar,
  radicadosExportar,
  radicadosResponder,
} from './sitio_web.controller.js'

const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('sitio_web'))

// Permisos (todos ya existían en el catálogo RBAC, sin ningún módulo que los
// usara; el rol Gestión/Comunicador los tiene):
//  - noticias:gestionar     -> noticias
//  - eventos:gestionar      -> eventos
//  - publicaciones:gestionar -> avisos al público
// Resumen y biblioteca de medios sirven a las tres pantallas (la imagen
// destacada de una noticia sale de ahí), así que aceptan cualquiera de los tres.
// requierePermiso(...codigos) es un rest-parameter: NUNCA pasar un array.
// 'sitio_web:gestionar' abre todas las secciones; los tres sueltos permiten
// delegar solo una.
const TODO = 'sitio_web:gestionar'
const algunoDelModulo = requierePermiso(TODO, 'noticias:gestionar', 'eventos:gestionar', 'publicaciones:gestionar')
const permNoticias = requierePermiso(TODO, 'noticias:gestionar')
const permEventos = requierePermiso(TODO, 'eventos:gestionar')
const permAvisos = requierePermiso(TODO, 'publicaciones:gestionar')
// Radicados (PQRSF): pqrs:gestionar ya existía en el catálogo RBAC; lo tiene
// Gestión/Comunicador y Operador.
const permRadicados = requierePermiso(TODO, 'pqrs:gestionar')
// Borrar es irreversible (también borra las respuestas y los PDF): el Operador
// ve y responde con pqrs:gestionar pero no elimina. Quien tiene
// sitio_web:gestionar (Administrador, Financiero, Comunicador) conserva el
// borrado sin migrar la base; pqrs:eliminar permite delegarlo a otro rol.
const permEliminarRadicados = requierePermiso(TODO, 'pqrs:eliminar')

// La imagen se queda en memoria (tope de 8 MB) en vez de pasar por disco:
// se valida su contenido real y se reenvía a WordPress en el mismo instante,
// no hay nada que limpiar si algo falla a la mitad.
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANO_MAXIMO_IMAGEN, files: 1 } })
function recibirImagen(req, res, next) {
  subida.single('archivo')(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') return next(new ErrorValidacion('La imagen supera el máximo de 8 MB'))
    next(new ErrorValidacion('No se pudo leer el archivo enviado'))
  })
}

router.get('/resumen', algunoDelModulo, resumen)

const subidaPdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANO_MAXIMO_PDF, files: 1 } })
function recibirPdf(req, res, next) {
  subidaPdf.single('archivo')(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') return next(new ErrorValidacion('El PDF supera el máximo de 10 MB'))
    next(new ErrorValidacion('No se pudo leer el archivo enviado'))
  })
}

router.get('/medios', algunoDelModulo, medios)
// El permiso va ANTES de recibir el archivo: quien no está autorizado no
// puede ni siquiera subir un byte.
router.post('/medios', algunoDelModulo, recibirImagen, subirImagen)

router.get('/noticias/categorias', algunoDelModulo, categorias)
router.get('/noticias', permNoticias, listar)
router.get('/noticias/:id', permNoticias, obtener)
router.post('/noticias', permNoticias, crear)
router.put('/noticias/:id', permNoticias, actualizar)
router.delete('/noticias/:id', permNoticias, eliminar)

router.get('/eventos/sedes', permEventos, eventosSedes)
router.get('/eventos', permEventos, eventosListar)
router.get('/eventos/:id', permEventos, eventosObtener)
router.post('/eventos', permEventos, eventosCrear)
router.put('/eventos/:id', permEventos, eventosActualizar)
router.delete('/eventos/:id', permEventos, eventosEliminar)

router.get('/radicados/formularios', permRadicados, radicadosFormularios)
router.get('/radicados', permRadicados, radicadosListar)
router.get('/radicados/exportar', permRadicados, radicadosExportar)
router.get('/radicados/:id', permRadicados, radicadosObtener)
router.put('/radicados/:id/estado', permRadicados, radicadosEstado)
// El permiso va ANTES de recibir el archivo, igual que en /medios.
router.post('/radicados/:id/respuesta', permRadicados, recibirPdf, radicadosResponder)
router.delete('/radicados/:id', permEliminarRadicados, radicadosEliminar)

router.get('/avisos', permAvisos, avisosListar)
router.get('/avisos/:id', permAvisos, avisosObtener)
router.post('/avisos', permAvisos, avisosCrear)
router.put('/avisos/:id', permAvisos, avisosActualizar)
router.delete('/avisos/:id', permAvisos, avisosEliminar)

export default router
