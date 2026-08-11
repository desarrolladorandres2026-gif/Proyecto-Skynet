import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { COLECCIONES_BACKUP } from './backup.config.js'
import { cargarMapasReferencia, construirHoja, construirCsv, construirJsonColeccion } from './formatoHelpers.js'

const FORMATOS = {
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
  csv: { contentType: 'application/zip', extension: 'zip' },
  json: { contentType: 'application/json', extension: 'json' },
}

export function catalogoColecciones() {
  return COLECCIONES_BACKUP.map(({ clave, hoja, campoFecha }) => ({ clave, hoja, filtrablePorFecha: Boolean(campoFecha) }))
}

function resolverColecciones(clavesParam) {
  if (!clavesParam) return COLECCIONES_BACKUP
  const claves = String(clavesParam).split(',').map((c) => c.trim()).filter(Boolean)
  if (claves.length === 0) return COLECCIONES_BACKUP

  const validas = new Set(COLECCIONES_BACKUP.map((c) => c.clave))
  const desconocidas = claves.filter((c) => !validas.has(c))
  if (desconocidas.length > 0) throw new ErrorValidacion(`Colección(es) desconocida(s): ${desconocidas.join(', ')}`)

  const seleccion = new Set(claves)
  return COLECCIONES_BACKUP.filter((c) => seleccion.has(c.clave))
}

function parseFecha(valor, finDeDia) {
  if (!valor) return undefined
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) throw new ErrorValidacion(`Fecha inválida: ${valor}`)
  if (finDeDia) fecha.setHours(23, 59, 59, 999)
  return fecha
}

// El rango solo aplica a colecciones con campoFecha (ver COLECCIONES_PURGABLES
// en backup.config.js) — un catálogo sin fecha propia (Usuarios, Equipos...)
// se exporta completo aunque se pida un rango, porque no tiene noción de
// "dentro/fuera del rango".
function filtroFecha({ desde, hasta, campoFecha }) {
  if (!campoFecha) return {}
  const gte = parseFecha(desde, false)
  const lte = parseFecha(hasta, true)
  if (!gte && !lte) return {}
  const condicion = {}
  if (gte) condicion.$gte = gte
  if (lte) condicion.$lte = lte
  return { [campoFecha]: condicion }
}

function nombreArchivoSeguro(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes tras la normalización NFD
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

async function construirBufferExcel(datos, mapas, usuarioActor) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Skynet'
  workbook.created = new Date()

  const resumen = workbook.addWorksheet('Resumen')
  resumen.columns = [
    { header: 'Colección', key: 'coleccion', width: 32 },
    { header: 'Registros', key: 'registros', width: 14 },
  ]
  resumen.getRow(1).font = { bold: true }

  for (const { hoja, documentos, camposExcluir = [] } of datos) {
    construirHoja(workbook, hoja, documentos, camposExcluir, mapas)
    resumen.addRow({ coleccion: hoja, registros: documentos.length })
  }
  resumen.addRow({})
  resumen.addRow({ coleccion: 'Generado por', registros: usuarioActor.nombre_usuario })
  resumen.addRow({ coleccion: 'Fecha de generación', registros: new Date().toLocaleString('es-CO') })

  return workbook.xlsx.writeBuffer()
}

async function construirBufferCsvZip(datos, mapas) {
  const zip = new JSZip()
  for (const { hoja, documentos, camposExcluir = [] } of datos) {
    zip.file(`${nombreArchivoSeguro(hoja)}.csv`, construirCsv(documentos, camposExcluir, mapas))
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

function construirBufferJson(datos, mapas, usuarioActor) {
  const salida = {
    generadoPor: usuarioActor.nombre_usuario,
    generadoEn: new Date().toISOString(),
  }
  for (const { clave, documentos, camposExcluir = [] } of datos) {
    salida[clave] = construirJsonColeccion(documentos, camposExcluir, mapas)
  }
  return Buffer.from(JSON.stringify(salida, null, 2), 'utf-8')
}

// Backup manual bajo demanda (no programado): el Super Admin decide qué
// colecciones, qué rango de fechas y en qué formato — por defecto exporta
// TODO en xlsx, igual que antes de que existiera el panel de personalización.
// Consulta cada colección SECUENCIALMENTE (no Promise.all): el VPS de
// producción es compartido con otros dos proyectos y no conviene disparar
// varias consultas simultáneas por un reporte que no es sensible a la
// latencia.
export async function generarBackup({ colecciones, desde, hasta, formato = 'xlsx' } = {}, usuarioActor) {
  if (!FORMATOS[formato]) throw new ErrorValidacion('Formato inválido (usa xlsx, csv o json)')
  if (desde && hasta && new Date(desde) > new Date(hasta)) {
    throw new ErrorValidacion('"Desde" no puede ser posterior a "hasta"')
  }

  const seleccion = resolverColecciones(colecciones)
  if (seleccion.length === 0) throw new ErrorValidacion('Selecciona al menos una colección')

  const mapas = await cargarMapasReferencia()

  const datos = []
  for (const entrada of seleccion) {
    const filtro = filtroFecha({ desde, hasta, campoFecha: entrada.campoFecha })
    const documentos = await entrada.modelo.find(filtro).lean()
    datos.push({ ...entrada, documentos })
  }

  const rangoTexto = desde || hasta ? `, rango ${desde || '…'} a ${hasta || '…'}` : ''
  const alcanceTexto = seleccion.length === COLECCIONES_BACKUP.length ? 'todas las colecciones' : `${seleccion.length} colección(es)`
  const resumenTexto = datos.map((d) => `${d.hoja}: ${d.documentos.length}`).join(', ')

  await registrarAuditoria({
    usuario: usuarioActor,
    accion: 'generar_backup',
    modulo: 'backup',
    entidad: 'Backup',
    descripcion: `Generó un backup en ${formato.toUpperCase()} (${alcanceTexto}${rangoTexto}): ${resumenTexto}`,
  })

  const buffer =
    formato === 'json'
      ? construirBufferJson(datos, mapas, usuarioActor)
      : formato === 'csv'
        ? await construirBufferCsvZip(datos, mapas)
        : await construirBufferExcel(datos, mapas, usuarioActor)

  return { buffer, ...FORMATOS[formato] }
}
