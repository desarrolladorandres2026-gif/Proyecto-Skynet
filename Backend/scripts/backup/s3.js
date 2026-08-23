// Adaptador de subida a almacenamiento externo S3-compatible (AWS S3,
// Backblaze B2, Cloudflare R2, MinIO, etc.) para el dump cifrado que genera
// respaldar.js. Ver auditoría de producción 2026-08-22, Fase 13.
//
// ⚠️ NO VERIFICADO CONTRA UN PROVEEDOR REAL: este proyecto no tiene hoy
// ningún proveedor S3-compatible configurado (no existen credenciales
// BACKUP_S3_* reales en ningún .env de este repositorio ni se inventaron
// para esta entrega). El código usa el SDK oficial de AWS
// (@aws-sdk/client-s3, agregado como dependencia nueva) con la API estándar
// PutObjectCommand, que es la misma para cualquier proveedor S3-compatible
// que se configure vía BACKUP_S3_ENDPOINT — pero no se ha podido probar una
// subida real de punta a punta. Antes de confiar en esta ruta en
// producción: configurar un bucket real y correr respaldar.js una vez para
// confirmar que sube y que el objeto resultante se puede descargar y
// descifrar con restaurar.js.
import fs from 'node:fs'
import { env } from '../../src/config/env.js'

function configuradoCompleto() {
  return Boolean(
    env.BACKUP_S3_ENDPOINT && env.BACKUP_S3_BUCKET && env.BACKUP_S3_ACCESS_KEY_ID && env.BACKUP_S3_SECRET_ACCESS_KEY
  )
}

export async function subirABackupExterno({ rutaArchivo, rutaManifiesto, nombreBase }) {
  if (!configuradoCompleto()) {
    return {
      subido: false,
      motivo:
        'BACKUP_S3_ENDPOINT / BACKUP_S3_BUCKET / BACKUP_S3_ACCESS_KEY_ID / BACKUP_S3_SECRET_ACCESS_KEY no están ' +
        'todas configuradas. El backup queda solo en el disco local del VPS (ver BACKUP_LOCAL_DIR) — ' +
        'configúralas para tener una segunda copia fuera del VPS.',
    }
  }

  // Import perezoso: si nadie configura S3, el SDK ni siquiera se carga.
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')

  const cliente = new S3Client({
    endpoint: env.BACKUP_S3_ENDPOINT,
    region: env.BACKUP_S3_REGION,
    credentials: {
      accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
      secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
    },
  })

  try {
    await cliente.send(
      new PutObjectCommand({
        Bucket: env.BACKUP_S3_BUCKET,
        Key: `skynet-backups/${nombreBase}`,
        Body: fs.createReadStream(rutaArchivo),
      })
    )
    await cliente.send(
      new PutObjectCommand({
        Bucket: env.BACKUP_S3_BUCKET,
        Key: `skynet-backups/${nombreBase.replace(/\.enc$/, '.manifest.json')}`,
        Body: fs.createReadStream(rutaManifiesto),
      })
    )
    return { subido: true, detalle: `s3://${env.BACKUP_S3_BUCKET}/skynet-backups/${nombreBase}` }
  } catch (err) {
    return { subido: false, motivo: `Falló la subida: ${err.message}` }
  }
}
