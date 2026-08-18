import Dependencia from '../../models/Dependencia.js'
import Cargo from '../../models/Cargo.js'
import Usuario from '../../models/Usuario.js'
import Equipo from '../../models/mantenimiento/Equipo.js'
import { escapeRegex } from '../../utils/regex.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

// Mismo patrón que modules/mantenimiento/catalogos.controller.js (tipo/marca
// de equipo): un solo controller genérico en vez de repetir CRUD por
// catálogo. `enUso` valida contra los campos String libres que hoy consumen
// estos catálogos (Usuario.dependencia/cargo, Equipo.dependencia) — no son
// ObjectId ref, así que el match es por nombre, no por id. También revisa las
// referencias reales por ObjectId (Cargo.dependencia, Dependencia.padre)
// antes de dejar borrar un valor.
const MODELOS = { dependencia: Dependencia, cargo: Cargo }

async function enUso(tipo, item) {
  if (tipo === 'dependencia') {
    const [usuarioLegado, equipoLegado, hijas, cargosAsociados] = await Promise.all([
      Usuario.exists({ dependencia: item.nombre }),
      Equipo.exists({ dependencia: item.nombre }),
      Dependencia.exists({ padre: item._id }),
      Cargo.exists({ dependencia: item._id }),
    ])
    return Boolean(usuarioLegado || equipoLegado || hijas || cargosAsociados)
  }
  const usuarioLegado = await Usuario.exists({ cargo: item.nombre })
  return Boolean(usuarioLegado)
}

// Camina la cadena de `padre` desde `padreId` hacia la raíz: si en algún
// punto llega a `dependenciaId`, asignarlo crearía un ciclo (una dependencia
// no puede ser ancestro de sí misma). Cota de 50 saltos como cinturón de
// seguridad — el catálogo real nunca tendrá una jerarquía tan profunda, y
// evita un bucle infinito si algún dato ya inconsistente tuviera un ciclo.
async function creariaCiclo(dependenciaId, padreId) {
  if (!padreId) return false
  if (String(padreId) === String(dependenciaId)) return true

  let actualId = padreId
  for (let saltos = 0; saltos < 50; saltos++) {
    const actual = await Dependencia.findById(actualId).select('padre')
    if (!actual?.padre) return false
    if (String(actual.padre) === String(dependenciaId)) return true
    actualId = actual.padre
  }
  return true
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

  if (await enUso(tipo, item)) {
    return res.status(409).json({ error: 'No se puede eliminar: hay registros usando este valor' })
  }

  await MODELOS[tipo].findByIdAndDelete(id)
  const lista = await MODELOS[tipo].find().sort({ nombre: 1 })
  res.json({ success: true, lista })
}

// Jerarquía organizacional — separado de agregar/eliminar porque edita
// campos distintos a `nombre` y tiene sus propias reglas (ciclos).
// agregarCatalogo se deja tal cual para no romper los formularios que solo
// necesitan "un valor más en la lista" (Usuarios, Requerimientos, Equipos).
export async function actualizarDependencia(req, res) {
  const { id } = req.params
  const { padre } = req.body

  const dependencia = await Dependencia.findById(id)
  if (!dependencia) return res.status(404).json({ error: 'Dependencia no encontrada' })

  if (padre !== undefined && padre !== null && padre !== '') {
    if (!(await Dependencia.exists({ _id: padre }))) {
      return res.status(400).json({ error: 'La dependencia padre indicada no existe' })
    }
    if (await creariaCiclo(id, padre)) {
      return res.status(409).json({ error: 'Esa dependencia crearía un ciclo en la jerarquía' })
    }
  }

  const antes = dependencia.toObject()
  if (padre !== undefined) dependencia.padre = padre || null
  await dependencia.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'catalogos',
    entidad: 'Dependencia',
    entidadId: dependencia._id,
    descripcion: `Estructura actualizada: ${dependencia.nombre}`,
    cambios: { antes, despues: dependencia.toObject() },
  })

  const item = await Dependencia.findById(id)
  const lista = await Dependencia.find().sort({ nombre: 1 })
  res.json({ success: true, item, lista })
}

export async function actualizarCargo(req, res) {
  const { id } = req.params
  const { dependencia } = req.body

  const cargo = await Cargo.findById(id)
  if (!cargo) return res.status(404).json({ error: 'Cargo no encontrado' })

  if (dependencia !== undefined && dependencia !== null && dependencia !== '') {
    if (!(await Dependencia.exists({ _id: dependencia }))) {
      return res.status(400).json({ error: 'La dependencia indicada no existe' })
    }
  }

  const antes = cargo.toObject()
  if (dependencia !== undefined) cargo.dependencia = dependencia || null
  await cargo.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'catalogos',
    entidad: 'Cargo',
    entidadId: cargo._id,
    descripcion: `Dependencia por defecto actualizada: ${cargo.nombre}`,
    cambios: { antes, despues: cargo.toObject() },
  })

  const lista = await Cargo.find().sort({ nombre: 1 })
  res.json({ success: true, item: cargo, lista })
}
