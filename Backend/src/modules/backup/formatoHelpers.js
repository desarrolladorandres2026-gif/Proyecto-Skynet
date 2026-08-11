import mongoose from 'mongoose'
import Usuario from '../../models/Usuario.js'
import Rol from '../../models/Rol.js'

const COLOR_ENCABEZADO = 'FF1E293B'
const LIMITE_CARACTERES_CELDA = 32000 // Excel corta celdas en 32767; se deja margen.

// Compartido por backup.service.js (xlsx/csv/json a demanda) y
// purga.service.js (rescate filtrado antes de purgar): la resolución de
// referencias y la derivación de columnas es idéntica en todos los casos,
// solo cambia qué documentos entran y en qué formato salen.

export async function cargarMapasReferencia() {
  const [usuarios, roles] = await Promise.all([
    Usuario.find().select('nombre nombre_usuario').lean(),
    Rol.find().select('nombre').lean(),
  ])
  return {
    usuarios: new Map(usuarios.map((u) => [u._id.toString(), `${u.nombre} (${u.nombre_usuario})`])),
    roles: new Map(roles.map((r) => [r._id.toString(), r.nombre])),
  }
}

// Reemplaza cada ObjectId (en cualquier nivel de anidamiento) por una
// etiqueta legible cuando corresponde a un Usuario o Rol conocido — así una
// referencia como "tecnico: 65f..." sale como "Ana Ríos (ana.rios)" en vez
// de un hash sin sentido fuera de la base de datos. Deja el hex tal cual si
// no matchea (p. ej. referencias a Requerimiento o Mantenimiento dentro de
// otra colección, que no vale la pena resolver).
export function resolverReferencias(valor, mapas) {
  if (valor === null || valor === undefined) return valor
  if (valor instanceof Date) return valor
  if (valor instanceof mongoose.Types.ObjectId) {
    const hex = valor.toHexString()
    return mapas.usuarios.get(hex) ?? mapas.roles.get(hex) ?? hex
  }
  if (valor instanceof Map) {
    return Object.fromEntries(Array.from(valor, ([k, v]) => [k, resolverReferencias(v, mapas)]))
  }
  if (Array.isArray(valor)) return valor.map((v) => resolverReferencias(v, mapas))
  if (typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, resolverReferencias(v, mapas)]))
  }
  return valor
}

// Unión de todas las claves presentes en los documentos (algunas colecciones
// tienen campos opcionales que no aparecen siempre), con "_id" fijado
// primero — igual para las tres salidas (xlsx/csv/json) así ninguna se
// desincroniza de las demás si se agrega un campo nuevo a un modelo.
function derivarColumnas(documentos, camposExcluir) {
  const excluidos = new Set(['__v', ...camposExcluir])
  const columnas = ['_id']
  for (const doc of documentos) {
    for (const clave of Object.keys(doc)) {
      if (clave !== '_id' && !excluidos.has(clave) && !columnas.includes(clave)) columnas.push(clave)
    }
  }
  return columnas
}

// Convierte un valor ya resuelto en algo que ExcelJS puede poner en una
// celda: fechas se dejan como Date (para que Excel las reconozca como fecha,
// no como texto), listas simples se unen con coma, y cualquier objeto/array
// anidado que sobreviva se aplana a JSON legible en una sola celda.
function aCeldaExcel(valor) {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) return valor
  let resultado
  if (Array.isArray(valor)) {
    if (valor.length === 0) return ''
    resultado = valor.every((v) => typeof v !== 'object' || v === null) ? valor.join(', ') : JSON.stringify(valor)
  } else if (typeof valor === 'object') {
    resultado = JSON.stringify(valor)
  } else {
    return valor
  }
  return resultado.length > LIMITE_CARACTERES_CELDA ? `${resultado.slice(0, LIMITE_CARACTERES_CELDA)}…(truncado)` : resultado
}

function estilarEncabezado(hoja, totalColumnas) {
  const fila = hoja.getRow(1)
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } }
  fila.alignment = { vertical: 'middle' }
  hoja.views = [{ state: 'frozen', ySplit: 1 }]
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: totalColumnas } }
}

function ajustarAnchoColumnas(hoja) {
  hoja.columns.forEach((columna) => {
    let max = String(columna.header ?? '').length
    columna.eachCell({ includeEmpty: false }, (celda, numeroFila) => {
      if (numeroFila === 1) return
      const largo = celda.value instanceof Date ? 16 : String(celda.value ?? '').length
      if (largo > max) max = largo
    })
    columna.width = Math.min(Math.max(max + 2, 12), 60)
  })
}

export function construirHoja(workbook, nombreHoja, documentos, camposExcluir, mapas) {
  const hoja = workbook.addWorksheet(nombreHoja.slice(0, 31))
  if (documentos.length === 0) {
    hoja.addRow(['(sin registros)'])
    return
  }

  const columnas = derivarColumnas(documentos, camposExcluir)
  hoja.columns = columnas.map((clave) => ({ header: clave === '_id' ? 'ID' : clave, key: clave }))

  for (const doc of documentos) {
    const fila = { _id: doc._id.toString() }
    for (const clave of columnas) {
      if (clave === '_id') continue
      fila[clave] = aCeldaExcel(resolverReferencias(doc[clave], mapas))
    }
    const filaAgregada = hoja.addRow(fila)
    columnas.forEach((clave, i) => {
      if (fila[clave] instanceof Date) filaAgregada.getCell(i + 1).numFmt = 'dd/mm/yyyy hh:mm'
    })
  }

  estilarEncabezado(hoja, columnas.length)
  ajustarAnchoColumnas(hoja)
}

// Mismo blindaje de inyección de fórmulas que ya usa el CSV de Requerimientos
// (requerimientos.service.js::csvEscapar): un valor que empiece con
// =/+/-/@/tab abre Excel/Sheets en modo fórmula si el CSV se abre con doble
// clic, así que se le antepone un `'` para forzarlo a texto plano.
function csvEscapar(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor)
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

function aCeldaCsv(valor) {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) return valor.toISOString()
  if (Array.isArray(valor)) {
    if (valor.length === 0) return ''
    return valor.every((v) => typeof v !== 'object' || v === null) ? valor.join(', ') : JSON.stringify(valor)
  }
  if (typeof valor === 'object') return JSON.stringify(valor)
  return valor
}

// BOM al inicio: sin esto, Excel en Windows interpreta acentos/ñ como
// caracteres corruptos al abrir el archivo por doble clic en vez de detectar
// UTF-8 (mismo motivo que requerimientos.service.js::exportarCsv).
export function construirCsv(documentos, camposExcluir, mapas) {
  const bom = '﻿'
  if (documentos.length === 0) return `${bom}(sin registros)\r\n`

  const columnas = derivarColumnas(documentos, camposExcluir)
  const encabezados = columnas.map((c) => csvEscapar(c === '_id' ? 'ID' : c))
  const filas = documentos.map((doc) =>
    columnas
      .map((clave) => csvEscapar(clave === '_id' ? doc._id.toString() : aCeldaCsv(resolverReferencias(doc[clave], mapas))))
      .join(',')
  )
  return bom + [encabezados.join(','), ...filas].join('\r\n')
}

// A diferencia de Excel/CSV, JSON no necesita aplanar objetos/arrays
// anidados a una sola celda — se conservan tal cual, solo con las
// referencias resueltas (mismo criterio que las otras dos salidas, para que
// las tres cuenten la misma historia) y los campos excluidos fuera.
export function construirJsonColeccion(documentos, camposExcluir, mapas) {
  const excluidos = new Set(['__v', ...camposExcluir])
  return documentos.map((doc) => {
    const limpio = {}
    for (const [clave, valor] of Object.entries(doc)) {
      if (excluidos.has(clave)) continue
      limpio[clave === '_id' ? 'id' : clave] = clave === '_id' ? doc._id.toString() : resolverReferencias(valor, mapas)
    }
    return limpio
  })
}
