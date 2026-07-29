import Conductor from '../../models/Conductor.js'
import Empresa from '../../models/Empresa.js'
import { filtroScoped, empresaEfectiva, perteneceAlScope, esIdValido } from '../../utils/scope.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

const POPULATE_EMPRESA = { path: 'empresa', select: 'nombre' }

export async function listarConductores(req, res) {
  const filtro = filtroScoped(req)
  if (req.query.estado) filtro.estado = req.query.estado
  const conductores = await Conductor.find(filtro).populate(POPULATE_EMPRESA).sort({ nombre: 1 })
  res.json({ conductores })
}

export async function crearConductor(req, res) {
  const { cedula, nombre, telefono, licencia, estado } = req.body
  const empresaId = empresaEfectiva(req, req.body.empresa)

  if (!cedula?.trim() || !nombre?.trim()) {
    return res.status(400).json({ error: 'cedula y nombre son obligatorios' })
  }
  if (!esIdValido(empresaId)) return res.status(400).json({ error: 'La empresa es obligatoria' })
  const empresa = await Empresa.findById(empresaId)
  if (!empresa) return res.status(400).json({ error: 'La empresa indicada no existe' })

  const existente = await Conductor.findOne({ cedula: cedula.trim() })
  if (existente) return res.status(409).json({ error: 'Ya existe un conductor con esa cédula' })

  const conductor = await Conductor.create({ cedula, nombre, telefono, licencia, estado, empresa: empresaId })

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'crear',
    modulo: 'conductores',
    entidad: 'Conductor',
    entidadId: conductor._id,
    descripcion: `Conductor creado: ${conductor.nombre} (${empresa.nombre})`,
  })

  await conductor.populate(POPULATE_EMPRESA)
  res.status(201).json({ conductor })
}

export async function actualizarConductor(req, res) {
  const conductor = await Conductor.findById(req.params.id)
  if (!conductor) return res.status(404).json({ error: 'Conductor no encontrado' })
  if (!perteneceAlScope(req, conductor)) {
    return res.status(403).json({ error: 'Este conductor no pertenece a tu empresa' })
  }

  const campos = ['cedula', 'nombre', 'telefono', 'licencia', 'estado']
  for (const c of campos) {
    if (req.body[c] !== undefined) conductor[c] = req.body[c]
  }
  if (req.body.empresa !== undefined && !req.scope?.empresaId) {
    if (!esIdValido(req.body.empresa)) return res.status(400).json({ error: 'Empresa inválida' })
    conductor.empresa = req.body.empresa
  }
  await conductor.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'conductores',
    entidad: 'Conductor',
    entidadId: conductor._id,
    descripcion: `Conductor actualizado: ${conductor.nombre}`,
  })

  await conductor.populate(POPULATE_EMPRESA)
  res.json({ conductor })
}

export async function eliminarConductor(req, res) {
  const conductor = await Conductor.findById(req.params.id)
  if (!conductor) return res.status(404).json({ error: 'Conductor no encontrado' })
  if (!perteneceAlScope(req, conductor)) {
    return res.status(403).json({ error: 'Este conductor no pertenece a tu empresa' })
  }

  await conductor.deleteOne()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'eliminar',
    modulo: 'conductores',
    entidad: 'Conductor',
    entidadId: conductor._id,
    descripcion: `Conductor eliminado: ${conductor.nombre}`,
  })

  res.json({ mensaje: 'Conductor eliminado correctamente' })
}
