import Ruta from '../../models/Ruta.js'
import Horario from '../../models/Horario.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

export async function listarRutas(_req, res) {
  const rutas = await Ruta.find().sort({ destino: 1 })
  res.json({ rutas })
}

export async function crearRuta(req, res) {
  const { origen, destino, paradas, duracionEstimadaMin, estado } = req.body
  if (!destino?.trim()) return res.status(400).json({ error: 'El destino es obligatorio' })

  const existente = await Ruta.findOne({
    origen: (origen || 'Neiva').trim(),
    destino: destino.trim(),
  })
  if (existente) return res.status(409).json({ error: 'Esa ruta ya existe' })

  const ruta = await Ruta.create({ origen, destino, paradas, duracionEstimadaMin, estado })

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'crear',
    modulo: 'rutas',
    entidad: 'Ruta',
    entidadId: ruta._id,
    descripcion: `Ruta creada: ${ruta.origen} → ${ruta.destino}`,
  })

  res.status(201).json({ ruta })
}

export async function actualizarRuta(req, res) {
  const ruta = await Ruta.findById(req.params.id)
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' })

  const campos = ['origen', 'destino', 'paradas', 'duracionEstimadaMin', 'estado']
  for (const c of campos) {
    if (req.body[c] !== undefined) ruta[c] = req.body[c]
  }
  await ruta.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'rutas',
    entidad: 'Ruta',
    entidadId: ruta._id,
    descripcion: `Ruta actualizada: ${ruta.origen} → ${ruta.destino}`,
  })

  res.json({ ruta })
}

export async function eliminarRuta(req, res) {
  const horarios = await Horario.countDocuments({ ruta: req.params.id })
  if (horarios) {
    return res.status(409).json({ error: `No se puede eliminar: ${horarios} horario(s) usan esta ruta` })
  }

  const ruta = await Ruta.findByIdAndDelete(req.params.id)
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' })

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'eliminar',
    modulo: 'rutas',
    entidad: 'Ruta',
    entidadId: ruta._id,
    descripcion: `Ruta eliminada: ${ruta.origen} → ${ruta.destino}`,
  })

  res.json({ mensaje: 'Ruta eliminada correctamente' })
}
