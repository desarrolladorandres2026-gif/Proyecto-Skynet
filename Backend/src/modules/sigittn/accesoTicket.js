// Antes de la migración a RBAC dinámico, Usuario.rol era el string 'admin' y
// esta comparación bastaba. Ahora req.usuario.rol es un objeto
// ({id,nombre,slug,ambito}, ver middleware/auth.js) y esa comparación nunca
// es cierta — nadie, ni el Super Admin, obtenía el bypass. El "personal de
// TI" real sigue siendo quien tiene el flag legado Usuario.modulos.sigittn
// (el mismo que exige requireModulo('sigittn') para entrar al módulo
// completo): cualquiera con ese flag ya es alguien de confianza y debe ver
// todos los tickets, no solo los suyos.
export function esStaffSigittn(usuario) {
  return Boolean(usuario.esSuperAdmin || usuario.modulos?.includes('sigittn'))
}

// ticket.usuario_creador/usuario_asignado llegan como ObjectId sin populate
// (String(objectId) ya es el hex) pero como documento completo {_id, ...}
// cuando el caller sí populate (p. ej. obtenerTicket) — comparar
// String(ticket.usuario_creador) directo contra el populado nunca matcheaba
// (bug preexistente: quien creaba un ticket no podía ni ver el suyo propio).
function idDe(campo) {
  if (!campo) return null
  return String(campo._id ?? campo)
}

export function tieneAcceso(ticket, usuario) {
  if (esStaffSigittn(usuario)) return true
  const idUsuario = String(usuario.id_usuario)
  return idDe(ticket.usuario_creador) === idUsuario || idDe(ticket.usuario_asignado) === idUsuario
}
