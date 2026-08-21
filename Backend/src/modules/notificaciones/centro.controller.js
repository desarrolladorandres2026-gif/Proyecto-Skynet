import * as service from './centro.service.js'

// Cada función usa EXCLUSIVAMENTE req.usuario.id_usuario (puesto por
// verificarToken a partir de la cookie de sesión) como dueño de la consulta.
// Nunca se lee un usuarioId de req.query/body/params: aceptar eso permitiría
// que cualquier autenticado consultara o marcara como leída la bandeja de
// otra persona con solo cambiar un parámetro.

export async function misNotificaciones(req, res) {
  const resultado = await service.listarMisNotificaciones(req.usuario.id_usuario, req.query)
  res.json(resultado)
}

export async function contarNoLeidas(req, res) {
  const total = await service.contarNoLeidas(req.usuario.id_usuario)
  res.json({ total })
}

export async function marcarNotificacionLeida(req, res) {
  const notificacion = await service.marcarLeida(req.params.id, req.usuario.id_usuario)
  res.json(notificacion)
}

export async function marcarTodasNotificacionesLeidas(req, res) {
  const { actualizadas } = await service.marcarTodasLeidas(req.usuario.id_usuario)
  res.json({ mensaje: 'Notificaciones marcadas como leídas', actualizadas })
}
