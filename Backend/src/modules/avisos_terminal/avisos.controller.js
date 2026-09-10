import {
  crearYTransmitirAviso,
  listarOpcionesDestinatarios,
  buscarUsuariosDestino,
  listarHistorial,
  obtenerDetalle,
  listarPendientes,
  listarMisAvisos,
  actualizarEstadoEntrega,
  obtenerAudioParaUsuario,
  probarVozInstitucional,
} from './avisos.service.js'
import { ErrorValidacion } from '../../utils/errores.js'

function parsearPaginacion(query) {
  return {
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(50, Math.max(1, Number(query.limit) || 20)),
  }
}

export async function transmitirAviso(req, res) {
  const { texto, destinatarios, voz } = req.body || {}
  if (!destinatarios || typeof destinatarios !== 'object') {
    throw new ErrorValidacion('Debes indicar el destinatario del aviso')
  }

  const { aviso, totalDestinatarios, audioGenerado } = await crearYTransmitirAviso({
    texto,
    destinatarios,
    voz,
    admin: req.usuario,
  })

  res.status(201).json({ aviso, totalDestinatarios, audioGenerado })
}

// Sirve el WAV institucional de un aviso ya transmitido. select:false en el
// modelo (ver AvisoTerminal.js) mantiene este Buffer fuera de cualquier
// listado — solo se trae acá, y solo para quien tiene acceso (propia entrega
// o permiso de transmitir/ver_historial, ver obtenerAudioParaUsuario()).
export async function obtenerAudioAviso(req, res) {
  const resultado = await obtenerAudioParaUsuario(req.params.id, req.usuario)
  if (!resultado) return res.status(404).end()
  res.set('Content-Type', resultado.mimeType)
  // Privado (no un CDN/proxy compartido) y estable una vez generado: el
  // audio de un aviso ya transmitido nunca cambia.
  res.set('Cache-Control', 'private, max-age=86400, immutable')
  res.send(resultado.data)
}

// "Probar voz" del panel de Transmitir: genera una muestra y la devuelve tal
// cual, sin guardar nada — no existe un AvisoTerminal todavía en este punto.
export async function probarVoz(req, res) {
  const { texto, voz } = req.body || {}
  const audio = await probarVozInstitucional(texto, voz)
  res.set('Content-Type', audio.mimeType)
  res.send(audio.data)
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
