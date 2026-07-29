import BitacoraEntrada from '../../models/mantenimiento/BitacoraEntrada.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { ESTADOS_ACTIVOS, obtenerOT, requiereSerParticipante } from './comun.js'

const TIPOS = ['observacion', 'incidente', 'llamada', 'visita_externa', 'prueba', 'resultado', 'nota']

// Bitácora Operativa (Work Log, Fase 3.1): append-only por diseño — nunca se
// edita ni se borra una entrada; una corrección se registra como entrada
// nueva. Aquí el registro ES la auditoría, no hay un paso adicional.
export async function agregarEntrada(otId, { tipo, texto, etiquetas }, archivo, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (!ESTADOS_ACTIVOS.includes(ot.estado)) {
    throw new ErrorConflicto(`No se pueden agregar entradas de bitácora a una orden en estado "${ot.estado}"`)
  }
  requiereSerParticipante(ot, usuarioActor)
  if (!texto?.trim() && !archivo) throw new ErrorValidacion('La entrada debe tener texto o un adjunto')

  const etiquetasLimpias = Array.isArray(etiquetas)
    ? etiquetas.map((e) => e.trim()).filter(Boolean)
    : (etiquetas || '').split(',').map((e) => e.trim()).filter(Boolean)

  return BitacoraEntrada.create({
    ordenTrabajo: ot._id,
    tipo: TIPOS.includes(tipo) ? tipo : 'nota',
    texto: texto?.trim(),
    adjunto: archivo?.filename,
    etiquetas: etiquetasLimpias,
    usuario: usuarioActor.id_usuario,
    usuarioNombre: usuarioActor.nombre_usuario,
  })
}

export async function listarDeOrden(otId, { q, usuarioId, desde, hasta }, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  const puedeVerTodas = usuarioActor.esSuperAdmin || usuarioActor.permisos?.has('mantenimiento:ver_todas')
  if (!puedeVerTodas) requiereSerParticipante(ot, usuarioActor)

  const filtro = { ordenTrabajo: ot._id }
  if (usuarioId) filtro.usuario = usuarioId
  if (desde || hasta) {
    filtro.creado_en = {}
    if (desde) filtro.creado_en.$gte = new Date(desde)
    if (hasta) filtro.creado_en.$lte = new Date(hasta)
  }
  if (q?.trim()) filtro.$text = { $search: q.trim() }

  return BitacoraEntrada.find(filtro).sort({ creado_en: -1 })
}
