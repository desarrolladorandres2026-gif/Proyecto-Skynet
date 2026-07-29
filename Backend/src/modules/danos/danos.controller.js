import ReporteDano from '../../models/ReporteDano.js'
import { subirImagen, eliminarImagen, cloudinaryConfigurado } from '../../config/cloudinary.js'

const POPULATE_REPORTANTE = { path: 'reportadoPor', select: 'nombre nombre_usuario dependencia' }
const POPULATE_ATENDIDO = { path: 'atendidoPor', select: 'nombre nombre_usuario' }

const ESTADOS = ['pendiente', 'en_proceso', 'resuelto']
const TIPOS = ['dano', 'novedad', 'sugerencia', 'otro']

export async function crearReporte(req, res) {
  const { fecha, descripcion } = req.body
  const tipo = TIPOS.includes(req.body.tipo) ? req.body.tipo : 'dano'

  if (!descripcion?.trim()) {
    return res.status(400).json({ error: 'La descripción es obligatoria' })
  }
  // Solo un daño físico exige evidencia fotográfica obligatoria (igual que
  // siempre); el resto de tipos la dejan opcional.
  if (tipo === 'dano' && !req.file) {
    return res.status(400).json({ error: 'La foto del daño es obligatoria' })
  }
  const fechaParsed = new Date(fecha)
  if (!fecha || Number.isNaN(fechaParsed.getTime())) {
    return res.status(400).json({ error: 'La fecha y hora son obligatorias' })
  }

  const datosCreacion = {
    tipo,
    fecha: fechaParsed,
    descripcion: descripcion.trim(),
    reportadoPor: req.usuario.id_usuario,
  }

  if (req.file) {
    if (!cloudinaryConfigurado()) {
      return res.status(503).json({ error: 'El almacenamiento de imágenes no está configurado (Cloudinary)' })
    }
    let subida
    try {
      subida = await subirImagen(req.file.buffer, 'skynet/danos')
    } catch (err) {
      console.error('Error subiendo imagen a Cloudinary:', err)
      return res.status(502).json({ error: 'No se pudo subir la foto, inténtalo de nuevo' })
    }
    datosCreacion.foto = { url: subida.secure_url, publicId: subida.public_id }
  }

  const reporte = await ReporteDano.create(datosCreacion)

  await reporte.populate(POPULATE_REPORTANTE)
  res.status(201).json({ reporte })
}

// Los reportes propios: los ve cualquier usuario autenticado (quien reporta
// puede seguir el estado de lo que reportó).
export async function misReportes(req, res) {
  const reportes = await ReporteDano.find({ reportadoPor: req.usuario.id_usuario })
    .populate(POPULATE_ATENDIDO)
    .sort({ createdAt: -1 })
  res.json({ reportes })
}

// Vista de gestión (mantenimiento / administrador / super admin):
// ?estado=pendiente|en_proceso|resuelto y/o ?tipo=dano|novedad|sugerencia|otro
// filtran; sin filtro devuelve todo.
export async function listarReportes(req, res) {
  const { estado, tipo } = req.query
  const filtro = {}
  if (estado) {
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ error: `estado debe ser uno de: ${ESTADOS.join(', ')}` })
    }
    filtro.estado = estado
  }
  if (tipo) {
    if (!TIPOS.includes(tipo)) {
      return res.status(400).json({ error: `tipo debe ser uno de: ${TIPOS.join(', ')}` })
    }
    filtro.tipo = tipo
  }

  const reportes = await ReporteDano.find(filtro)
    .populate(POPULATE_REPORTANTE)
    .populate(POPULATE_ATENDIDO)
    .sort({ estado: 1, fecha: -1 })

  const [pendientes, enProceso, resueltos] = await Promise.all([
    ReporteDano.countDocuments({ estado: 'pendiente' }),
    ReporteDano.countDocuments({ estado: 'en_proceso' }),
    ReporteDano.countDocuments({ estado: 'resuelto' }),
  ])

  res.json({ reportes, resumen: { pendientes, en_proceso: enProceso, resueltos } })
}

export async function cambiarEstado(req, res) {
  const { estado, observacion } = req.body
  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ error: `estado debe ser uno de: ${ESTADOS.join(', ')}` })
  }

  const reporte = await ReporteDano.findById(req.params.id)
  if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' })

  reporte.estado = estado
  reporte.atendidoPor = req.usuario.id_usuario
  if (observacion !== undefined) reporte.observacionAtencion = String(observacion).trim()
  reporte.fechaResolucion = estado === 'resuelto' ? new Date() : null

  await reporte.save()
  await reporte.populate([POPULATE_REPORTANTE, POPULATE_ATENDIDO])
  res.json({ reporte })
}

export async function eliminarReporte(req, res) {
  const reporte = await ReporteDano.findByIdAndDelete(req.params.id)
  if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' })

  // Mejor esfuerzo: si Cloudinary falla, el reporte ya se eliminó y la imagen
  // huérfana no bloquea al usuario; queda registrada en el log para limpieza.
  // reporte.foto puede no existir (tipos distintos a 'dano' sin foto adjunta).
  if (reporte.foto?.publicId) {
    try {
      await eliminarImagen(reporte.foto.publicId)
    } catch (err) {
      console.error('No se pudo eliminar la imagen de Cloudinary:', reporte.foto.publicId, err.message)
    }
  }

  res.json({ mensaje: 'Reporte eliminado correctamente' })
}
