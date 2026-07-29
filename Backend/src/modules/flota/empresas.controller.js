import Empresa from '../../models/Empresa.js'
import Vehiculo from '../../models/Vehiculo.js'
import Conductor from '../../models/Conductor.js'
import Despacho from '../../models/Despacho.js'
import Usuario from '../../models/Usuario.js'
import { esIdValido } from '../../utils/scope.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

export async function listarEmpresas(_req, res) {
  const empresas = await Empresa.find().sort({ nombre: 1 })
  res.json({ empresas })
}

export async function crearEmpresa(req, res) {
  const { nombre, nit, representante, telefono, email, direccion, estado } = req.body
  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })

  if (nit?.trim()) {
    const existente = await Empresa.findOne({ nit: nit.trim() })
    if (existente) return res.status(409).json({ error: 'Ya existe una empresa con ese NIT' })
  }

  const empresa = await Empresa.create({ nombre, nit, representante, telefono, email, direccion, estado })

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'crear',
    modulo: 'empresas',
    entidad: 'Empresa',
    entidadId: empresa._id,
    descripcion: `Empresa creada: ${empresa.nombre}`,
  })

  res.status(201).json({ empresa })
}

export async function actualizarEmpresa(req, res) {
  const empresa = await Empresa.findById(req.params.id)
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' })

  const campos = ['nombre', 'nit', 'representante', 'telefono', 'email', 'direccion', 'estado']
  for (const c of campos) {
    if (req.body[c] !== undefined) empresa[c] = req.body[c]
  }
  await empresa.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'empresas',
    entidad: 'Empresa',
    entidadId: empresa._id,
    descripcion: `Empresa actualizada: ${empresa.nombre}`,
  })

  res.json({ empresa })
}

export async function eliminarEmpresa(req, res) {
  const { id } = req.params
  // Integridad referencial manual (Mongo no tiene FK): no se elimina una
  // empresa con flota, conductores o usuarios colgando de ella.
  const [vehiculos, conductores, usuarios] = await Promise.all([
    Vehiculo.countDocuments({ empresa: id }),
    Conductor.countDocuments({ empresa: id }),
    Usuario.countDocuments({ empresa: id }),
  ])
  const bloqueos = []
  if (vehiculos) bloqueos.push(`${vehiculos} vehículo(s)`)
  if (conductores) bloqueos.push(`${conductores} conductor(es)`)
  if (usuarios) bloqueos.push(`${usuarios} usuario(s)`)
  if (bloqueos.length) {
    return res.status(409).json({ error: `No se puede eliminar: tiene ${bloqueos.join(', ')} asociados` })
  }

  const empresa = await Empresa.findByIdAndDelete(id)
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' })

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'eliminar',
    modulo: 'empresas',
    entidad: 'Empresa',
    entidadId: id,
    descripcion: `Empresa eliminada: ${empresa.nombre}`,
  })

  res.json({ mensaje: 'Empresa eliminada correctamente' })
}

// Estadísticas de UNA empresa. El rol Empresa Transportadora
// (empresas:ver_estadisticas) solo puede pedir las suyas: el id del scope
// pisa al de la URL.
export async function estadisticasEmpresa(req, res) {
  const id = req.scope?.empresaId ? req.scope.empresaId.toString() : req.params.id
  if (!esIdValido(id)) return res.status(400).json({ error: 'Empresa inválida' })

  const empresa = await Empresa.findById(id)
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' })

  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const inicioDia = new Date(hoy)
  inicioDia.setHours(0, 0, 0, 0)

  const [vehiculos, vehiculosActivos, conductores, despachosMes, despachosHoy, pasajerosMes] = await Promise.all([
    Vehiculo.countDocuments({ empresa: id }),
    Vehiculo.countDocuments({ empresa: id, estado: 'activo' }),
    Conductor.countDocuments({ empresa: id, estado: 'activo' }),
    Despacho.countDocuments({ empresa: id, horaSalida: { $gte: inicioMes }, estado: { $ne: 'anulado' } }),
    Despacho.countDocuments({ empresa: id, horaSalida: { $gte: inicioDia }, estado: { $ne: 'anulado' } }),
    Despacho.aggregate([
      { $match: { empresa: empresa._id, horaSalida: { $gte: inicioMes }, estado: { $ne: 'anulado' } } },
      { $group: { _id: null, total: { $sum: '$pasajeros' } } },
    ]),
  ])

  res.json({
    empresa: { _id: empresa._id, nombre: empresa.nombre },
    estadisticas: {
      vehiculos,
      vehiculosActivos,
      conductoresActivos: conductores,
      despachosHoy,
      despachosMes,
      pasajerosMes: pasajerosMes[0]?.total || 0,
    },
  })
}
