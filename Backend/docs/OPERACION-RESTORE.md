# Procedimiento de recuperación ante pérdida de datos (restore)

Auditoría de producción 2026-08-22, Fase 14. Este documento responde a la
pregunta: **"si la base de datos desaparece hoy, ¿cómo recuperamos Skynet?"**

Usa solo comandos y scripts que existen de verdad en este repositorio. No
hay pasos ficticios.

## Antes de un incidente (una sola vez)

1. Genera la clave de cifrado del backup y guárdala en un gestor de
   contraseñas del equipo (NO en este repositorio, NO en el `.env` del VPS
   sin control de acceso adicional):
   ```
   openssl rand -hex 32
   ```
   Asígnala a `BACKUP_CIFRADO_CLAVE` en `Backend/.env` del VPS.
2. Instala MongoDB Database Tools en el VPS (`mongodump`/`mongorestore` — no
   vienen con Node): https://www.mongodb.com/try/download/database-tools
3. Programa el backup automático (cron del sistema operativo, no un worker
   de Node — ver comentario en `deploy/ecosystem.config.cjs` sobre por qué):
   ```
   crontab -e
   # Todos los días a las 3:00 am hora del servidor:
   0 3 * * *  cd /home/prueba/skynet/Backend && /usr/bin/node scripts/backup/respaldar.js >> ../logs/backup.log 2>&1
   ```
4. Si existe un proveedor de almacenamiento externo S3-compatible (AWS S3,
   Backblaze B2, Cloudflare R2, etc.), configura `BACKUP_S3_ENDPOINT`,
   `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`
   en el `.env` del VPS (ver `Backend/.env.production.example`). Sin esto,
   `scripts/backup/respaldar.js` sigue funcionando — el backup cifrado queda
   solo en el disco del VPS (`BACKUP_LOCAL_DIR`, `storage/backups/` por
   defecto), sin segunda copia fuera de él.
5. **Ensaya este procedimiento completo al menos una vez, fuera de un
   incidente real**, contra una base de prueba — la primera vez que se
   ejecuta un restore no debería ser durante una emergencia real.

## Durante un incidente

### 1. Detectar el desastre

Confirma que de verdad hay pérdida/corrupción de datos (no un problema de
red, del VPS, o de Atlas temporalmente caído — eso se resuelve solo). Revisa
`deploy/ecosystem.config.cjs` → logs de PM2 (`../logs/backend-error.log`) y
el panel de Atlas.

### 2. Activar modo mantenimiento (detener escrituras)

Reutiliza la infraestructura ya existente y probada — no hay que tocar PM2
ni nginx a mano:

- Panel de Skynet → Plataforma → Activar mantenimiento (requiere el permiso
  `plataforma:gestionar` o ser Super Admin), **o** directamente:
  ```
  POST /api/plataforma/activar
  ```
- Esto bloquea con 503 toda petición que no sea de un administrador de
  plataforma (ver `Backend/src/middleware/mantenimientoPlataforma.js`), sin
  necesidad de detener el proceso PM2.

### 3. Seleccionar el backup a restaurar

Revisa los manifiestos en `BACKUP_LOCAL_DIR` (o en el bucket externo si
subieron ahí) para elegir el punto en el tiempo correcto:

```
ls -la storage/backups/*.manifest.json
cat storage/backups/skynet-mongodump-2026-08-22T03-00-00-000Z.manifest.json
```

### 4. Restaurar a una base SEPARADA (nunca directo sobre la real)

```
node scripts/backup/restaurar.js \
  --archivo storage/backups/skynet-mongodump-2026-08-22T03-00-00-000Z.enc \
  --destino "mongodb://localhost:27017/skynet_restore_test"
```

Este script (ver `scripts/backup/restaurar.js`):
- Verifica el hash SHA-256 contra el manifiesto ANTES de tocar nada.
- Descifra el dump.
- Corre `mongorestore` contra `--destino` (nunca contra `MONGO_URI` de
  `.env` por defecto — hay que escribirlo explícitamente cada vez).

### 5. Verificar la restauración

```
node scripts/verificar-restore.js --uri "mongodb://localhost:27017/skynet_restore_test"
```

Confirma conexión, que existan usuarios activos, que el RBAC esté intacto
(al menos un Super Admin activo), y que las referencias entre colecciones
resuelvan (populate sin errores). Si algo falla, **no sigas al siguiente
paso** — investiga primero.

### 6. Cambiar `MONGO_URI` y reiniciar la aplicación

Solo después de que el paso 5 pase limpio:

1. Actualiza `MONGO_URI` en `Backend/.env` del VPS para apuntar a la base
   restaurada (o, si se restauró sobre un nombre de base nuevo en el mismo
   cluster de Atlas, ajusta la URI para reflejarlo).
2. Reinicia el proceso:
   ```
   pm2 restart skynet-backend
   ```

### 7. Ejecutar pruebas de humo contra la app real

Con el backend ya corriendo contra los datos restaurados (y todavía en modo
mantenimiento, así que solo un administrador puede probar):

- Login con una cuenta real conocida.
- Cargar el dashboard universal.
- Abrir un Requerimiento/Reporte de daño/OT de mantenimiento existente y
  confirmar que se ve completo.
- Si hay tiempo: `node scripts/test-flujo-mantenimiento.js` (E2E real contra
  un backend en marcha) da una cobertura más profunda, pero usa su propio
  Mongo efímero — no sirve para validar ESTOS datos restaurados
  específicamente, solo que el backend en general sigue funcionando.

### 8. Confirmar datos críticos a mano

Checklist mínimo (ajústalo según lo que se sepa que existía antes del
incidente):
- [ ] El número de usuarios activos es razonable (compáralo con el último
      backup conocido bueno).
- [ ] Los últimos Requerimientos/Reportes de daño/OT de mantenimiento antes
      del incidente están presentes.
- [ ] Los roles y permisos (Roles → panel) se ven como se esperaba.
- [ ] Las suscripciones push (`PushSubscription`) siguen ahí — si el backup
      restaurado es de antes de que la app CMS/notificaciones tuviera
      cambios recientes, revisa si hace falta re-sincronizar algo.

### 9. Finalizar mantenimiento

```
POST /api/plataforma/finalizar
```

Esto dispara automáticamente el aviso "Skynet ya está disponible" a los
usuarios (push/notificación interna, ver `plataforma.notificaciones.js`) —
no hace falta avisar a mano.

## Qué NO cubre este procedimiento

- **Backup parcial vía el panel de administración** (`GET /backup/exportar`,
  `backup.service.js`): es una exportación a Excel/CSV/JSON de colecciones
  seleccionadas para uso administrativo, NO un backup de desastre. No sirve
  como fuente para este runbook.
- **Recuperación de archivos subidos** (`storage/mantenimientos/`,
  `storage/mantenimiento_evidencias/`): este procedimiento solo cubre la
  base de datos. Los archivos en disco del VPS necesitan su propio backup
  de infraestructura (snapshot del VPS o sync a almacenamiento externo) —
  no están cubiertos por `scripts/backup/respaldar.js`, que solo hace
  `mongodump`.
- **Recuperación de Cloudinary** (fotos de daños, firmas): viven en un
  servicio externo con su propio ciclo de vida; no se pierden si Mongo se
  pierde (Mongo solo guarda la URL/publicId), pero si Cloudinary mismo
  fallara, esas imágenes sí se perderían — fuera del alcance de este
  documento.

## Qué se puede automatizar y qué no

| Paso | ¿Automatizable? |
|---|---|
| 1. Detectar desastre | Parcial — alertas si el backup no corrió (pendiente de un mecanismo de alerta real, ver auditoría original sección Observabilidad); decidir que es un desastre real es humano. |
| 2. Activar mantenimiento | Sí, un solo POST — pero decidir SI activarlo es humano. |
| 3. Elegir backup | Manual — requiere criterio sobre qué punto en el tiempo es el correcto. |
| 4. Restaurar | Semi-automático — `scripts/backup/restaurar.js` hace el trabajo pesado, pero requiere pasar `--destino` a mano a propósito. |
| 5. Verificar | Automatizable — `scripts/verificar-restore.js`. |
| 6. Cambiar MONGO_URI y reiniciar | Manual (editar `.env` + `pm2 restart`). |
| 7. Pruebas de humo | Parcialmente automatizable (ver arriba). |
| 8. Confirmar datos críticos | Manual — requiere juicio humano. |
| 9. Finalizar mantenimiento | Sí, un solo POST. |
