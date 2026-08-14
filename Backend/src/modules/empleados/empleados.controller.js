import * as service from './empleados.service.js'

export async function listar(req, res) {
  const empleados = await service.listarEmpleados({ estado: req.query.estado })
  res.json({ empleados })
}

export async function usuariosDisponibles(_req, res) {
  const usuarios = await service.listarUsuariosDisponibles()
  res.json({ usuarios })
}

export async function obtener(req, res) {
  const empleado = await service.obtenerEmpleado(req.params.id)
  res.json({ empleado })
}

export async function crear(req, res) {
  const empleado = await service.crearEmpleado(req.body, req.usuario)
  res.status(201).json({ empleado })
}

export async function actualizar(req, res) {
  const empleado = await service.actualizarEmpleado(req.params.id, req.body, req.usuario)
  res.json({ empleado })
}

export async function desvincular(req, res) {
  const empleado = await service.desvincularEmpleado(req.params.id, req.body?.motivo, req.usuario)
  res.json({ empleado })
}

export async function reactivar(req, res) {
  const empleado = await service.reactivarEmpleado(req.params.id, req.usuario)
  res.json({ empleado })
}
