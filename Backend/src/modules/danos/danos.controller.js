import ReporteDano from '../../models/ReporteDano.js'
import { subirImagen, eliminarImagen, cloudinaryConfigurado } from '../../config/cloudinary.js'
import * as servicio from './danos.service.js'

// Capa delgada: toda la lógica de asignación y de la máquina de estados vive
// en danos.service.js. Aquí solo se traduce HTTP <-> Service.

const POPULATE_REPORTANTE = { path: 'reportadoPor', select: 'nombre nombre_usuario dependencia' }

// Un técnico "puro" (mantenimiento:ejecutar sin danos:gestionar, y sin ser
// Super Admin) solo ejecuta lo que le asignan — no reporta. Se mira la
// combinación de permisos, no el slug del rol, por el mismo motivo que el
// resto del módulo: el RBAC es dinámico (ver PERMISO_TECNICO en el service).
function esTecnicoPuro(usuario) {
  return (
    usuario.permisos?.has('mantenimiento:ejecutar') === true &&
    !usuario.esSuperAdmin &&
    !usuario.permisos?.has('danos:gestionar')
  )
}

export async function crearReporte(req, res) {
  if (esTecnicoPuro(req.usuario)) {
    return res.status(403).json({ error: 'El personal de mantenimiento no puede crear reportes' })
  }

  const { fecha, descripcion } = req.body
  const tipo = servicio.TIPOS.includes(req.body.tipo) ? req.body.tipo : 'dano'

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
    historial: [
      {
        accion: 'creado',
        a: 'pendiente',
        por: req.usuario.id_usuario,
        nombrePor: req.usuario.nombre_usuario,
      },
    ],
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

  // Reparto automático: si hay alguien de mantenimiento disponible el reporte
  // sale ya asignado y notificado, sin pasar por el administrador. Es
  // best-effort — nunca hace fallar la creación (ver el service).
  await servicio.asignarAutomaticamente(reporte)

  await reporte.populate([POPULATE_REPORTANTE, { path: 'asignadoA', select: 'nombre nombre_usuario' }])
  res.status(201).json({ reporte })
}

// Los reportes propios: los ve cualquier usuario autenticado (quien reporta
// puede seguir el estado de lo que reportó, y ahora también quién lo repara).
export async function misReportes(req, res) {
  const reportes = await ReporteDano.find({ reportadoPor: req.usuario.id_usuario })
    .populate({ path: 'asignadoA', select: 'nombre nombre_usuario' })
    .populate({ path: 'atendidoPor', select: 'nombre nombre_usuario' })
    .sort({ createdAt: -1 })
  res.json({ reportes })
}

// Vista de gestión (mantenimiento / administrador / super admin). Filtros:
// ?estado= ?tipo= ?prioridad= ?asignado=mi|sin|<idUsuario>
export async function listarReportes(req, res) {
  const { estado, tipo, prioridad, asignado } = req.query
  const data = await servicio.listarReportes({ estado, tipo, prioridad, asignado }, req.usuario)
  res.json(data)
}

// Ficha completa con historial y requerimientos vinculados: es lo que responde
// "¿en qué va el daño y quién lo tiene?".
export async function detalleReporte(req, res) {
  const reporte = await servicio.obtenerReporte(req.params.id, req.usuario)
  res.json({ reporte })
}

// El equipo de mantenimiento con su carga de trabajo, para el modal de
// asignación y para el panel de disponibilidad del administrador.
export async function listarTecnicos(req, res) {
  const tecnicos = await servicio.listarTecnicosConCarga()
  res.json({ tecnicos })
}

export async function asignarReporte(req, res) {
  const { tecnicoId, nota, forzar } = req.body
  const reporte = await servicio.asignarReporte(req.params.id, { tecnicoId, nota, forzar: forzar === true || forzar === 'true' }, req.usuario)
  res.json({ reporte })
}

export async function cambiarEstado(req, res) {
  const { estado, nota, observacion, motivoEspera, prioridad, reparacionFecha, reparacionModulo } = req.body

  let reparacion
  if (estado === 'resuelto') {
    let evidenciasNuevas = []
    if (req.files?.length) {
      if (!cloudinaryConfigurado()) {
        return res.status(503).json({ error: 'El almacenamiento de imágenes no está configurado (Cloudinary)' })
      }
      try {
        const subidas = await Promise.all(req.files.map((f) => subirImagen(f.buffer, 'skynet/danos_reparacion')))
        evidenciasNuevas = subidas.map((s) => ({ url: s.secure_url, publicId: s.public_id }))
      } catch (err) {
        console.error('Error subiendo evidencia de reparación a Cloudinary:', err)
        return res.status(502).json({ error: 'No se pudo subir la evidencia, inténtalo de nuevo' })
      }
    }
    reparacion = { fecha: reparacionFecha, modulo: reparacionModulo, evidenciasNuevas }
  }

  const reporte = await servicio.cambiarEstadoReporte(
    req.params.id,
    // `observacion` es el nombre que usaba el cliente anterior; se acepta como
    // alias para no romper nada que todavía lo mande.
    { estado, nota: nota ?? observacion, motivoEspera, prioridad, reparacion },
    req.usuario
  )
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
