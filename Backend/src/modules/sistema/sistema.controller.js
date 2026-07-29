import * as service from './sistema.service.js'
import { validarCambiarEstadoDTO } from './sistema.dto.js'

export async function listarModulos(_req, res) {
  const modulos = await service.listarModulos()
  res.json({ modulos })
}

export async function cambiarEstadoModulo(req, res) {
  const { activo } = validarCambiarEstadoDTO(req.body)
  const modulo = await service.cambiarEstadoModulo(req.params.key, activo, req.usuario)
  res.json({ modulo })
}
