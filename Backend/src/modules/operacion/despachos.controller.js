import Despacho from '../../models/Despacho.js'
import Vehiculo from '../../models/Vehiculo.js'
import Conductor from '../../models/Conductor.js'
import Ruta from '../../models/Ruta.js'
import Plataforma from '../../models/Plataforma.js'
import { filtroScoped, esIdValido } from '../../utils/scope.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

const POPULATES = [
  { path: 'empresa', select: 'nombre' },
  { path: 'vehiculo', select: 'placa tipo capacidad' },
  { path: 'conductor', select: 'nombre cedula' },
  { path: 'ruta', select: 'origen destino' },
  { path: 'plataforma', select: 'numero' },
  { path: 'registradoPor', select: 'nombre' },
]

// D-20260727-001, contando los despachos del día (suficiente para el volumen
// de un terminal; una colisión por concurrencia extrema la atrapa el índice
// unique y el asyncHandler la reporta como error controlado).
async function siguienteConsecutivo(inicioDia, finDia) {
  const hoyCount = await Despacho.countDocuments({ createdAt: { $gte: inicioDia, $lte: finDia } })
  const fecha = inicioDia.toISOString().slice(0, 10).replaceAll('-', '')
  return `D-${fecha}-${String(hoyCount + 1).padStart(3, '0')}`
}

function rangoDia(fechaStr) {
  const base = fechaStr ? new Date(fechaStr) : new Date()
  if (Number.isNaN(base.getTime())) return null
  const inicio = new Date(base)
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date(base)
  fin.setHours(23, 59, 59, 999)
  return { inicio, fin }
}

// ?fecha=YYYY-MM-DD (por defecto hoy) · ?estado=... · scoped por empresa.
export async function listarDespachos(req, res) {
  const rango = rangoDia(req.query.fecha)
  if (!rango) return res.status(400).json({ error: 'fecha inválida' })

  const filtro = filtroScoped(req, { horaSalida: { $gte: rango.inicio, $lte: rango.fin } })
  if (req.query.estado) filtro.estado = req.query.estado

  const despachos = await Despacho.find(filtro).populate(POPULATES).sort({ horaSalida: -1 })
  res.json({ despachos })
}

// Registrar salida = crear el despacho. Valida el "checklist" operativo
// completo antes de dejar salir el vehículo.
export async function registrarSalida(req, res) {
  const { vehiculo: vehiculoId, conductor: conductorId, ruta: rutaId, plataforma: plataformaId, pasajeros } = req.body

  for (const [campo, valor] of [['vehiculo', vehiculoId], ['conductor', conductorId], ['ruta', rutaId]]) {
    if (!esIdValido(valor)) return res.status(400).json({ error: `${campo} es obligatorio` })
  }

  const [vehiculo, conductor, ruta] = await Promise.all([
    Vehiculo.findById(vehiculoId),
    Conductor.findById(conductorId),
    Ruta.findById(rutaId),
  ])
  if (!vehiculo) return res.status(400).json({ error: 'El vehículo no existe' })
  if (!conductor) return res.status(400).json({ error: 'El conductor no existe' })
  if (!ruta || ruta.estado !== 'activa') return res.status(400).json({ error: 'La ruta no existe o está inactiva' })

  // Checklist de despacho: estado, misma empresa y documentos vigentes.
  const ahora = new Date()
  if (vehiculo.estado !== 'activo') {
    return res.status(409).json({ error: `El vehículo ${vehiculo.placa} está en estado "${vehiculo.estado}"` })
  }
  if (conductor.estado !== 'activo') {
    return res.status(409).json({ error: `El conductor ${conductor.nombre} está inactivo` })
  }
  if (vehiculo.empresa.toString() !== conductor.empresa.toString()) {
    return res.status(409).json({ error: 'El vehículo y el conductor pertenecen a empresas distintas' })
  }
  if (vehiculo.soatVence && vehiculo.soatVence < ahora) {
    return res.status(409).json({ error: `El SOAT de ${vehiculo.placa} está vencido` })
  }
  if (vehiculo.tecnomecanicaVence && vehiculo.tecnomecanicaVence < ahora) {
    return res.status(409).json({ error: `La tecnomecánica de ${vehiculo.placa} está vencida` })
  }
  if (conductor.licencia?.vence && conductor.licencia.vence < ahora) {
    return res.status(409).json({ error: `La licencia de ${conductor.nombre} está vencida` })
  }
  if (pasajeros !== undefined && pasajeros > vehiculo.capacidad) {
    return res.status(409).json({ error: `Pasajeros (${pasajeros}) supera la capacidad del vehículo (${vehiculo.capacidad})` })
  }

  const enViaje = await Despacho.findOne({ vehiculo: vehiculoId, estado: { $in: ['despachado', 'retrasado'] } })
  if (enViaje) {
    return res.status(409).json({ error: `El vehículo ${vehiculo.placa} ya está en viaje (${enViaje.consecutivo})` })
  }

  let plataforma = null
  if (plataformaId) {
    if (!esIdValido(plataformaId)) return res.status(400).json({ error: 'Plataforma inválida' })
    plataforma = await Plataforma.findById(plataformaId)
    if (!plataforma) return res.status(400).json({ error: 'La plataforma no existe' })
  }

  const rango = rangoDia()
  const consecutivo = await siguienteConsecutivo(rango.inicio, rango.fin)

  const despacho = await Despacho.create({
    consecutivo,
    empresa: vehiculo.empresa,
    vehiculo: vehiculoId,
    conductor: conductorId,
    ruta: rutaId,
    plataforma: plataformaId || null,
    pasajeros: pasajeros || 0,
    horaSalida: ahora,
    registradoPor: req.usuario.id_usuario,
  })

  // El vehículo salió: si estaba acoderado en la plataforma indicada, se libera.
  if (plataforma && plataforma.vehiculoActual?.toString() === vehiculoId) {
    plataforma.estado = 'libre'
    plataforma.vehiculoActual = null
    await plataforma.save()
  }

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'crear',
    modulo: 'despachos',
    entidad: 'Despacho',
    entidadId: despacho._id,
    descripcion: `Salida ${consecutivo}: ${vehiculo.placa} → ${ruta.destino}`,
  })

  await despacho.populate(POPULATES)
  res.status(201).json({ despacho })
}

export async function registrarLlegada(req, res) {
  const despacho = await Despacho.findById(req.params.id)
  if (!despacho) return res.status(404).json({ error: 'Despacho no encontrado' })
  if (!['despachado', 'retrasado'].includes(despacho.estado)) {
    return res.status(409).json({ error: `El despacho ya está ${despacho.estado}` })
  }

  despacho.estado = 'finalizado'
  despacho.horaLlegada = new Date()
  await despacho.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'despachos',
    entidad: 'Despacho',
    entidadId: despacho._id,
    descripcion: `Llegada registrada: ${despacho.consecutivo}`,
  })

  await despacho.populate(POPULATES)
  res.json({ despacho })
}

export async function registrarRetraso(req, res) {
  const { minutos, motivo } = req.body
  if (!Number.isInteger(minutos) || minutos < 1) {
    return res.status(400).json({ error: 'minutos debe ser un entero positivo' })
  }
  if (!motivo?.trim()) return res.status(400).json({ error: 'El motivo es obligatorio' })

  const despacho = await Despacho.findById(req.params.id)
  if (!despacho) return res.status(404).json({ error: 'Despacho no encontrado' })
  if (despacho.estado === 'finalizado' || despacho.estado === 'anulado') {
    return res.status(409).json({ error: `El despacho ya está ${despacho.estado}` })
  }

  despacho.estado = 'retrasado'
  despacho.retraso = { minutos, motivo: motivo.trim() }
  await despacho.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'despachos',
    entidad: 'Despacho',
    entidadId: despacho._id,
    descripcion: `Retraso ${despacho.consecutivo}: ${minutos} min (${motivo.trim()})`,
  })

  await despacho.populate(POPULATES)
  res.json({ despacho })
}
