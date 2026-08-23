#!/usr/bin/env node
/**
 * Backup real de desastre para MongoDB — Fase 13 de la auditoría de
 * producción 2026-08-22. Distinto de `backup.service.js` (exportación
 * administrativa a Excel de colecciones seleccionadas, para un Super Admin
 * desde el panel): esto es un dump BINARIO COMPLETO de la base de datos,
 * pensado para reconstruir Skynet entero ante una pérdida real de datos.
 *
 * Qué hace, en orden (si un paso falla, no se ejecuta el siguiente):
 *   1. mongodump --archive --gzip de TODA la base (requiere que `mongodump`
 *      esté instalado en el VPS — MongoDB Database Tools, no viene con Node).
 *   2. Cifra el dump con AES-256-GCM (BACKUP_CIFRADO_CLAVE).
 *   3. Calcula el hash SHA-256 del archivo cifrado.
 *   4. Escribe un manifiesto .json con metadatos (fecha, tamaño, hash).
 *   5. Si BACKUP_S3_* está configurado, sube el par (dump + manifiesto) a
 *      almacenamiento externo S3-compatible. Si NO está configurado, el
 *      script lo dice explícitamente y sigue (el dump local ya es la mejora
 *      real frente a "no había backup"; la copia externa es la siguiente
 *      capa cuando exista un proveedor).
 *   6. Rota los dumps locales viejos (conserva los últimos
 *      BACKUP_RETENCION_LOCAL).
 *
 * Uso:
 *   node scripts/backup/respaldar.js
 *
 * Pensado para un cron del SISTEMA OPERATIVO en el VPS (no un worker dentro
 * del proceso Node — ver deploy/ecosystem.config.cjs, que evita a propósito
 * procesos adicionales), p. ej.:
 *   0 3 * * *  cd /home/prueba/skynet/Backend && /usr/bin/node scripts/backup/respaldar.js >> ../logs/backup.log 2>&1
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { env } from '../../src/config/env.js'
import { subirABackupExterno } from './s3.js'
import { cifrarArchivo, calcularHashSha256, ALGORITMO } from './cifrado.js'

function requerirMongodump() {
  return new Promise((resolve, reject) => {
    const proc = spawn('mongodump', ['--version'])
    proc.on('error', () =>
      reject(
        new Error(
          'mongodump no está instalado o no está en el PATH. Instala MongoDB Database Tools ' +
            '(https://www.mongodb.com/try/download/database-tools) antes de correr este script.'
        )
      )
    )
    proc.on('exit', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`mongodump --version salió con código ${codigo}`))))
  })
}

function ejecutarMongodump(rutaSalida) {
  return new Promise((resolve, reject) => {
    const proc = spawn('mongodump', [`--uri=${env.MONGO_URI}`, `--archive=${rutaSalida}`, '--gzip'], {
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    proc.on('error', reject)
    proc.on('exit', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`mongodump salió con código ${codigo}`))))
  })
}

async function rotarBackupsLocales(dir) {
  const archivos = (await fs.readdir(dir))
    .filter((f) => f.startsWith('skynet-mongodump-') && f.endsWith('.enc'))
    .sort()
  const sobrantes = archivos.length - env.BACKUP_RETENCION_LOCAL
  if (sobrantes <= 0) return []
  const aBorrar = archivos.slice(0, sobrantes)
  for (const archivo of aBorrar) {
    await fs.rm(path.join(dir, archivo), { force: true })
    await fs.rm(path.join(dir, archivo.replace(/\.enc$/, '.manifest.json')), { force: true })
  }
  return aBorrar
}

async function main() {
  if (!env.BACKUP_CIFRADO_CLAVE) {
    console.error(
      '\n🛑  BACKUP_CIFRADO_CLAVE no está configurada. No se genera un backup sin cifrar.\n' +
        '    Genera una con: openssl rand -hex 32\n'
    )
    process.exitCode = 1
    return
  }

  console.log('🔍  Verificando que mongodump esté disponible...')
  await requerirMongodump()

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = env.BACKUP_LOCAL_DIR
  await fs.mkdir(dir, { recursive: true })

  const rutaTemp = path.join(dir, `.tmp-${timestamp}.archive.gz`)
  const rutaCifrada = path.join(dir, `skynet-mongodump-${timestamp}.enc`)
  const rutaManifiesto = path.join(dir, `skynet-mongodump-${timestamp}.manifest.json`)

  console.log('📦  Generando dump completo con mongodump...')
  await ejecutarMongodump(rutaTemp)
  const tamanoOriginal = (await fs.stat(rutaTemp)).size

  console.log('🔒  Cifrando el dump (AES-256-GCM)...')
  await cifrarArchivo(rutaTemp, rutaCifrada, env.BACKUP_CIFRADO_CLAVE)
  await fs.rm(rutaTemp, { force: true })

  console.log('🔑  Calculando hash SHA-256 de verificación...')
  const hash = await calcularHashSha256(rutaCifrada)
  const tamanoCifrado = (await fs.stat(rutaCifrada)).size

  const manifiesto = {
    fecha: new Date().toISOString(),
    archivo: path.basename(rutaCifrada),
    tamanoOriginalBytes: tamanoOriginal,
    tamanoCifradoBytes: tamanoCifrado,
    hashSha256: hash,
    algoritmoCifrado: ALGORITMO,
  }
  await fs.writeFile(rutaManifiesto, JSON.stringify(manifiesto, null, 2))
  console.log(`✅  Backup local listo: ${rutaCifrada}`)
  console.log(`    Hash SHA-256: ${hash}`)

  const resultadoSubida = await subirABackupExterno({ rutaArchivo: rutaCifrada, rutaManifiesto, nombreBase: path.basename(rutaCifrada) })
  if (resultadoSubida.subido) {
    console.log(`☁️   Subido a almacenamiento externo: ${resultadoSubida.detalle}`)
  } else {
    console.warn(`⚠️   No se subió a almacenamiento externo: ${resultadoSubida.motivo}`)
  }

  const borrados = await rotarBackupsLocales(dir)
  if (borrados.length) {
    console.log(`🧹  Rotación: ${borrados.length} backup(s) local(es) antiguo(s) eliminado(s) (se conservan los últimos ${env.BACKUP_RETENCION_LOCAL}).`)
  }
}

main().catch((err) => {
  console.error('❌  Backup falló:', err.message)
  process.exitCode = 1
})
