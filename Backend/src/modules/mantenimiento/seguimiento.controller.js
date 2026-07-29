import { obtenerSeguimientoTecnicos } from './seguimiento.service.js'

export async function seguimiento(req, res) {
  const tecnicos = await obtenerSeguimientoTecnicos(req.usuario)
  res.json({ tecnicos })
}
