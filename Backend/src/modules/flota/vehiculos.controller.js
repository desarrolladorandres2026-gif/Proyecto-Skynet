import Vehiculo from '../../models/Vehiculo.js'
import Empresa from '../../models/Empresa.js'
import { filtroScoped, empresaEfectiva, perteneceAlScope, esIdValido } from '../../utils/scope.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

const POPULATE_EMPRESA = { path: 'empresa', select: 'nombre' }

export async function listarVehiculos(req, res) {
  const filtro = filtroScoped(req)
  if (req.query.estado) filtro.estado = req.query.estado
  const vehiculos = await Vehiculo.find(filtro).populate(POPULATE_EMPRESA).sort({ placa: 1 })
  res.json({ vehiculos })
}

export async function crearVehiculo(req, res) {
  const { placa, tipo, marca, modelo, capacidad, soatVence, tecnomecanicaVence, estado } = req.body
  const empresaId = empresaEfectiva(req, req.body.empresa)

  if (!placa?.trim() || !tipo || !capacidad) {
    return res.status(400).json({ error: 'placa, tipo y capacidad son obligatorios' })
  }
  if (!esIdValido(empresaId)) return res.status(400).json({ error: 'La empresa es obligatoria' })
  const empresa = await Empresa.findById(empresaId)
  if (!empresa) return res.status(400).json({ error: 'La empresa indicada no existe' })

  const existente = await Vehiculo.findOne({ placa: placa.trim().toUpperCase() })
  if (existente) return res.status(409).json({ error: 'Ya existe un vehículo con esa placa' })

  const vehiculo = await Vehiculo.create({
    placa, tipo, marca, modelo, capacidad, soatVence, tecnomecanicaVence, estado,
    empresa: empresaId,
  })

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'crear',
    modulo: 'vehiculos',
    entidad: 'Vehiculo',
    entidadId: vehiculo._id,
    descripcion: `Vehículo creado: ${vehiculo.placa} (${empresa.nombre})`,
  })

  await vehiculo.populate(POPULATE_EMPRESA)
  res.status(201).json({ vehiculo })
}

export async function actualizarVehiculo(req, res) {
  const vehiculo = await Vehiculo.findById(req.params.id)
  if (!vehiculo) return res.status(404).json({ error: 'Vehículo no encontrado' })
  if (!perteneceAlScope(req, vehiculo)) {
    return res.status(403).json({ error: 'Este vehículo no pertenece a tu empresa' })
  }

  const campos = ['placa', 'tipo', 'marca', 'modelo', 'capacidad', 'soatVence', 'tecnomecanicaVence', 'estado']
  for (const c of campos) {
    if (req.body[c] !== undefined) vehiculo[c] = req.body[c]
  }
  // Cambio de empresa: solo roles globales (un scoped no saca flota de la suya).
  if (req.body.empresa !== undefined && !req.scope?.empresaId) {
    if (!esIdValido(req.body.empresa)) return res.status(400).json({ error: 'Empresa inválida' })
    vehiculo.empresa = req.body.empresa
  }
  await vehiculo.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'vehiculos',
    entidad: 'Vehiculo',
    entidadId: vehiculo._id,
    descripcion: `Vehículo actualizado: ${vehiculo.placa}`,
  })

  await vehiculo.populate(POPULATE_EMPRESA)
  res.json({ vehiculo })
}

export async function eliminarVehiculo(req, res) {
  const vehiculo = await Vehiculo.findById(req.params.id)
  if (!vehiculo) return res.status(404).json({ error: 'Vehículo no encontrado' })
  if (!perteneceAlScope(req, vehiculo)) {
    return res.status(403).json({ error: 'Este vehículo no pertenece a tu empresa' })
  }

  await vehiculo.deleteOne()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'eliminar',
    modulo: 'vehiculos',
    entidad: 'Vehiculo',
    entidadId: vehiculo._id,
    descripcion: `Vehículo eliminado: ${vehiculo.placa}`,
  })

  res.json({ mensaje: 'Vehículo eliminado correctamente' })
}
