import {
  crearYTransmitirAviso,
  listarOpcionesDestinatarios,
  buscarUsuariosDestino,
  listarHistorial,
  obtenerDetalle,
  listarPendientes,
  listarMisAvisos,
  actualizarEstadoEntrega,
} from './avisos.service.js'
import { ErrorValidacion } from '../../utils/errores.js'

function parsearPaginacion(query) {
  return {
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(50, Math.max(1, Number(query.limit) || 20)),
  }
}

export async function transmitirAviso(req, res) {
  const { texto, destinatarios } = req.body || {}
  if (!destinatarios || typeof destinatarios !== 'object') {
    throw new ErrorValidacion('Debes indicar el destinatario del aviso')
  }

  const { aviso, totalDestinatarios } = await crearYTransmitirAviso({
    texto,
    destinatarios,
    admin: req.usuario,
  })

  res.status(201).json({ aviso, totalDestinatarios })
}

export async function obtenerOpcionesDestinatarios(req, res) {
  res.json(await listarOpcionesDestinatarios())
}

export async function buscarUsuarios(req, res) {
  const usuarios = await buscarUsuariosDestino(req.query.q)
  res.json({ usuarios })
}

export async function obtenerHistorial(req, res) {
  res.json(await listarHistorial(parsearPaginacion(req.query)))
}

export async function obtenerAvisoDetalle(req, res) {
  res.json(await obtenerDetalle(req.params.id))
}

export async function obtenerPendientes(req, res) {
  const entregas = await listarPendientes(req.usuario.id_usuario)
  res.json({ entregas })
}

export async function obtenerMisAvisos(req, res) {
  res.json(await listarMisAvisos(req.usuario.id_usuario, parsearPaginacion(req.query)))
}

export async function confirmarEstadoEntrega(req, res) {
  const { estado } = req.body || {}
  const entrega = await actualizarEstadoEntrega(req.params.id, req.usuario.id_usuario, estado)
  res.json({ entrega })
}
