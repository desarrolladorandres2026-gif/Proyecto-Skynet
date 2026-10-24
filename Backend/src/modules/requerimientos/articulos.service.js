import Articulo from '../../models/Articulo.js'
import { ErrorNoEncontrado, ErrorValidacion } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { buscar, normalizar } from './articulos.busqueda.js'

const CAMPOS_LISTA = 'nombre nombreNormalizado grupo existencia alias aliasNormalizados presentaciones activo existenciaActualizada'

function auditarCatalogo(usuarioActor, accion, descripcion, cambios, entidadId) {
  return registrarAuditoria({
    usuario: usuarioActor,
    accion,
    modulo: 'requerimientos',
    entidad: 'Articulo',
    entidadId,
    descripcion,
    cambios,
  })
}

// Catálogo completo en memoria (~600 filas). Lo usan la búsqueda difusa y el
// consolidado; leerlo entero es más barato que cualquier índice de texto.
export function cargarCatalogoActivo() {
  return Articulo.find({ activo: true }).select(CAMPOS_LISTA).lean()
}

// Vista pública para el autocompletar del formulario: cualquier solicitante la
// usa, así que NO expone la existencia (es dato de Bodega).
function paraSolicitante(a) {
  return { _id: a._id, nombre: a.nombre, grupo: a.grupo, presentaciones: a.presentaciones || [] }
}

export async function buscarParaSolicitante(q) {
  const catalogo = await cargarCatalogoActivo()
  return buscar(q, catalogo, { limite: 8 }).map((r) => paraSolicitante(r.articulo))
}

// Listado de gestión (Bodega): incluye inactivos y existencia, con filtro simple.
export async function listarCatalogo({ q, grupo } = {}) {
  const filtro = grupo ? { grupo } : {}
  const todos = await Articulo.find(filtro).select(CAMPOS_LISTA).sort({ grupo: 1, nombre: 1 }).lean()
  const grupos = await Articulo.distinct('grupo')
  const articulos = q ? buscar(q, todos, { limite: 100, minimo: 0.5 }).map((r) => r.articulo) : todos
  return { articulos, grupos: grupos.filter(Boolean).sort() }
}

// ── Importar el export de Elisa ───────────────────────────────────────────
// Formato (texto con columnas fijas, tal cual lo entrega Elisa):
//                                                 EXISTENCIAS  COSTOS
//   ARTÍCULO                       NOMBRE DEL GRUPO  FINAL
//   ESCOBA                         ASEO              20
// La columna del grupo se ubica por el encabezado y no por 2+ espacios, porque
// hay nombres con doble espacio interno ("TENI DAMA  TALLA 41").
export function parsearExportElisa(texto) {
  const lineas = String(texto ?? '').split(/\r?\n/)
  const encabezado = lineas.find((l) => l.includes('NOMBRE DEL GRUPO'))
  const colGrupo = encabezado ? encabezado.indexOf('NOMBRE DEL GRUPO') : 42
  const filas = []
  for (const linea of lineas) {
    if (!linea.trim() || linea === encabezado) continue
    const nombre = linea.slice(0, colGrupo).replace(/\s+/g, ' ').trim()
    if (!nombre) continue // rótulo "EXISTENCIAS COSTOS" y fila de total: sin artículo
    const resto = linea.slice(colGrupo).trim()
    const m = resto.match(/^(.*?)\s+(-?[\d,]+(?:\.\d+)?)$/)
    if (!m) continue
    const existencia = Number(m[2].replace(/,/g, ''))
    if (!Number.isFinite(existencia)) continue
    filas.push({ nombre, grupo: m[1].trim(), existencia })
  }
  return filas
}

export async function importarExistencias(texto, usuarioActor) {
  const filas = parsearExportElisa(texto)
  if (filas.length === 0) {
    throw new ErrorValidacion('No se encontró ningún artículo en el archivo. Sube el export de Elisa (Consulta.txt).')
  }

  // Elisa repite nombres (p. ej. dos filas "VENTILADOR AIR PRO"): son el mismo
  // artículo para quien lo pide, así que se suman en vez de pisarse.
  const porClave = new Map()
  let duplicadosSumados = 0
  for (const fila of filas) {
    const clave = normalizar(fila.nombre)
    if (!clave) continue
    const previa = porClave.get(clave)
    if (previa) {
      previa.existencia += fila.existencia
      duplicadosSumados += 1
    } else {
      porClave.set(clave, { ...fila, nombreNormalizado: clave })
    }
  }

  const existentes = new Set(
    (await Articulo.find({ nombreNormalizado: { $in: [...porClave.keys()] } }).select('nombreNormalizado').lean()).map(
      (a) => a.nombreNormalizado
    )
  )
  const ahora = new Date()
  const operaciones = [...porClave.values()].map((f) => ({
    updateOne: {
      filter: { nombreNormalizado: f.nombreNormalizado },
      update: {
        $set: { grupo: f.grupo, existencia: f.existencia, existenciaActualizada: ahora },
        // Alias, presentaciones y "activo" son de Bodega: la importación nunca
        // los pisa, solo los inicializa al crear el artículo.
        $setOnInsert: {
          nombre: f.nombre,
          nombreNormalizado: f.nombreNormalizado,
          activo: !/^no usar$/i.test(f.nombre),
          alias: [],
          aliasNormalizados: [],
          presentaciones: [],
        },
      },
      upsert: true,
    },
  }))
  await Articulo.bulkWrite(operaciones, { ordered: false })

  const resultado = {
    total: porClave.size,
    creados: porClave.size - existentes.size,
    actualizados: existentes.size,
    duplicadosSumados,
  }
  await auditarCatalogo(usuarioActor, 'importar_existencias', `Importó el inventario de Elisa (${resultado.total} artículos)`, resultado)
  return resultado
}

// ── Edición del catálogo ──────────────────────────────────────────────────
function normalizarAlias(alias, nombreNormalizado) {
  const limpios = []
  const claves = new Set([nombreNormalizado])
  for (const a of Array.isArray(alias) ? alias : []) {
    const texto = String(a ?? '').trim()
    const clave = normalizar(texto)
    if (!clave || claves.has(clave)) continue
    claves.add(clave)
    limpios.push({ texto, clave })
  }
  return limpios
}

function normalizarPresentaciones(presentaciones) {
  const vistas = new Set()
  return (Array.isArray(presentaciones) ? presentaciones : []).map((p) => {
    const nombre = String(p?.nombre ?? '').trim()
    const factor = Number(p?.factor)
    if (!nombre) throw new ErrorValidacion('Cada presentación necesita un nombre')
    if (!Number.isInteger(factor) || factor < 1) throw new ErrorValidacion(`El factor de "${nombre}" debe ser un entero mayor o igual a 1`)
    const clave = normalizar(nombre)
    if (vistas.has(clave)) throw new ErrorValidacion(`La presentación "${nombre}" está repetida`)
    vistas.add(clave)
    return { nombre, factor }
  })
}

export async function editarArticulo(id, cambios, usuarioActor) {
  const articulo = await Articulo.findById(id)
  if (!articulo) throw new ErrorNoEncontrado('Artículo no encontrado')

  if (cambios?.alias !== undefined) {
    const alias = normalizarAlias(cambios.alias, articulo.nombreNormalizado)
    const choque = await Articulo.findOne({ _id: { $ne: articulo._id }, nombreNormalizado: { $in: alias.map((a) => a.clave) } }).select('nombre')
    if (choque) throw new ErrorValidacion(`«${choque.nombre}» ya es un artículo del catálogo y no puede ser otro nombre de este`)
    for (const a of alias) {
      // eslint-disable-next-line no-await-in-loop
      await quitarAliasDeOtros(articulo._id, a.clave)
    }
    articulo.alias = alias.map((a) => a.texto)
    articulo.aliasNormalizados = alias.map((a) => a.clave)
  }
  if (cambios?.presentaciones !== undefined) articulo.presentaciones = normalizarPresentaciones(cambios.presentaciones)
  if (cambios?.activo !== undefined) articulo.activo = Boolean(cambios.activo)

  await articulo.save()
  await auditarCatalogo(usuarioActor, 'editar_articulo', `Editó el artículo "${articulo.nombre}"`, undefined, articulo._id)
  return articulo
}

// Lo llama el vínculo de un ítem de texto libre: el texto que alguien escribió
// pasa a ser alias, así la próxima vez cae solo en este artículo. Idempotente.
export async function agregarAlias(articuloId, texto) {
  const clave = normalizar(texto)
  if (!clave) return false
  // Es el nombre de OTRO artículo: como alias lo secuestraría.
  if (await Articulo.exists({ nombreNormalizado: clave, _id: { $ne: articuloId } })) return false
  // Un alias pertenece a un solo artículo: la última decisión de Bodega gana.
  await quitarAliasDeOtros(articuloId, clave)
  const res = await Articulo.updateOne(
    { _id: articuloId, nombreNormalizado: { $ne: clave }, aliasNormalizados: { $ne: clave } },
    { $push: { alias: String(texto).trim(), aliasNormalizados: clave } }
  )
  return res.modifiedCount > 0
}

async function quitarAliasDeOtros(articuloId, clave) {
  const otros = await Articulo.find({ _id: { $ne: articuloId }, aliasNormalizados: clave }).select('alias aliasNormalizados')
  for (const otro of otros) {
    const conservar = otro.alias.map((a, i) => ({ a, k: otro.aliasNormalizados[i] })).filter((x) => x.k !== clave)
    otro.alias = conservar.map((x) => x.a)
    otro.aliasNormalizados = conservar.map((x) => x.k)
    // eslint-disable-next-line no-await-in-loop
    await otro.save()
  }
}
