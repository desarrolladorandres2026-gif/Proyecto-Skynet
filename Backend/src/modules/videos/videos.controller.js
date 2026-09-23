import {
  obtenerDestacado as obtenerDestacadoService,
  listarPublicados as listarPublicadosService,
  listarCategoriasPublicadas,
  listarGestion as listarGestionService,
  crearVideo as crearVideoService,
  actualizarVideo as actualizarVideoService,
  eliminarVideo as eliminarVideoService,
  obtenerArchivoParaReproducir,
  ErrorAlmacenamientoMiniatura,
} from './videos.service.js'
import { archivosDe, descartarTemporales, transmitirArchivoVideo } from './videos.almacenamiento.js'

// ── Trabajadores (cualquier autenticado): solo ven videos publicados ────────
export async function obtenerDestacado(req, res) {
  res.json({ video: await obtenerDestacadoService() })
}

export async function listarPublicados(req, res) {
  res.json(await listarPublicadosService(req.query))
}

export async function obtenerCategorias(req, res) {
  res.json({ categorias: await listarCategoriasPublicadas() })
}

// Archivo de un video subido al VPS, con soporte de Range (adelantar/retroceder
// sin descargarlo entero). La autorización (publicado, o quien gestiona) la
// decide el service; aquí solo se entrega.
export async function transmitirArchivo(req, res) {
  const archivo = await obtenerArchivoParaReproducir(req.params.id, req.usuario)
  transmitirArchivoVideo(res, archivo)
}

// ── Gestión (videos:gestionar) ──────────────────────────────────────────────
export async function listarGestion(req, res) {
  res.json(await listarGestionService(req.query))
}

// errorHandler enmascara todo 5xx como "Error interno del servidor"; el fallo
// del almacenamiento de miniaturas (503/502) debe llegar con su mensaje real.
function responderFalloMiniatura(err, res) {
  if (err instanceof ErrorAlmacenamientoMiniatura) return res.status(err.status).json({ error: err.message })
  throw err
}

// Los archivos llegan a la carpeta temporal (ver videos.almacenamiento.js). El
// service mueve el video a su carpeta definitiva si lo guarda; lo que quede en
// la temporal al terminar (la miniatura, o el video si algo falló) se borra aquí.
export async function crearVideo(req, res) {
  const { video, miniatura } = archivosDe(req)
  try {
    const creado = await crearVideoService(req.body, req.usuario, { archivoVideo: video, archivoMiniatura: miniatura })
    res.status(201).json({ video: creado })
  } catch (err) {
    responderFalloMiniatura(err, res)
  } finally {
    await descartarTemporales(req)
  }
}

export async function actualizarVideo(req, res) {
  const { video, miniatura } = archivosDe(req)
  try {
    const actualizado = await actualizarVideoService(req.params.id, req.body, req.usuario, {
      archivoVideo: video,
      archivoMiniatura: miniatura,
      // multipart: los booleanos llegan como texto
      quitarMiniatura: req.body?.quitarMiniatura === 'true',
    })
    res.json({ video: actualizado })
  } catch (err) {
    responderFalloMiniatura(err, res)
  } finally {
    await descartarTemporales(req)
  }
}

export async function eliminarVideo(req, res) {
  await eliminarVideoService(req.params.id, req.usuario)
  res.status(204).end()
}
