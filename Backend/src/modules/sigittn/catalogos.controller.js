import { Dependencia, ModuloOrigen, NivelUrgencia } from '../../models/sigittn/Catalogos.js'
import Usuario from '../../models/Usuario.js'

const ESTADOS_TICKET = ['Nuevo', 'Asignado', 'En progreso', 'Resuelto', 'Cerrado']

export async function obtenerCatalogos(_req, res) {
  const [dependencias, modulos_origen, niveles_urgencia, usuarios] = await Promise.all([
    Dependencia.find().sort({ nombre: 1 }),
    ModuloOrigen.find().sort({ nombre: 1 }),
    NivelUrgencia.find().sort({ nombre: 1 }),
    Usuario.find({ estado: 'activo', modulos: 'sigittn' }).select('nombre_usuario nombre dependencia rol'),
  ])

  res.json({
    dependencias,
    modulos_origen,
    niveles_urgencia,
    estados_ticket: ESTADOS_TICKET,
    usuarios,
  })
}
