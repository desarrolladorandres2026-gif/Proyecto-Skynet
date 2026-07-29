import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import Equipo from '../../models/mantenimiento/Equipo.js'
import { actualizarEstadosVencidos } from './mantenimientos.controller.js'

export async function obtenerPanel(_req, res) {
  await actualizarEstadosVencidos()

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const en7dias = new Date(hoy)
  en7dias.setDate(en7dias.getDate() + 7)

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
