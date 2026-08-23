# Arquitectura de seguridad e integridad — Proyecto Skynet

Documento de referencia: cómo funciona hoy la seguridad y la integridad de
datos de Skynet, y por qué se diseñó así. Complementa
`docs/DEFINITION-OF-DONE.md` (checklist para cambios nuevos) y
`docs/OPERACION-RESTORE.md` (procedimiento de recuperación).

## 1. Autenticación

- **Transporte**: JWT firmado HS256, en cookie `httpOnly` + `secure` (en
  producción) + `sameSite:'strict'` (`utils/cookies.js`). Fallback
  `Authorization: Bearer` solo para clientes no-navegador. El frontend
  **nunca** guarda el token en `localStorage` — solo el perfil público del
  usuario, no sensible.
- **Revalidación por request**: `middleware/auth.js#verificarToken` NO
  confía en lo que dice el JWT para autorizar — en cada petición vuelve a
  consultar `Usuario` en Mongo (rol, permisos, estado, `tokenVersion`). Esto
  es lo que permite que desactivar un usuario o cambiarle el rol aplique de
  inmediato, sin esperar a que expire su token (hasta 8h).
- **`tokenVersion`** — invalidación GLOBAL de sesiones: se incrementa al
  cambiar contraseña (self-service o por admin), rol, módulos, o pasar a
  `inactivo`. Un token firmado con una versión anterior deja de servir en la
  siguiente petición, en cualquier dispositivo.
- **`sesionesActivas` (`jti`)** — invalidación POR SESIÓN: cada login genera
  un `jti` único y registra una entrada en `Usuario.sesionesActivas` (máx.
  8, con expiración). `logout()` retira solo la entrada de esa sesión — no
  cierra las demás. Tokens sin `jti` (formato anterior a esta función) se
  siguen gobernando solo por `tokenVersion` hasta que expiran de forma
  natural — es la única vía para no forzar un cierre de sesión masivo el
  día que se cambió esto.
- **Contraseñas**: bcrypt, 12 rondas, `DUMMY_HASH` para comparación en
  tiempo constante cuando el usuario no existe (anti-timing/anti-
  enumeración). Bloqueo de cuenta tras 5 intentos fallidos (15 min),
  independiente del rate-limit por IP.
- **Reset de contraseña**: token de un solo uso, hash SHA-256 (nunca el
  valor plano) en `PasswordResetToken`, expira en 1h con TTL index de Mongo
  (`expireAfterSeconds:0` sobre `expira_en`). Pedir un reset nuevo invalida
  cualquier token anterior sin usar.

## 2. Autorización (RBAC)

- **Catálogo**: `Rol` (con `esSuperAdmin` como bypass total) + `Permiso`
  (`modulo:accion`), sembrado desde `seedData/rbac.data.js` al arrancar
  (`sincronizarCatalogoSistema()`, aditivo — nunca pisa asignaciones
  existentes).
- **`requierePermiso(...codigos)`** (`middleware/permisos.js`): exige uno
  de los códigos, con bypass automático si `esSuperAdmin`.
- **`soloAdmin`** (`middleware/auth.js`): reservado para lo más sensible
  (borrado de usuarios, purga de auditoría/histórico, roles, `DELETE
  /equipos` y `/mantenimientos` del módulo legado) — no es delegable vía
  permiso.
- **Módulo legado (`mantenimiento.routes.js`)**: gobierna con un flag
  binario (`Usuario.modulos`, `requireModulo`), sin granularidad entre
  técnico y supervisor — deuda técnica reconocida y documentada en el
  propio `Usuario.js`. Se restringió al mínimo posible (Fase 4, auditoría
  2026-08-22) para las dos acciones irreversibles (`DELETE`), sin migrar
  todo el módulo al RBAC granular.
- **Elevación de privilegio protegida**: solo un Super Admin puede otorgar
  o quitar `esSuperAdmin` a un rol — `roles:gestionar` administra roles
  normales pero no puede fabricar uno de nivel Super Admin
  (`roles.service.js#exigirSuperAdminParaNivelSuperAdmin`).

## 3. Integridad referencial — Grupo A / Grupo B

Mongoose no tiene claves foráneas reales. Cada colección con
`ref: 'Usuario'` se clasifica en uno de dos grupos (ver
`Backend/src/modules/usuarios/usuarios.eliminacion.js` para la lista
completa y actualizada):

- **Grupo A — estado personal/de sesión**: `Notificacion`,
  `EnvioNotificacion`, `PushSubscription`, `EmailCuenta`,
  `EmailConexionSolicitud`, `PreferenciaIA`, `PreferenciaNotificacion`,
  `MemoriaCopiloto`, `ConversacionCopiloto`, `PasswordResetToken`. Sin
  valor institucional una vez que la cuenta se elimina de verdad — se
  cascade-delete junto con el `Usuario`.
- **Grupo B — historial institucional**: `RegistroAuditoria`,
  `Requerimiento`, `ReporteDano`, `Ausencia`, `Mantenimiento` (y sus
  sub-documentos: evidencias, materiales, horas, mensajes...),
  `Hallazgo`, `BitacoraEntrada`, `ArticuloConocimiento`, todo el módulo
  SIG, `EstadoPlataforma`, `EventoPlataforma`. El ERP es del Terminal, no
  del empleado — este historial debe sobrevivir a la persona.

**Regla**: un usuario con CUALQUIER documento en Grupo B no puede
eliminarse físicamente — solo desactivarse (`Usuario.estado='inactivo'`).
El hard-delete (`DELETE /usuarios/:id`) exige, en orden: no auto-borrado →
no vaciar el último Super Admin activo → usuario ya inactivo →
reautenticación → conteo de referencias en Grupo B (0, o se rechaza con
409 y el detalle) → cascade-delete transaccional del Grupo A + el propio
`Usuario`.

Si agregas un modelo nuevo con `ref: 'Usuario'`, clasifícalo en uno de los
dos grupos — ver `docs/DEFINITION-OF-DONE.md` §4.

## 4. Almacenamiento de archivos

- **Autorización por-recurso, no solo por-sesión**: los archivos de
  `mantenimiento_evidencias/` y `mantenimientos/` se sirven vía endpoints
  autenticados que verifican que el archivo pedido pertenece de verdad al
  recurso (`ordenes.service.js#obtenerRutaEvidencia`,
  `mantenimientos.controller.js#archivoPdf`) — nunca vía `express.static`
  directo (eso servía cualquier archivo a cualquier usuario con sesión,
  sin importar de qué orden/mantenimiento era).
- **Path traversal**: `utils/streamArchivo.js#enviarArchivoSeguro` rechaza
  cualquier nombre con `/`, `\`, `..`, y resuelve la ruta final para
  confirmar que sigue DENTRO de la carpeta base antes de tocar el
  filesystem.
- **Validación de contenido real**: `utils/validarContenidoArchivo.js`
  sniffea la firma real del archivo (magic bytes, vía `file-type`)
  DESPUÉS de multer, y lo rechaza si no coincide con la categoría
  declarada — el `Content-Type` que manda el navegador no es de fiar por
  sí solo. Aplicado a los uploads a disco local (mantenimiento). Los
  uploads a Cloudinary (ausencias, daños, firma de perfil) no tienen esta
  capa — mitigado por Cloudinary reprocesando/re-sirviendo como imagen.
- **Nombres de archivo**: siempre generados por el servidor
  (`Date.now()_nombreOriginalSaneado`), nunca el nombre crudo que manda el
  cliente.

## 5. Política de operaciones destructivas

Toda operación que borra datos permanentemente, en cualquier capa del
sistema, sigue el mismo criterio:

1. **Gate de permiso explícito** — `soloAdmin` para lo más sensible
   (usuarios, roles, purgas), `requierePermiso` específico para el resto.
2. **Reautenticación** cuando la acción es irreversible y de alto impacto
   (borrado físico de usuario, purga masiva de histórico) —
   `utils/reautenticacion.js`.
3. **Verificar antes de borrar** — nunca un `deleteMany`/`findByIdAndDelete`
   suelto sin comprobar primero qué depende de ese dato:
   - Usuarios: conteo de referencias en Grupo B (§3).
   - Auditoría: exportar y VERIFICAR el archivo (conteo real, no solo "no
     lanzó error") antes de `deleteMany` — ver
     `auditoria.archivado.js`/`auditoria.service.js#purgarAntiguos`.
   - Purga masiva de histórico de negocio (`backup/purga.service.js`):
     ofrece un Excel de "rescate" con exactamente lo que se va a borrar,
     ANTES de confirmar.
4. **Todo o nada cuando hace falta** — si el borrado toca varias
   colecciones relacionadas con la intención de "borrar todo el rastro de
   una vez" (cascade-delete de usuario), va en una transacción de Mongoose.
   Si el borrado es de una sola colección/documento, no hace falta.
5. **Auditar la purga misma** — cada corrida automática de purga deja su
   propio registro (`RegistroPurgaAuditoria`, separado de
   `RegistroAuditoria` para no crear una purga recursiva de sí misma).
6. **Scripts de terminal**: cualquier script bajo `Backend/scripts/` que
   escriba en Mongo debe usar `guardaProduccion()`
   (`scripts/lib/guardaProduccion.js`) — bloquea la ejecución si
   `NODE_ENV=production` salvo `--confirmar-produccion SI-PRODUCCION`
   exacto. `npm run verify` detecta automáticamente un script nuevo que
   escriba en Mongo sin este guard.
7. **Nunca hard-delete de datos institucionales por defecto** — la opción
   por defecto para "quitar algo" es siempre desactivar/archivar, nunca
   borrar. El borrado físico es la excepción explícita, no la regla.

## 6. Concurrencia y transacciones — cuándo sí, cuándo no

| Patrón | Ejemplo real | ¿Transacción? |
|---|---|---|
| Compare-and-swap de un solo documento | `plataforma.service.js` (cerrar/abrir mantenimiento) | 🟢 No — `findOneAndUpdate` con el estado en el filtro ya es atómico y más barato |
| Efectos secundarios best-effort deliberados | `notificaciones.service.js#notificar()` (push/email pueden fallar independientemente) | 🟢 No — una transacción rompería la resiliencia intencional |
| Migraciones idempotentes | `scripts/migrate-rbac-roles.js` | 🟡 Podría beneficiarse, pero un fallo parcial se autocorrige al re-ejecutar — no es una necesidad real |
| Cascade-delete con intención "todo o nada" | `usuarios.eliminacion.js#eliminarUsuarioDefinitivamente` | 🔴 Sí — un fallo a mitad de camino dejaría un estado ambiguo |
| Archivar-antes-de-purgar | `auditoria.archivado.js` | 🔴 Atomicidad sí, pero NO vía transacción Mongo — el archivo vive fuera de la BD; se logra verificando éxito antes del `deleteMany` |

No agregues transacciones por defecto — la mayoría de las operaciones de
este proyecto son de un solo documento, o deliberadamente tolerantes a
fallo parcial. Antes de envolver algo en una transacción, confirma que el
fallo a mitad de camino realmente dejaría el sistema en un estado peor que
no hacer nada.

**Riesgo residual conocido y no cerrado**: los flujos de aprobación de
`danos`/`requerimientos`/`ausencias` usan el patrón "leer → comprobar
estado en memoria → guardar" (no atómico) — dos peticiones casi
simultáneas (doble clic, dos pestañas) podrían, en teoría, ambas pasar la
comprobación antes de que la primera escriba. Es una ventana pequeña, sin
evidencia de que haya causado un problema real, y no se cerró en esta
ronda de trabajo (fuera del alcance explícito). Si se decide cerrarla,
seguir el mismo patrón CAS que ya usa `plataforma.service.js`.

## 7. Auditoría y retención

- `RegistroAuditoria`: registro de auditoría de negocio (quién hizo qué),
  con snapshot desnormalizado (`usuarioNombre`) para sobrevivir a que el
  usuario se elimine.
- Retención por defecto: `AUDITORIA_RETENCION_MESES` (3 meses) — **no hay
  evidencia normativa en el proyecto sobre cuál debería ser el número
  correcto**; es una decisión pendiente del equipo/legal, no técnica.
- Purga automática (`auditoria.worker.js`, cada
  `AUDITORIA_WORKER_INTERVALO_MS`, 24h por defecto): archiva a NDJSON
  local (verificado) antes de purgar — ver §5.

## 8. Backup y recuperación

- `Backend/src/modules/backup/backup.service.js` (panel admin): export a
  Excel/CSV/JSON de colecciones seleccionadas — herramienta administrativa,
  **no** un backup de desastre.
- `scripts/backup/respaldar.js`: backup real — `mongodump` completo →
  cifrado AES-256-GCM → hash SHA-256 → manifiesto → rotación local → sube
  a S3-compatible si está configurado. Pensado para cron del sistema
  operativo (nunca un worker dentro del proceso Node, para no duplicar el
  worker de notificaciones que ya vive ahí — ver
  `deploy/ecosystem.config.cjs`).
- `scripts/backup/restaurar.js`: exige `--destino` explícito (nunca cae a
  `MONGO_URI` de `.env` por defecto), verifica el hash contra el
  manifiesto antes de descifrar.
- `scripts/verificar-restore.js`: smoke test post-restore (conexión,
  usuarios activos, RBAC intacto, referencias sanas vía populate).
- Procedimiento completo: `docs/OPERACION-RESTORE.md`.

## 9. Configuración de producción

- `Backend/src/config/env.js` **se niega a arrancar** si, con
  `NODE_ENV=production`, `CORS_ORIGIN`/`FRONTEND_URL`/`API_PUBLIC_URL`/
  `FILES_PUBLIC_URL` faltan o apuntan a `localhost`/`127.0.0.1` — convierte
  el error de configuración más común (URLs de dev olvidadas) en un fallo
  de arranque explícito, no un despliegue silenciosamente roto.
- Plantillas por entorno: `.env.example` (genérica),
  `.env.development.example`, `.env.production.example`.

## 10. Verify permanente

`npm run verify` (`scripts/verificar-produccion.js`) — checks estáticos y
rápidos, sin tocar la base de datos real:

1. Variables de entorno / URLs de producción (reutiliza `config/env.js`).
2. `.env` nunca versionado en git.
3. Sin secretos/credenciales hardcodeadas en `src/`.
4. Todo router de módulo menciona `verificarToken`.
5. Scripts que escriben en Mongo usan `guardaProduccion()`.
6. Sin vulnerabilidades críticas/altas en dependencias de producción
   (`npm audit`).
7. `BACKUP_CIFRADO_CLAVE` configurada (si `NODE_ENV=production`).
8. Sin `console.log`/`error` que mencionen password/token/secret cerca.

`npm run predeploy` corre `npm test && npm run verify` en secuencia. Los
checks marcados 🔴 bloquean (exit 1); los 🟡 advierten sin bloquear
(requieren juicio humano, son heurísticas, no un analizador perfecto).

## 11. Límites conocidos (deuda técnica reconocida, no oculta)

- Módulo `mantenimiento` legado sin RBAC granular en lectura/creación
  (solo el `DELETE` se restringió).
- Ventanas de carrera no-CAS en `danos`/`requerimientos`/`ausencias` (§6).
- Uploads a Cloudinary sin validación de magic-bytes (mitigado por
  Cloudinary, no verificado directamente).
- `eliminarEquipo` (módulo legado) sigue borrando en cascada TODO el
  historial de `Mantenimiento` de ese equipo — ahora solo Super Admin
  puede activarlo, pero el borrado en sí sigue siendo destructivo.
- Backup local únicamente mientras no se configure `BACKUP_S3_*` — sin
  segunda copia fuera del VPS.
- La ruta de subida a S3 (`scripts/backup/s3.js`) no está verificada
  contra un proveedor real — usa la API estándar de AWS SDK, pero nunca se
  probó una subida de punta a punta.
- Sin logging estructurado ni servicio externo de alertas (`console.*` a
  archivo de PM2 únicamente) — un error en producción no genera una
  alerta activa, hay que ir a mirar el log.
- Sin CI/CD — el despliegue y la ejecución de `npm run verify`/`npm test`
  son manuales hoy.
