import mongoose from 'mongoose'

// Helpers del scoping multi-tenant (rol con ambito:'empresa', ver
// middleware/permisos.js#cargarScopeEmpresa). El Service/controller NUNCA
// confía en el empresaId que venga del cliente: si el usuario está scoped,
// su empresa se fuerza en el servidor.

// Mezcla el filtro de empresa del scope en una consulta de lectura.
export function filtroScoped(req, filtro = {}) {
  if (req.scope?.empresaId) return { ...filtro, empresa: req.scope.empresaId }
  return filtro
}

// Resuelve la empresa efectiva de una escritura: la del scope si está
// scoped; si no (admin/global), la que venga en el body.
export function empresaEfectiva(req, empresaBody) {
  if (req.scope?.empresaId) return req.scope.empresaId.toString()
  return empresaBody
}

// Un usuario scoped solo puede tocar documentos de su empresa.
export function perteneceAlScope(req, doc) {
  if (!req.scope?.empresaId) return true
  const empresaDoc = doc.empresa?._id || doc.empresa
  return empresaDoc?.toString() === req.scope.empresaId.toString()
}

export function esIdValido(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)
}
