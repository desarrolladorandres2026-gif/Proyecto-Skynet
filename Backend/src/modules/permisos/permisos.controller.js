import * as service from './permisos.service.js'

export async function listarPermisos(_req, res) {
  const modulos = await service.listarPermisosAgrupados()
  res.json({ modulos })
}
