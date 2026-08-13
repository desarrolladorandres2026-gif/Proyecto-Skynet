import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { inicioDelDia } from '../../utils/fechas.js'
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

// Anclado a la medianoche del Terminal, no a la de la zona del proceso Node:
// `setHours(23,59,59,999)` sobre un Date parseado como UTC hacía que el
// límite superior cayera a las 6:59 p.m. hora de Neiva en el VPS (que corre en
// UTC), dejando fuera del backup todo lo del turno de la noche del último día
// del rango. Mismo BUG-005 que en auditoria.service.js.
function parseFecha(valor) {
  if (!valor) return undefined
  const fecha = inicioDelDia(valor)
  if (!fecha) throw new ErrorValidacion(`Fecha inválida: ${valor}`)
  return fecha
}

// El rango solo aplica a colecciones con campoFecha (ver COLECCIONES_PURGABLES
// en backup.config.js) — un catálogo sin fecha propia (Usuarios, Equipos...)
// se exporta completo aunque se pida un rango, porque no tiene noción de
// "dentro/fuera del rango".
function filtroFecha({ desde, hasta, campoFecha }) {
  if (!campoFecha) return {}
  const inicio = parseFecha(desde)
  const inicioHasta = parseFecha(hasta)
  if (!inicio && !inicioHasta) return {}
  const condicion = {}
  if (inicio) condicion.$gte = inicio
  // $lt del día siguiente en vez de $lte de las 23:59:59.999: incluye el día
  // "hasta" completo sin depender de la precisión con que Mongo guardó cada
  // timestamp.
  if (inicioHasta) condicion.$lt = new Date(inicioHasta.getTime() + 24 * 60 * 60 * 1000)
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
