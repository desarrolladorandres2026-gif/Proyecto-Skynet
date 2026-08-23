#!/usr/bin/env node
/**
 * Restaura un dump generado por respaldar.js. Ver auditoría de producción
 * 2026-08-22, Fase 14, y docs/OPERACION-RESTORE.md para el procedimiento
 * completo (con este script como uno de los pasos, no el único).
 *
 * Deliberadamente EXIGE --destino explícito: nunca cae por defecto a
 * MONGO_URI de .env, para que restaurar sobre la base equivocada (o sobre
 * la de producción sin querer) sea imposible por omisión — hay que
 * escribirla a mano cada vez.
 *
 * Uso:
 *   node scripts/backup/restaurar.js \
 *     --archivo storage/backups/skynet-mongodump-2026-08-22T03-00-00-000Z.enc \
 *     --destino "mongodb://localhost:27017/skynet_restore_test"
 *
 * Recomendado: restaurar SIEMPRE primero a una base nueva/separada (nunca
 * directo sobre la que usa producción) y verificar con
 * scripts/verificar-restore.js antes de promoverla.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import { env } from '../../src/config/env.js'
import { descifrarArchivo, calcularHashSha256 } from './cifrado.js'

function leerArgumento(nombre) {
  const idx = process.argv.indexOf(`--${nombre}`)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

function requerirMongorestore() {
  return new Promise((resolve, reject) => {
    const proc = spawn('mongorestore', ['--version'])
    proc.on('error', () =>
      reject(new Error('mongorestore no está instalado o no está en el PATH (MongoDB Database Tools).'))
    )
    proc.on('exit', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`mongorestore --version salió con código ${codigo}`))))
  })
}

function ejecutarMongorestore(rutaArchivo, destinoUri) {
  return new Promise((resolve, reject) => {
    const proc = spawn('mongorestore', [`--uri=${destinoUri}`, `--archive=${rutaArchivo}`, '--gzip'], {
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    proc.on('error', reject)
    proc.on('exit', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`mongorestore salió con código ${codigo}`))))
  })
}

async function main() {
  const rutaArchivo = leerArgumento('archivo')
  const destino = leerArgumento('destino')

  if (!rutaArchivo || !destino) {
    console.error(
      '\nUso: node scripts/backup/restaurar.js --archivo <ruta.enc> --destino "<mongo-uri>"\n' +
        '--destino es obligatorio y NO debe ser la URI de producción salvo que ese sea de verdad el\n' +
        'plan (recomendado: restaurar primero a una base separada y verificar antes de promoverla).\n'
    )
    process.exitCode = 1
    return
  }
  if (!env.BACKUP_CIFRADO_CLAVE) {
    console.error('\n🛑  BACKUP_CIFRADO_CLAVE no está configurada — no se puede descifrar el backup.\n')
    process.exitCode = 1
    return
  }

  const rutaManifiesto = rutaArchivo.replace(/\.enc$/, '.manifest.json')
  if (fssync.existsSync(rutaManifiesto)) {
    const manifiesto = JSON.parse(await fs.readFile(rutaManifiesto, 'utf8'))
    console.log('🔍  Verificando integridad contra el manifiesto...')
    const hashReal = await calcularHashSha256(rutaArchivo)
    if (hashReal !== manifiesto.hashSha256) {
      console.error(`🛑  El hash del archivo NO coincide con el manifiesto. Esperado: ${manifiesto.hashSha256}, real: ${hashReal}.`)
      console.error('    El archivo pudo corromperse o alterarse — no se procede con la restauración.')
      process.exitCode = 1
      return
    }
    console.log('✅  Hash verificado, coincide con el manifiesto.')
  } else {
    console.warn(`⚠️   No se encontró manifiesto (${rutaManifiesto}) — se continúa sin verificar hash.`)
  }

  console.log('🔍  Verificando que mongorestore esté disponible...')
  await requerirMongorestore()

  const rutaTemp = path.join(path.dirname(rutaArchivo), `.tmp-restore-${Date.now()}.archive.gz`)
  try {
    console.log('🔓  Descifrando...')
    await descifrarArchivo(rutaArchivo, rutaTemp, env.BACKUP_CIFRADO_CLAVE)

    console.log(`📥  Restaurando contra: ${destino}`)
    console.log('    (mongorestore no borra colecciones existentes por defecto: si el destino ya tiene datos,')
    console.log('     esto los MEZCLA/actualiza documento a documento, no los reemplaza. Restaura sobre una base')
    console.log('     vacía si quieres una copia limpia — ver docs/OPERACION-RESTORE.md.)')
    await ejecutarMongorestore(rutaTemp, destino)

    console.log('✅  Restauración completada. Corre scripts/verificar-restore.js contra ese mismo --destino ahora.')
  } finally {
    await fs.rm(rutaTemp, { force: true })
  }
}

main().catch((err) => {
  console.error('❌  Restauración falló:', err.message)
  process.exitCode = 1
})
