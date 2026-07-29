import Novedad from '../../models/Novedad.js'
import { esIdValido } from '../../utils/scope.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

const POPULATES = [
  { path: 'vehiculo', select: 'placa' },
  { path: 'conductor', select: 'nombre' },
  { path: 'reportadoPor', select: 'nombre' },
  { path: 'cierre.por', select: 'nombre' },
]

// Historial completo: novedades:consultar_historial. Quien solo registra ve
// únicamente lo que él mismo reportó (seguimiento de lo propio).
export async function listarNovedades(req, res) {
  const filtro = {}
  if (!req.usuario.esSuperAdmin && !req.usuario.permisos.has('novedades:consultar_historial')) {
    filtro.reportadoPor = req.usuario.id_usuario
  }
  if (req.query.estado) filtro.estado = req.query.estado
  if (req.query.tipo) filtro.tipo = req.query.tipo

  const novedades = await Novedad.find(filtro).populate(POPULATES).sort({ createdAt: -1 })
  res.json({ novedades })
}

export async function crearNovedad(req, res) {
  const { tipo, descripcion, ubicacion, gravedad, vehiculo, conductor } = req.body

  if (!['operativa', 'incidente'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser operativa o incidente' })
  }
  if (!descripcion?.trim()) return res.status(400).json({ error: 'La descripción es obligatoria' })

  // Los incidentes (seguridad) exigen su permiso específico; el genérico
  // novedades:registrar solo alcanza para novedades operativas.
  if (
    tipo === 'incidente' &&
    !req.usuario.esSuperAdmin &&
    !req.usuario.permisos.has('novedades:registrar_incidente')
  ) {
    return res.status(403).json({ error: 'No tienes permiso para registrar incidentes' })
  }

  if (vehiculo && !esIdValido(vehiculo)) return res.status(400).json({ error: 'Vehículo inválido' })
  if (conductor && !esIdValido(conductor)) return res.status(400).json({ error: 'Conductor inválido' })

  const novedad = await Novedad.create({
    tipo,
    descripcion: descripcion.trim(),
    ubicacion,
    gravedad,
    vehiculo: vehiculo || null,
    conductor: conductor || null,
    reportadoPor: req.usuario.id_usuario,
  })

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'crear',
    modulo: 'novedades',
    entidad: 'Novedad',
    entidadId: novedad._id,
    descripcion: `${tipo === 'incidente' ? 'Incidente' : 'Novedad'} (${novedad.gravedad}): ${novedad.descripcion.slice(0, 80)}`,
  })

  await novedad.populate(POPULATES)
  res.status(201).json({ novedad })
}

export async function cerrarNovedad(req, res) {
  const novedad = await Novedad.findById(req.params.id)
  if (!novedad) return res.status(404).json({ error: 'Novedad no encontrada' })
  if (novedad.estado === 'cerrada') return res.status(409).json({ error: 'La novedad ya está cerrada' })

  novedad.estado = 'cerrada'
  novedad.cierre = {
    observacion: req.body.observacion?.trim() || '',
    fecha: new Date(),
    por: req.usuario.id_usuario,
  }
  await novedad.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'novedades',
    entidad: 'Novedad',
    entidadId: novedad._id,
    descripcion: `Novedad cerrada: ${novedad.descripcion.slice(0, 80)}`,
  })

  await novedad.populate(POPULATES)
  res.json({ novedad })
}
