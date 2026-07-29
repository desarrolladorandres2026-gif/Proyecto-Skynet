import Horario from '../../models/Horario.js'
import Ruta from '../../models/Ruta.js'
import Empresa from '../../models/Empresa.js'
import { filtroScoped, empresaEfectiva, perteneceAlScope, esIdValido } from '../../utils/scope.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

const POPULATES = [
  { path: 'empresa', select: 'nombre' },
  { path: 'ruta', select: 'origen destino' },
]

export async function listarHorarios(req, res) {
  const horarios = await Horario.find(filtroScoped(req)).populate(POPULATES).sort({ horaSalida: 1 })
  res.json({ horarios })
}

export async function crearHorario(req, res) {
  const { ruta: rutaId, horaSalida, dias, estado } = req.body
  const empresaId = empresaEfectiva(req, req.body.empresa)

  if (!esIdValido(empresaId)) return res.status(400).json({ error: 'La empresa es obligatoria' })
  if (!esIdValido(rutaId)) return res.status(400).json({ error: 'La ruta es obligatoria' })

  const [empresa, ruta] = await Promise.all([Empresa.findById(empresaId), Ruta.findById(rutaId)])
  if (!empresa) return res.status(400).json({ error: 'La empresa indicada no existe' })
  if (!ruta) return res.status(400).json({ error: 'La ruta indicada no existe' })

  const horario = await Horario.create({ empresa: empresaId, ruta: rutaId, horaSalida, dias, estado })

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'crear',
    modulo: 'horarios',
    entidad: 'Horario',
    entidadId: horario._id,
    descripcion: `Horario creado: ${ruta.destino} ${horaSalida} (${empresa.nombre})`,
  })

  await horario.populate(POPULATES)
  res.status(201).json({ horario })
}

export async function actualizarHorario(req, res) {
  const horario = await Horario.findById(req.params.id)
  if (!horario) return res.status(404).json({ error: 'Horario no encontrado' })
  if (!perteneceAlScope(req, horario)) {
    return res.status(403).json({ error: 'Este horario no pertenece a tu empresa' })
  }

  const campos = ['horaSalida', 'dias', 'estado']
  for (const c of campos) {
    if (req.body[c] !== undefined) horario[c] = req.body[c]
  }
  if (req.body.ruta !== undefined) {
    if (!esIdValido(req.body.ruta) || !(await Ruta.exists({ _id: req.body.ruta }))) {
      return res.status(400).json({ error: 'Ruta inválida' })
    }
    horario.ruta = req.body.ruta
  }
  await horario.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'horarios',
    entidad: 'Horario',
    entidadId: horario._id,
    descripcion: `Horario actualizado: ${horario.horaSalida}`,
  })

  await horario.populate(POPULATES)
  res.json({ horario })
}

export async function eliminarHorario(req, res) {
  const horario = await Horario.findById(req.params.id)
  if (!horario) return res.status(404).json({ error: 'Horario no encontrado' })
  if (!perteneceAlScope(req, horario)) {
    return res.status(403).json({ error: 'Este horario no pertenece a tu empresa' })
  }

  await horario.deleteOne()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'eliminar',
    modulo: 'horarios',
    entidad: 'Horario',
    entidadId: horario._id,
    descripcion: `Horario eliminado: ${horario.horaSalida}`,
  })

  res.json({ mensaje: 'Horario eliminado correctamente' })
}
