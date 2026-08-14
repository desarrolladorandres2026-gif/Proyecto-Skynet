import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import Equipo from '../../models/mantenimiento/Equipo.js'
import { escapeRegex } from '../../utils/regex.js'
import { hoy as HOY_BOGOTA } from '../../utils/fechas.js'

// Antes construía "hoy en Bogotá" con
// `new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Bogota' }))`
// seguido de `setHours(0,0,0,0)`: el truco del toLocaleString sí produce la
// hora de pared correcta de Bogotá, pero setHours vuelve a zonificarla según
// la zona del PROCESO — en el VPS (que corre en UTC) el resultado final
// terminaba siendo la medianoche de Bogotá interpretada como si fuera UTC, un
// desfase de 5 horas más respecto al que ya tenía el truco. hoy() (ver
// utils/fechas.js) ancla directamente a 05:00 UTC = 00:00 Neiva, sin pasos
// intermedios que dependan de dónde corre el proceso.
export async function actualizarEstadosVencidos() {
  const hoy = HOY_BOGOTA()
  await Mantenimiento.updateMany(
    { estado: 'programado', fecha: { $lte: hoy } },
    { $set: { estado: 'pendiente' } }
  )
}

export async function listarPendientes(_req, res) {
  await actualizarEstadosVencidos()
  const mantenimientos = await Mantenimiento.find({ estado: 'pendiente' }).populate('equipo').sort({ fecha: 1 })
  res.json({ mantenimientos })
}

export async function listarFinalizados(_req, res) {
  const mantenimientos = await Mantenimiento.find({ estado: 'finalizado' }).populate('equipo').sort({ fecha: -1 })
  res.json({ mantenimientos })
}

export async function listarProximos(_req, res) {
  const hoy = HOY_BOGOTA()
  // Suma en milisegundos, no setDate(): setDate reinterpreta el resultado en
  // la zona del proceso, el mismo tipo de dependencia que se está quitando de
  // este archivo.
  const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000)

  const mantenimientos = await Mantenimiento.find({
    estado: 'pendiente',
    fecha: { $gte: hoy, $lte: en7dias },
  })
    .populate('equipo')
    .sort({ fecha: 1 })

  res.json({ mantenimientos })
}

export async function listarProgramados(req, res) {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = 30
  const busqueda = req.query.busqueda?.trim().toLowerCase()
  const busquedaEscapada = busqueda ? escapeRegex(busqueda) : null

  const filtro = { estado: 'programado' }
  let query = Mantenimiento.find(filtro).populate('equipo')

  if (busquedaEscapada) {
    const equiposCoincidentes = await Equipo.find({
      $or: [
        { 'marca.nombre': { $regex: busquedaEscapada, $options: 'i' } },
        { modelo: { $regex: busquedaEscapada, $options: 'i' } },
        { dependencia: { $regex: busquedaEscapada, $options: 'i' } },
      ],
    }).select('_id')

    filtro.$or = [
      { tecnico: { $regex: busquedaEscapada, $options: 'i' } },
      { tipo: { $regex: busquedaEscapada, $options: 'i' } },
      { equipo: { $in: equiposCoincidentes.map((e) => e._id) } },
    ]
    query = Mantenimiento.find(filtro).populate('equipo')
  }

  const total = await Mantenimiento.countDocuments(filtro)
  const mantenimientos = await query
    .sort({ fecha: 1 })
    .skip((page - 1) * limit)
    .limit(limit)

  res.json({ mantenimientos, total, pages: Math.ceil(total / limit), page })
}

export async function programarMantenimiento(req, res) {
  const { equipo_id, fecha_programada, tipo, tecnico, observaciones } = req.body

  if (!equipo_id || !fecha_programada || !tipo || !tecnico || !observaciones) {
    return res.status(400).json({ error: 'equipo_id, fecha_programada, tipo, tecnico y observaciones son obligatorios' })
  }

  const equipo = await Equipo.findById(equipo_id)
  if (!equipo) return res.status(404).json({ error: 'Equipo no encontrado' })

  const fecha = new Date(fecha_programada)
  if (Number.isNaN(fecha.getTime())) return res.status(400).json({ error: 'fecha_programada inválida' })

  const mantenimiento = await Mantenimiento.create({
    equipo: equipo._id,
    fecha,
    tipo,
    tecnico,
    descripcion: observaciones,
    estado: 'programado',
  })

  res.status(201).json({ mantenimiento })
}

export async function registrarRealizado(req, res) {
  const { equipo_id, fecha_realizado, fecha_programada, tipo, tecnico, observaciones, mantenimiento_extra } = req.body

  if (!equipo_id || !fecha_realizado || !tipo || !tecnico || !observaciones) {
    return res.status(400).json({ error: 'equipo_id, fecha_realizado, tipo, tecnico y observaciones son obligatorios' })
  }

  const equipo = await Equipo.findById(equipo_id)
  if (!equipo) return res.status(404).json({ error: 'Equipo no encontrado' })

  const fechaRealizado = new Date(fecha_realizado)
  if (Number.isNaN(fechaRealizado.getTime())) {
    return res.status(400).json({ error: 'fecha_realizado inválida' })
  }
  if (fechaRealizado > HOY_BOGOTA()) {
    return res.status(400).json({ error: 'fecha_realizado no puede ser futura' })
  }

  let fechaProgramada = fechaRealizado
  if (mantenimiento_extra === 'no' && fecha_programada) {
    fechaProgramada = new Date(fecha_programada)
    if (Number.isNaN(fechaProgramada.getTime())) {
      return res.status(400).json({ error: 'fecha_programada inválida' })
    }
    if (fechaProgramada > HOY_BOGOTA()) {
      return res.status(400).json({ error: 'fecha_programada no puede ser futura' })
    }
  }

  const mantenimiento = await Mantenimiento.create({
    equipo: equipo._id,
    fecha: fechaProgramada,
    fecha_realizacion: fechaRealizado,
    tipo,
    tecnico,
    descripcion: observaciones,
    estado: 'finalizado',
  })

  res.status(201).json({ mantenimiento })
}

export async function registrarMantenimiento(req, res) {
  const { equipo_id } = req.params
  const { fecha, tipo, tecnico, descripcion } = req.body

  if (!fecha) return res.status(400).json({ error: 'fecha es obligatoria' })

  const equipo = await Equipo.findById(equipo_id)
  if (!equipo) return res.status(404).json({ error: 'Equipo no encontrado' })

  const fechaParsed = new Date(fecha)
  if (Number.isNaN(fechaParsed.getTime())) return res.status(400).json({ error: 'fecha inválida' })

  const mantenimiento = await Mantenimiento.create({
    equipo: equipo._id,
    fecha: fechaParsed,
    tipo: tipo?.trim() || 'Sin especificar',
    tecnico: tecnico?.trim() || 'Sin especificar',
    descripcion: descripcion?.trim() || 'Informe adjunto en PDF.',
    estado: 'pendiente',
    archivo_pdf: req.file?.filename,
  })

  res.status(201).json({ mantenimiento })
}

export async function editarMantenimiento(req, res) {
  const mantenimiento = await Mantenimiento.findById(req.params.id)
  if (!mantenimiento) return res.status(404).json({ error: 'Mantenimiento no encontrado' })

  const { fecha, tipo, tecnico, descripcion, fecha_realizacion } = req.body

  if (fecha) {
    const f = new Date(fecha)
    if (Number.isNaN(f.getTime())) return res.status(400).json({ error: 'fecha inválida' })
    mantenimiento.fecha = f
  }
  if (tipo !== undefined) mantenimiento.tipo = tipo
  if (tecnico !== undefined) mantenimiento.tecnico = tecnico
  if (descripcion !== undefined) mantenimiento.descripcion = descripcion

  if (fecha_realizacion) {
    const f = new Date(fecha_realizacion)
    if (Number.isNaN(f.getTime())) return res.status(400).json({ error: 'fecha_realizacion inválida' })
    mantenimiento.fecha_realizacion = f
    if (mantenimiento.estado !== 'finalizado') mantenimiento.estado = 'finalizado'
  } else if (fecha_realizacion === '') {
    mantenimiento.fecha_realizacion = null
  }

  await mantenimiento.save()
  res.json({ mantenimiento })
}

export async function finalizarMantenimiento(req, res) {
  const mantenimiento = await Mantenimiento.findById(req.params.id)
  if (!mantenimiento) return res.status(404).json({ error: 'Mantenimiento no encontrado' })

  if (['pendiente', 'programado'].includes(mantenimiento.estado)) {
    mantenimiento.estado = 'finalizado'
    mantenimiento.fecha_realizacion = new Date()
    await mantenimiento.save()
  }

  res.json({ mantenimiento })
}

export async function eliminarMantenimiento(req, res) {
  const mantenimiento = await Mantenimiento.findByIdAndDelete(req.params.id)
  if (!mantenimiento) return res.status(404).json({ error: 'Mantenimiento no encontrado' })
  res.json({ mensaje: 'Mantenimiento eliminado correctamente' })
}

export async function subirPdf(req, res) {
  const { id } = req.params
  if (!req.file) return res.status(400).json({ error: 'Archivo PDF requerido' })

  const mantenimiento = await Mantenimiento.findById(id)
  if (!mantenimiento) {
    return res.status(404).json({ error: 'Mantenimiento no encontrado' })
  }

  mantenimiento.archivo_pdf = req.file.filename
  await mantenimiento.save()

  res.json({ mantenimiento })
}

export async function agregarInforme(req, res) {
  const mantenimiento = await Mantenimiento.findById(req.params.id)
  if (!mantenimiento) return res.status(404).json({ error: 'Mantenimiento no encontrado' })
  if (mantenimiento.estado !== 'finalizado') {
    return res.status(409).json({ error: 'Solo se puede adjuntar informe a mantenimientos finalizados' })
  }
  if (!req.file) return res.status(400).json({ error: 'Archivo PDF requerido' })

  mantenimiento.archivo_pdf = req.file.filename
  await mantenimiento.save()

  res.json({ mantenimiento })
}
