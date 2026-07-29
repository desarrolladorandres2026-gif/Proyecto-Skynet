import Equipo from '../../models/mantenimiento/Equipo.js'
import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import TipoEquipo from '../../models/mantenimiento/TipoEquipo.js'
import Marca from '../../models/mantenimiento/Marca.js'
import { escapeRegex } from '../../utils/regex.js'

async function resolverCatalogo(Modelo, id, nombreNuevo) {
  if (nombreNuevo?.trim()) {
    const nombreLimpio = nombreNuevo.trim()
    // findOneAndUpdate+upsert es atómico: evita duplicados si dos requests
    // concurrentes crean el mismo catálogo nuevo (a diferencia de un
    // findOne + create separados).
    const item = await Modelo.findOneAndUpdate(
      { nombre: { $regex: `^${escapeRegex(nombreLimpio)}$`, $options: 'i' } },
      { $setOnInsert: { nombre: nombreLimpio } },
      { upsert: true, new: true }
    )
    return { id: item._id, nombre: item.nombre }
  }

  if (!id) return null
  const item = await Modelo.findById(id)
  if (!item) return null
  return { id: item._id, nombre: item.nombre }
}

export async function listarEquipos(req, res) {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = 30
  const q = req.query.q?.trim()
  const qEscapado = q ? escapeRegex(q) : null

  const filtro = qEscapado
    ? {
        $or: [
          { serial: { $regex: qEscapado, $options: 'i' } },
          { 'marca.nombre': { $regex: qEscapado, $options: 'i' } },
          { 'tipo.nombre': { $regex: qEscapado, $options: 'i' } },
          { modelo: { $regex: qEscapado, $options: 'i' } },
          { ubicacion: { $regex: qEscapado, $options: 'i' } },
        ],
      }
    : {}

  const [equipos, total] = await Promise.all([
    Equipo.find(filtro)
      .sort({ numero_inventario: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Equipo.countDocuments(filtro),
  ])

  res.json({ equipos, total, pages: Math.ceil(total / limit), page })
}

export async function obtenerEquipo(req, res) {
  const equipo = await Equipo.findById(req.params.id)
  if (!equipo) return res.status(404).json({ error: 'Equipo no encontrado' })
  res.json({ equipo })
}

export async function fichaTecnica(req, res) {
  const equipo = await Equipo.findById(req.params.id)
  if (!equipo) return res.status(404).json({ error: 'Equipo no encontrado' })

  const mantenimientos = await Mantenimiento.find({ equipo: equipo._id }).sort({
    fecha: -1,
    creado_en: -1,
  })

  res.json({ equipo, mantenimientos })
}

export async function crearEquipo(req, res) {
  const body = req.body

  const tipo = await resolverCatalogo(TipoEquipo, body.tipo_id, body.otroTipo)
  const marca = await resolverCatalogo(Marca, body.marca_id, body.otraMarca)

  if (!tipo) return res.status(400).json({ error: 'tipo es obligatorio' })
  if (!marca) return res.status(400).json({ error: 'marca es obligatoria' })

  const camposObligatorios = ['numero_inventario', 'serial', 'modelo', 'ubicacion', 'responsable', 'dependencia', 'estado_actual']
  for (const campo of camposObligatorios) {
    if (!body[campo]?.trim()) {
      return res.status(400).json({ error: `${campo} es obligatorio` })
    }
  }

  let fecha_compra
  if (body.fecha_compra) {
    fecha_compra = new Date(body.fecha_compra)
    if (Number.isNaN(fecha_compra.getTime())) {
      return res.status(400).json({ error: 'fecha_compra inválida' })
    }
  }

  const equipo = await Equipo.create({
    numero_inventario: body.numero_inventario.trim(),
    serial: body.serial.trim(),
    tipo,
    marca,
    modelo: body.modelo.trim(),
    ubicacion: body.ubicacion.trim(),
    responsable: body.responsable.trim(),
    dependencia: body.dependencia.trim(),
    estado_actual: body.estado_actual.trim(),
    observaciones: body.observaciones?.trim(),
    procesador: body.procesador?.trim(),
    ram: body.ram?.trim(),
    disco_duro: body.disco_duro?.trim(),
    sistema_operativo: body.sistema_operativo?.trim(),
    proveedor: body.proveedor?.trim(),
    fecha_compra,
  })

  res.status(201).json({ equipo })
}

export async function actualizarEquipo(req, res) {
  const body = req.body
  const equipo = await Equipo.findById(req.params.id)
  if (!equipo) return res.status(404).json({ error: 'Equipo no encontrado' })

  if (body.tipo_id || body.otroTipo) {
    const tipo = await resolverCatalogo(TipoEquipo, body.tipo_id, body.otroTipo)
    if (tipo) equipo.tipo = tipo
  }
  if (body.marca_id || body.otraMarca) {
    const marca = await resolverCatalogo(Marca, body.marca_id, body.otraMarca)
    if (marca) equipo.marca = marca
  }

  const camposTexto = [
    'numero_inventario', 'serial', 'modelo', 'ubicacion', 'responsable', 'dependencia',
    'estado_actual', 'observaciones', 'procesador', 'ram', 'disco_duro', 'sistema_operativo', 'proveedor',
  ]
  for (const campo of camposTexto) {
    if (body[campo] !== undefined) equipo[campo] = body[campo]
  }

  if (body.fecha_compra !== undefined) {
    if (!body.fecha_compra) {
      equipo.fecha_compra = null
    } else {
      const fecha = new Date(body.fecha_compra)
      if (Number.isNaN(fecha.getTime())) {
        return res.status(400).json({ error: 'fecha_compra inválida' })
      }
      equipo.fecha_compra = fecha
    }
  }

  await equipo.save()
  res.json({ equipo })
}

// Estados activos de la Orden de Trabajo (CMMS Fase 1) — ver
// modules/mantenimiento/ordenes.service.js, misma lista.
const ESTADOS_OT_ACTIVOS = [
  'reportado', 'programada', 'asignada', 'en_progreso', 'en_espera',
  'resuelta', 'pendiente_aprobacion',
]

export async function eliminarEquipo(req, res) {
  const equipo = await Equipo.findById(req.params.id)
  if (!equipo) return res.status(404).json({ error: 'Equipo no encontrado' })

  const otActiva = await Mantenimiento.exists({ equipo: equipo._id, estado: { $in: ESTADOS_OT_ACTIVOS } })
  if (otActiva) {
    return res.status(409).json({ error: 'No se puede eliminar: el equipo tiene una orden de trabajo activa' })
  }

  await Mantenimiento.deleteMany({ equipo: equipo._id })
  await equipo.deleteOne()

  res.json({ mensaje: `Equipo ${equipo.numero_inventario} eliminado correctamente` })
}
