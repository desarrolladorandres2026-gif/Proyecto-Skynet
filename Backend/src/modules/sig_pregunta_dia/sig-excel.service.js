import ExcelJS from 'exceljs'
import RespuestaSig from '../../models/RespuestaSig.js'
import { rangoDeDias } from '../../utils/fechas.js'

// Sin `desde`/`hasta` el filtro no acota nada más (dependencia/cargo/
// componente/tema pueden estar vacíos también), así que exportar sin ningún
// filtro traía la colección `RespuestaSig` COMPLETA — que crece sin límite de
// retención por diseño (ver RespuestaSig.js). Un tope aquí es la misma
// protección que ya existe en otros exports pesados del sistema (ver
// backupLimiter), aplicada al dato en vez de solo a la frecuencia de la
// petición.
const LIMITE_FILAS_SIN_RANGO = 20_000

// Exporta las respuestas filtradas, una fila por respuesta — el admin puede
// pivotear en Excel para el reporte diario/semanal/mensual/por componente/
// por trabajador que necesite, sin construir cada variante en el backend
// (mismo espíritu que backup.service.js con ExcelJS).
export async function exportarRespuestas({ desde, hasta, dependencia, cargo, componenteSig, tema }) {
  const filtro = {}
  if (desde && hasta) filtro.fechaProgramada = rangoDeDias(desde, hasta)
  if (dependencia) filtro.dependenciaSnapshot = dependencia
  if (cargo) filtro.cargoSnapshot = cargo
  if (componenteSig) filtro.componenteSigSnapshot = componenteSig
  if (tema) filtro.temaSnapshot = tema

  const hayRango = Boolean(desde && hasta)

  let query = RespuestaSig.find(filtro)
    .select('fechaProgramada dependenciaSnapshot cargoSnapshot componenteSigSnapshot temaSnapshot esCorrecta respondidaEn usuario programacion')
    .sort({ fechaProgramada: -1 })
    .populate({ path: 'usuario', select: 'nombre nombre_usuario' })
    .populate({ path: 'programacion', select: 'snapshotPregunta.enunciado' })
    .lean()
  if (!hayRango) query = query.limit(LIMITE_FILAS_SIN_RANGO + 1)

  const respuestas = await query
  const truncado = !hayRango && respuestas.length > LIMITE_FILAS_SIN_RANGO
  if (truncado) respuestas.length = LIMITE_FILAS_SIN_RANGO

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Skynet'
  workbook.created = new Date()

  const hoja = workbook.addWorksheet('Respuestas SIG')
  hoja.columns = [
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Trabajador', key: 'trabajador', width: 28 },
    { header: 'Dependencia', key: 'dependencia', width: 22 },
    { header: 'Cargo', key: 'cargo', width: 22 },
    { header: 'Componente SIG', key: 'componente', width: 20 },
    { header: 'Tema', key: 'tema', width: 28 },
    { header: 'Pregunta', key: 'pregunta', width: 50 },
    { header: 'Resultado', key: 'resultado', width: 14 },
    { header: 'Respondida en', key: 'respondidaEn', width: 20 },
  ]
  hoja.getRow(1).font = { bold: true }

  for (const r of respuestas) {
    hoja.addRow({
      fecha: r.fechaProgramada?.toISOString().slice(0, 10),
      trabajador: r.usuario?.nombre || r.usuario?.nombre_usuario || '(usuario eliminado)',
      dependencia: r.dependenciaSnapshot,
      cargo: r.cargoSnapshot,
      componente: r.componenteSigSnapshot,
      tema: r.temaSnapshot,
      pregunta: r.programacion?.snapshotPregunta?.enunciado || '',
      resultado: r.esCorrecta ? 'Correcta' : 'Incorrecta',
      respondidaEn: r.respondidaEn?.toISOString().replace('T', ' ').slice(0, 19),
    })
  }

  return { buffer: await workbook.xlsx.writeBuffer(), total: respuestas.length, truncado }
}
