import Dependencia from '../../models/Dependencia.js'
import Cargo from '../../models/Cargo.js'
import Usuario from '../../models/Usuario.js'
import Equipo from '../../models/mantenimiento/Equipo.js'
import { escapeRegex } from '../../utils/regex.js'

// Mismo patrón que modules/mantenimiento/catalogos.controller.js (tipo/marca
// de equipo): un solo controller genérico en vez de repetir CRUD por
// catálogo. `enUso` valida contra los campos String libres que hoy consumen
// estos catálogos (Usuario.dependencia/cargo, Equipo.dependencia) — no son
// ObjectId ref, así que el match es por nombre, no por id.
const MODELOS = { dependencia: Dependencia, cargo: Cargo }

async function enUso(tipo, nombre) {
  if (tipo === 'dependencia') {
    const [usuario, equipo] = await Promise.all([
      Usuario.exists({ dependencia: nombre }),
      Equipo.exists({ dependencia: nombre }),
    ])
    return Boolean(usuario || equipo)
  }
  return Boolean(await Usuario.exists({ cargo: nombre }))
}

export async function obtenerCatalogos(_req, res) {
  const [dependencias, cargos] = await Promise.all([
    Dependencia.find().sort({ nombre: 1 }),
    Cargo.find().sort({ nombre: 1 }),
  ])
  res.json({ dependencias, cargos })
}

export async function agregarCatalogo(req, res) {
  const { tipo, nombre } = req.body

  if (!MODELOS[tipo]) {
    return res.status(400).json({ error: "tipo debe ser 'dependencia' o 'cargo'" })
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
    return res.status(400).json({ error: "tipo debe ser 'dependencia' o 'cargo'" })
  }
  if (!id) {
    return res.status(400).json({ error: 'id es obligatorio' })
  }

  const item = await MODELOS[tipo].findById(id)
  if (!item) return res.status(404).json({ error: 'No encontrado' })

  if (await enUso(tipo, item.nombre)) {
    return res.status(409).json({ error: 'No se puede eliminar: hay registros usando este valor' })
  }

  await MODELOS[tipo].findByIdAndDelete(id)
  const lista = await MODELOS[tipo].find().sort({ nombre: 1 })
  res.json({ success: true, lista })
}
