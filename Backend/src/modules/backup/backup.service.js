import ExcelJS from 'exceljs'
import mongoose from 'mongoose'
import Usuario from '../../models/Usuario.js'
import Rol from '../../models/Rol.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { COLECCIONES_BACKUP } from './backup.config.js'

const COLOR_ENCABEZADO = 'FF1E293B'
const LIMITE_CARACTERES_CELDA = 32000 // Excel corta celdas en 32767; se deja margen.

// Reemplaza cada ObjectId (en cualquier nivel de anidamiento) por una
// etiqueta legible cuando corresponde a un Usuario o Rol conocido — así una
// referencia como "tecnico: 65f..." sale en el Excel como "Ana Ríos
// (ana.rios)" en vez de un hash sin sentido fuera de la base de datos.
// Deja el hex tal cual si no matchea (p. ej. referencias a Requerimiento o
// Mantenimiento dentro de otra colección, que no vale la pena resolver).
function resolverReferencias(valor, mapas) {
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

// Convierte un valor ya resuelto en algo que ExcelJS puede poner en una
// celda: fechas se dejan como Date (para que Excel las reconozca como fecha,
// no como texto), listas simples se unen con coma, y cualquier objeto/array
// anidado que sobreviva se aplana a JSON legible en una sola celda.
function aCelda(valor) {
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

function construirHoja(workbook, nombreHoja, documentos, camposExcluir, mapas) {
  const hoja = workbook.addWorksheet(nombreHoja.slice(0, 31))
  if (documentos.length === 0) {
    hoja.addRow(['(sin registros)'])
    return
  }

  const excluidos = new Set(['__v', ...camposExcluir])
  const columnas = ['_id']
  for (const doc of documentos) {
    for (const clave of Object.keys(doc)) {
      if (clave !== '_id' && !excluidos.has(clave) && !columnas.includes(clave)) columnas.push(clave)
    }
  }

  hoja.columns = columnas.map((clave) => ({ header: clave === '_id' ? 'ID' : clave, key: clave }))

  for (const doc of documentos) {
    const fila = { _id: doc._id.toString() }
    for (const clave of columnas) {
      if (clave === '_id') continue
      fila[clave] = aCelda(resolverReferencias(doc[clave], mapas))
    }
    const filaAgregada = hoja.addRow(fila)
    columnas.forEach((clave, i) => {
      if (fila[clave] instanceof Date) filaAgregada.getCell(i + 1).numFmt = 'dd/mm/yyyy hh:mm'
    })
  }

  estilarEncabezado(hoja, columnas.length)
  ajustarAnchoColumnas(hoja)
}

// Backup manual bajo demanda (no programado): el Super Admin decide cuándo
// generarlo, típicamente antes de que se cumplan los
// AUDITORIA_RETENCION_MESES que borran solos los registros de auditoría más
// viejos (ver auditoria.worker.js) — ese es el dato que de verdad desaparece
// solo si nadie lo respalda antes. Consulta cada colección de forma
// SECUENCIAL (no Promise.all): el VPS de producción es compartido con otros
// dos proyectos y no conviene disparar ~20 consultas simultáneas por un
// reporte que no es sensible a la latencia.
export async function generarBackupExcel(usuarioActor) {
  const [usuarios, roles] = await Promise.all([
    Usuario.find().select('nombre nombre_usuario').lean(),
    Rol.find().select('nombre').lean(),
  ])
  const mapas = {
    usuarios: new Map(usuarios.map((u) => [u._id.toString(), `${u.nombre} (${u.nombre_usuario})`])),
    roles: new Map(roles.map((r) => [r._id.toString(), r.nombre])),
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Skynet'
  workbook.created = new Date()

  const resumen = workbook.addWorksheet('Resumen')
  resumen.columns = [
    { header: 'Colección', key: 'coleccion', width: 32 },
    { header: 'Registros', key: 'registros', width: 14 },
  ]
  resumen.getRow(1).font = { bold: true }

  const conteos = []
  for (const { modelo, hoja, camposExcluir = [] } of COLECCIONES_BACKUP) {
    const documentos = await modelo.find().lean()
    construirHoja(workbook, hoja, documentos, camposExcluir, mapas)
    resumen.addRow({ coleccion: hoja, registros: documentos.length })
    conteos.push(`${hoja}: ${documentos.length}`)
  }

  resumen.addRow({})
  resumen.addRow({ coleccion: 'Generado por', registros: `${usuarioActor.nombre_usuario}` })
  resumen.addRow({ coleccion: 'Fecha de generación', registros: new Date().toLocaleString('es-CO') })

  await registrarAuditoria({
    usuario: usuarioActor,
    accion: 'generar_backup',
    modulo: 'backup',
    entidad: 'Backup',
    descripcion: `Generó y descargó un backup completo en Excel (${COLECCIONES_BACKUP.length} colecciones): ${conteos.join(', ')}`,
  })

  return workbook.xlsx.writeBuffer()
}
