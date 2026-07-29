import Plataforma from '../../models/Plataforma.js'
import Vehiculo from '../../models/Vehiculo.js'
import { esIdValido } from '../../utils/scope.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

const POPULATE_VEHICULO = {
  path: 'vehiculoActual',
  select: 'placa empresa',
  populate: { path: 'empresa', select: 'nombre' },
}

export async function listarPlataformas(_req, res) {
  const plataformas = await Plataforma.find().populate(POPULATE_VEHICULO).sort({ numero: 1 })
  res.json({ plataformas })
}

export async function crearPlataforma(req, res) {
  const { numero, tipo } = req.body
  if (!Number.isInteger(numero) || numero < 1) {
    return res.status(400).json({ error: 'numero debe ser un entero positivo' })
  }
  const existente = await Plataforma.findOne({ numero })
  if (existente) return res.status(409).json({ error: `La plataforma ${numero} ya existe` })

  const plataforma = await Plataforma.create({ numero, tipo })

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'crear',
    modulo: 'plataformas',
    entidad: 'Plataforma',
    entidadId: plataforma._id,
    descripcion: `Plataforma ${numero} creada (${plataforma.tipo})`,
  })

  res.status(201).json({ plataforma })
}

// Cambio de estado operativo (permiso plataformas:cambiar — Despachador).
// 'ocupada' exige indicar qué vehículo se acoderó; al liberar se limpia.
export async function cambiarEstadoPlataforma(req, res) {
  const { estado, vehiculoId } = req.body
  if (!['libre', 'ocupada', 'mantenimiento'].includes(estado)) {
    return res.status(400).json({ error: 'estado debe ser libre, ocupada o mantenimiento' })
  }

  const plataforma = await Plataforma.findById(req.params.id)
  if (!plataforma) return res.status(404).json({ error: 'Plataforma no encontrada' })

  if (estado === 'ocupada') {
    if (!esIdValido(vehiculoId)) {
      return res.status(400).json({ error: 'Indica el vehículo que ocupa la plataforma' })
    }
    const vehiculo = await Vehiculo.findById(vehiculoId)
    if (!vehiculo) return res.status(400).json({ error: 'El vehículo indicado no existe' })
    const ocupadaPor = await Plataforma.findOne({ vehiculoActual: vehiculoId, _id: { $ne: plataforma._id } })
    if (ocupadaPor) {
      return res.status(409).json({ error: `Ese vehículo ya está en la plataforma ${ocupadaPor.numero}` })
    }
    plataforma.vehiculoActual = vehiculoId
  } else {
    plataforma.vehiculoActual = null
  }

  plataforma.estado = estado
  await plataforma.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'plataformas',
    entidad: 'Plataforma',
    entidadId: plataforma._id,
    descripcion: `Plataforma ${plataforma.numero} → ${estado}`,
  })

  await plataforma.populate(POPULATE_VEHICULO)
  res.json({ plataforma })
}

export async function eliminarPlataforma(req, res) {
  const plataforma = await Plataforma.findById(req.params.id)
  if (!plataforma) return res.status(404).json({ error: 'Plataforma no encontrada' })
  if (plataforma.estado === 'ocupada') {
    return res.status(409).json({ error: 'No se puede eliminar una plataforma ocupada' })
  }

  await plataforma.deleteOne()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'eliminar',
    modulo: 'plataformas',
    entidad: 'Plataforma',
    entidadId: plataforma._id,
    descripcion: `Plataforma ${plataforma.numero} eliminada`,
  })

  res.json({ mensaje: 'Plataforma eliminada correctamente' })
}
