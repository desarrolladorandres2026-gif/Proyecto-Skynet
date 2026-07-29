import ObjetoPerdido from '../../models/ObjetoPerdido.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

const POPULATES = [
  { path: 'registradoPor', select: 'nombre' },
  { path: 'entrega.por', select: 'nombre' },
]

export async function listarObjetos(req, res) {
  const filtro = {}
  if (req.query.estado) filtro.estado = req.query.estado
  const objetos = await ObjetoPerdido.find(filtro).populate(POPULATES).sort({ fechaHallazgo: -1 })
  res.json({ objetos })
}

export async function registrarObjeto(req, res) {
  const { descripcion, lugarHallazgo, fechaHallazgo } = req.body
  if (!descripcion?.trim() || !lugarHallazgo?.trim()) {
    return res.status(400).json({ error: 'descripcion y lugarHallazgo son obligatorios' })
  }
  const fecha = fechaHallazgo ? new Date(fechaHallazgo) : new Date()
  if (Number.isNaN(fecha.getTime())) return res.status(400).json({ error: 'fechaHallazgo inválida' })

  const objeto = await ObjetoPerdido.create({
    descripcion: descripcion.trim(),
    lugarHallazgo: lugarHallazgo.trim(),
    fechaHallazgo: fecha,
    registradoPor: req.usuario.id_usuario,
  })

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'crear',
    modulo: 'objetos_perdidos',
    entidad: 'ObjetoPerdido',
    entidadId: objeto._id,
    descripcion: `Objeto en custodia: ${objeto.descripcion.slice(0, 80)}`,
  })

  await objeto.populate(POPULATES)
  res.status(201).json({ objeto })
}

// Entrega al dueño: exige identificar a quién se le devuelve (trazabilidad).
export async function entregarObjeto(req, res) {
  const { nombre, cedula, telefono } = req.body
  if (!nombre?.trim() || !cedula?.trim()) {
    return res.status(400).json({ error: 'nombre y cedula de quien recibe son obligatorios' })
  }

  const objeto = await ObjetoPerdido.findById(req.params.id)
  if (!objeto) return res.status(404).json({ error: 'Objeto no encontrado' })
  if (objeto.estado === 'entregado') return res.status(409).json({ error: 'El objeto ya fue entregado' })

  objeto.estado = 'entregado'
  objeto.entrega = {
    nombre: nombre.trim(),
    cedula: cedula.trim(),
    telefono: telefono?.trim(),
    fecha: new Date(),
    por: req.usuario.id_usuario,
  }
  await objeto.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'objetos_perdidos',
    entidad: 'ObjetoPerdido',
    entidadId: objeto._id,
    descripcion: `Objeto entregado a ${nombre.trim()} (CC ${cedula.trim()})`,
  })

  await objeto.populate(POPULATES)
  res.json({ objeto })
}
