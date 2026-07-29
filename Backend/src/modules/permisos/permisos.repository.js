import Permiso from '../../models/Permiso.js'

export function listar() {
  return Permiso.find().sort({ modulo: 1, accion: 1 })
}
