import { calcularResumen } from './dashboard.service.js'

// Dashboard único para todos los roles: cada tarjeta se calcula SOLO si el
// usuario tiene el permiso correspondiente Y el módulo está activo (ver
// dashboard.service.js#calcularResumen). Así un rol nuevo con otra mezcla de
// permisos obtiene su dashboard sin tocar este código, y una tarjeta
// desactivada se excluye automáticamente.
export async function resumenDashboard(req, res) {
  const resumen = await calcularResumen(req.usuario)
  res.json(resumen)
}
