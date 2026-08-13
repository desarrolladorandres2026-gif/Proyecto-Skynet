import ExcelJS from 'exceljs'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { reautenticar } from '../../utils/reautenticacion.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { restarMeses } from '../../utils/fechas.js'
import { COLECCIONES_PURGABLES } from './backup.config.js'
import { cargarMapasReferencia, construirHoja } from './formatoHelpers.js'

// Solo 6 o 12 meses: son los dos atajos que pide el Super Admin desde la
// pantalla de Backup, no un rango libre — un rango libre por fecha ya existe
// aparte para Requerimientos (ver requerimientos.routes.js) y no hace falta
// duplicarlo aquí con más superficie de error.
const MESES_VALIDOS = [6, 12]

function calcularCorte(meses) {
  const n = Number(meses)
  if (!MESES_VALIDOS.includes(n)) {
    throw new ErrorValidacion('El plazo debe ser 6 o 12 meses')
  }
  // restarMeses en vez de setMonth: `new Date('2026-05-31').setMonth(mes - 6)`
  // desborda al 3 de diciembre en vez del 30 de noviembre, y esta operación
  // BORRA. Ver BUG-012 en la auditoría 2026-08-13.
  return restarMeses(new Date(), n)
}

// Conteo rápido (sin generar el Excel) para que la pantalla de confirmación
// muestre "esto va a borrar X requerimientos, Y reportes..." antes de que el
// Super Admin decida descargar el rescate y confirmar.
export async function previsualizarPurga(meses) {
  const corte = calcularCorte(meses)
  const conteos = []
  for (const { modelo, hoja, campoFecha } of COLECCIONES_PURGABLES) {
    const total = await modelo.countDocuments({ [campoFecha]: { $lt: corte } })
    conteos.push({ entidad: hoja, total })
  }
  return { corte, conteos }
}

// El "rescate": mismo formato que el backup completo (backup.service.js)
// pero filtrado SOLO a los documentos que purgarAntiguos va a borrar. Es de
// solo lectura — no requiere reautenticación, a diferencia de la purga en sí.
export async function generarRescateExcel(meses) {
  const corte = calcularCorte(meses)
  const mapas = await cargarMapasReferencia()

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Skynet'
  workbook.created = new Date()

  const resumen = workbook.addWorksheet('Resumen')
  resumen.columns = [
    { header: 'Colección', key: 'coleccion', width: 32 },
    { header: 'Registros a eliminar', key: 'registros', width: 22 },
  ]
  resumen.getRow(1).font = { bold: true }
  resumen.addRow({ coleccion: 'Elimina lo anterior a', registros: corte.toLocaleDateString('es-CO') })
  resumen.addRow({})

  for (const { modelo, hoja, camposExcluir = [], campoFecha } of COLECCIONES_PURGABLES) {
    const documentos = await modelo.find({ [campoFecha]: { $lt: corte } }).lean()
    construirHoja(workbook, hoja, documentos, camposExcluir, mapas)
    resumen.addRow({ coleccion: hoja, registros: documentos.length })
  }

  return workbook.xlsx.writeBuffer()
}

// Irreversible: exige reautenticación (mismo patrón de "firma" que
// eliminarPorRangoFecha en Requerimientos) ANTES de tocar cualquier
// colección. No pide que el Excel de rescate se haya descargado — el
// frontend guía ese orden (ver PurgaHistoricoModal.jsx), pero el backend no
// puede verificar que un archivo llegó a un disco ajeno, así que la garantía
// real está en la reautenticación + el registro de auditoría, no en el
// orden de los clics.
export async function purgarAntiguos({ meses, password } = {}, usuarioActor) {
  await reautenticar(usuarioActor.id_usuario, password)
  const corte = calcularCorte(meses)

  const resultados = []
  for (const { modelo, hoja, campoFecha } of COLECCIONES_PURGABLES) {
    const resultado = await modelo.deleteMany({ [campoFecha]: { $lt: corte } })
    resultados.push({ entidad: hoja, eliminados: resultado.deletedCount })
  }

  await registrarAuditoria({
    usuario: usuarioActor,
    accion: 'purgar_historico',
    modulo: 'backup',
    entidad: 'Backup',
    descripcion: `Purgó datos anteriores a ${corte.toLocaleDateString('es-CO')} (${meses} meses): ${resultados
      .map((r) => `${r.entidad}: ${r.eliminados}`)
      .join(', ')}`,
  })

  return { corte, resultados }
}
