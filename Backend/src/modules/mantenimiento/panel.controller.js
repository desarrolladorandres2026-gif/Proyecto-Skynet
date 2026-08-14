import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import Equipo from '../../models/mantenimiento/Equipo.js'
import { actualizarEstadosVencidos } from './mantenimientos.controller.js'
import { hoy as inicioDeHoy } from '../../utils/fechas.js'

export async function obtenerPanel(_req, res) {
  await actualizarEstadosVencidos()

  // `new Date(); setHours(0,0,0,0)` ancla a medianoche de la zona del
  // PROCESO: en el VPS (UTC) eso es 5 horas antes de la medianoche real de
  // Neiva, así que un mantenimiento programado para hoy antes de esa hora ya
  // podía verse excluido de "los próximos 7 días". inicioDeHoy() (alias de
  // hoy() en utils/fechas.js) ancla siempre al Terminal.
  const hoy = inicioDeHoy()
  const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [total_pendientes, total_finalizados, total_equipos, total_programados, mantenimientos_proximos] =
    await Promise.all([
      Mantenimiento.countDocuments({ estado: 'pendiente' }),
      Mantenimiento.countDocuments({ estado: 'finalizado' }),
      Equipo.countDocuments(),
      Mantenimiento.countDocuments({ estado: 'programado' }),
      Mantenimiento.find({ estado: 'programado', fecha: { $gte: hoy, $lte: en7dias } })
        .populate('equipo')
        .sort({ fecha: 1 })
        .limit(10),
    ])

  res.json({
    total_pendientes,
    total_finalizados,
    total_equipos,
    total_programados,
    mantenimientos_proximos,
  })
}
