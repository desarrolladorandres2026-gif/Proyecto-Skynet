import { CATEGORIAS_NOTIFICACION } from '../notificaciones/notificaciones.catalogo.js'
import * as service from './ia.service.js'

export function listarCategorias(_req, res) {
  res.json({ categorias: CATEGORIAS_NOTIFICACION })
}

export async function listarAvisosPendientes(req, res) {
  const avisos = await service.listarPendientes(req.usuario.id_usuario)
  res.json({ avisos })
}

export async function marcarAvisosLeidos(req, res) {
  await service.marcarLeidos(req.usuario.id_usuario, req.body.ids)
  res.json({ ok: true })
}

export async function obtenerPreferencias(req, res) {
  const preferencias = await service.obtenerPreferencias(req.usuario.id_usuario)
  res.json(preferencias)
}

export async function actualizarPreferencias(req, res) {
  const preferencias = await service.actualizarPreferencias(req.usuario.id_usuario, req.body)
  res.json(preferencias)
}

export async function obtenerConfiguracionGlobal(_req, res) {
  const configuracion = await service.obtenerConfiguracionGlobal()
  res.json(configuracion)
}

export async function actualizarConfiguracionGlobal(req, res) {
  const configuracion = await service.actualizarConfiguracionGlobal(req.body, req.usuario)
  res.json(configuracion)
}
