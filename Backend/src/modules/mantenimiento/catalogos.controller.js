import TipoEquipo from '../../models/mantenimiento/TipoEquipo.js'
import Marca from '../../models/mantenimiento/Marca.js'
import Equipo from '../../models/mantenimiento/Equipo.js'
import { escapeRegex } from '../../utils/regex.js'

const MODELOS = { tipo: TipoEquipo, marca: Marca }
const CAMPO_EQUIPO = { tipo: 'tipo.id', marca: 'marca.id' }

export async function obtenerCatalogos(_req, res) {
  const [tipos, marcas] = await Promise.all([
    TipoEquipo.find().sort({ nombre: 1 }),
    Marca.find().sort({ nombre: 1 }),
  ])
  res.json({ tipos, marcas })
}

export async function agregarCatalogo(req, res) {
  const { tipo, nombre } = req.body

  if (!MODELOS[tipo]) {
    return res.status(400).json({ error: "tipo debe ser 'tipo' o 'marca'" })
  }
  if (!nombre?.trim()) {
    return res.status(400).json({ error: 'nombre es obligatorio' })
  }

  const Modelo = MODELOS[tipo]
  const nombreLimpio = nombre.trim()

  const item = await Modelo.findOneAndUpdate(
    { nombre: { $regex: `^${escapeRegex(nombreLimpio)}$`, $options: 'i' } },
    { $setOnInsert: { nombre: nombreLimpio } },
    { upsert: true, new: true }
  )

  const lista = await Modelo.find().sort({ nombre: 1 })
  res.json({ success: true, item, lista })
}

export async function eliminarCatalogo(req, res) {
  const { tipo, id } = req.body

  if (!MODELOS[tipo]) {
    return res.status(400).json({ error: "tipo debe ser 'tipo' o 'marca'" })
  }
  if (!id) {
    return res.status(400).json({ error: 'id es obligatorio' })
  }

  const enUso = await Equipo.exists({ [CAMPO_EQUIPO[tipo]]: id })
  if (enUso) {
    return res.status(409).json({ error: 'No se puede eliminar: hay equipos usando este valor' })
  }

  await MODELOS[tipo].findByIdAndDelete(id)
  const lista = await MODELOS[tipo].find().sort({ nombre: 1 })
  res.json({ success: true, lista })
}
