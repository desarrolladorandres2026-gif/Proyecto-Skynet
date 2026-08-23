import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import RegistroAuditoria from '../../models/RegistroAuditoria.js'

// Exporta a un archivo NDJSON local los registros que se van a purgar, ANTES
// de que purgarAntiguos() los borre de Mongo — ver auditoria.service.js.
//
// Mientras no exista almacenamiento externo configurado (BACKUP_S3_*, ver
// Backend/.env.production.example y scripts/backup/), el destino es una
// carpeta en el propio disco del VPS. No es un backup de desastre completo
// (si se pierde el disco del VPS, se pierde también este archivo) — pero es
// estrictamente mejor que "sin ningún rescate", que es como funcionaba antes
// (hard-delete directo). El backup completo del VPS (scripts/backup/) además
// respalda toda la carpeta storage/, así que esta carpeta queda cubierta por
// esa segunda capa igual. Ver auditoría de producción 2026-08-22, Fase 12.
//
// Si por cualquier motivo no se puede escribir/verificar el archivo (carpeta
// sin permisos, disco lleno, etc.), lanza — y purgarAntiguos() NO debe
// proceder a borrar nada en ese caso. Nunca "falla silenciosamente".
export async function archivarAntesDePurgar(fechaLimite) {
  const registros = await RegistroAuditoria.find({ creadoEn: { $lt: fechaLimite } }).lean()
  if (registros.length === 0) {
    return { cantidad: 0, ruta: null, hash: null, tamanoBytes: 0 }
  }

  const dir = env.AUDITORIA_ARCHIVO_DIR
  if (!dir) {
    throw new Error(
      'AUDITORIA_ARCHIVO_DIR no está configurado: no hay destino seguro para archivar antes de purgar.'
    )
  }

  await fs.mkdir(dir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const ruta = path.join(dir, `auditoria-purgada-${timestamp}.ndjson`)

  // NDJSON (un JSON por línea): apto tanto para reimportar programáticamente
  // (scripts/backup/restaurar-auditoria.js) como para inspeccionar a mano
  // sin tener que cargar un array gigante completo en memoria.
  const contenido = registros.map((r) => JSON.stringify(r)).join('\n') + '\n'
  await fs.writeFile(ruta, contenido, 'utf8')

  // Verificación real: se relee el archivo del disco (no se confía en que
  // writeFile no haya lanzado) y se confirma que el número de líneas
  // coincide con lo que se pretendía archivar, ANTES de dar luz verde a la
  // purga.
  const contenidoVerificado = await fs.readFile(ruta, 'utf8')
  const lineasEscritas = contenidoVerificado.split('\n').filter((linea) => linea.length > 0).length
  if (lineasEscritas !== registros.length) {
    throw new Error(
      `Verificación de archivado falló: se esperaban ${registros.length} registros, el archivo tiene ${lineasEscritas}.`
    )
  }

  const hash = crypto.createHash('sha256').update(contenidoVerificado).digest('hex')

  return {
    cantidad: registros.length,
    ruta,
    hash,
    tamanoBytes: Buffer.byteLength(contenidoVerificado, 'utf8'),
  }
}
