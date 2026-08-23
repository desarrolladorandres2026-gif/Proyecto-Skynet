import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config()

const required = ['MONGO_URI', 'JWT_SECRET']
const missing = required.filter((key) => !process.env[key])

// Variables que en desarrollo caen a un default de localhost (para poder
// arrancar sin configurar nada), pero que en producción NUNCA deben quedarse
// en ese default: CORS_ORIGIN gobierna qué origen puede llamar a la API, y
// FRONTEND_URL/API_PUBLIC_URL/FILES_PUBLIC_URL se usan para construir
// enlaces ABSOLUTOS que salen del sistema (emails de reset/notificaciones,
// baja de suscripción, URLs de archivos) — si apuntan a localhost en
// producción, esos enlaces quedan rotos para cualquier usuario real aunque
// el servidor arranque "bien". Ver auditoría de producción 2026-08-22.
const CAMPOS_URL_PRODUCCION = ['CORS_ORIGIN', 'FRONTEND_URL', 'API_PUBLIC_URL', 'FILES_PUBLIC_URL']

if (process.env.NODE_ENV === 'production') {
  for (const key of CAMPOS_URL_PRODUCCION) {
    const value = process.env[key]
    if (!value) {
      missing.push(key)
    } else if (/localhost|127\.0\.0\.1/i.test(value)) {
      throw new Error(
        `${key} apunta a localhost/127.0.0.1 en producción (valor actual: "${value}"). ` +
          'Corrige Backend/.env en el servidor antes de arrancar — con este valor, los enlaces ' +
          'que Skynet envía a usuarios reales (emails, archivos) quedarían rotos.'
      )
    }
  }
}

if (missing.length) {
  throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`)
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3001,
  MONGO_URI: process.env.MONGO_URI,
  // El backend corre como UN SOLO proceso Node (ver deploy/ecosystem.config.cjs,
  // exec_mode 'fork', instances 1) con límite de memoria de 400M en un VPS
  // compartido — no necesita ni le conviene el pool por defecto de Mongoose
  // (maxPoolSize: 100). 20 alcanza de sobra para los ~10-15 queries en
  // paralelo que dispara una carga de dashboard más el resto de tráfico
  // concurrente, sin arriesgarse a agotar el límite de conexiones del cluster
  // de Atlas si el tier es bajo.
  MONGO_MAX_POOL_SIZE: Number(process.env.MONGO_MAX_POOL_SIZE) || 20,
  // Default de Mongoose es 30s: si Atlas no está disponible, cada request que
  // toque Mongo se queda colgado medio minuto antes de fallar. 10s falla
  // notoriamente más rápido sin ser tan agresivo como para dar falsos
  // negativos ante una conexión momentáneamente lenta.
  MONGO_SERVER_SELECTION_TIMEOUT_MS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10_000,
  // Deja margen a operaciones legítimamente largas (backup completo, export
  // de Excel de hasta 20k filas) sin dejar un socket colgado indefinidamente
  // si la red hacia Atlas se cae a mitad de una operación.
  MONGO_SOCKET_TIMEOUT_MS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45_000,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: process.env.EMAIL_PORT,
  EMAIL_SECURE: process.env.EMAIL_SECURE === 'true',
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  // Dirección que aparece en "De:". Separada de EMAIL_USER porque con un
  // proveedor transaccional (Resend/SES/Postmark) el usuario SMTP no es una
  // dirección de correo real (p. ej. Resend usa literalmente "resend" como
  // usuario) — cae a EMAIL_USER si no se define, para no romper el caso
  // Gmail donde ambos coinciden.
  EMAIL_FROM: process.env.EMAIL_FROM || process.env.EMAIL_USER,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  // Usado para construir enlaces absolutos hacia el propio backend en emails
  // (ej. el enlace de baja de notificaciones, que el usuario abre desde su
  // cliente de correo sin sesión iniciada, así que no puede ser una ruta
  // relativa del SPA).
  API_PUBLIC_URL: process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}/api`,
  VAPID_EMAIL: process.env.VAPID_EMAIL,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  NOTIF_WORKER_INTERVALO_MS: Number(process.env.NOTIF_WORKER_INTERVALO_MS) || 5000,
  NOTIF_WORKER_LOTE: Number(process.env.NOTIF_WORKER_LOTE) || 25,
  // Worker de la prueba de comunicaciones (ver
  // modules/copiloto/copiloto.despliegue.worker.js). Este intervalo NO
  // determina lo que tarda en arrancar el envío en el caso normal: al
  // encolar se despierta el worker en el acto. Es la red de seguridad para
  // un trabajo que quedó pendiente porque el proceso se reinició justo
  // después de encolarlo, así que 5 s es holgado de sobra.
  DESPLIEGUE_WORKER_INTERVALO_MS: Number(process.env.DESPLIEGUE_WORKER_INTERVALO_MS) || 5000,
  // Ventana móvil de retención de auditoría (ver auditoria.worker.js): se
  // borran los registros con más antigüedad que esto, no toda la colección
  // de golpe, para que siempre quede historial reciente disponible.
  AUDITORIA_RETENCION_MESES: Number(process.env.AUDITORIA_RETENCION_MESES) || 3,
  AUDITORIA_WORKER_INTERVALO_MS: Number(process.env.AUDITORIA_WORKER_INTERVALO_MS) || 24 * 60 * 60 * 1000,
  // Destino local donde se archivan los registros de auditoría ANTES de
  // purgarlos (ver modules/auditoria/auditoria.archivado.js). Default
  // funcional out-of-the-box (no requiere credenciales externas) — si se
  // configura almacenamiento externo real (BACKUP_S3_*, ver
  // .env.production.example), esta carpeta local sigue siendo el paso
  // previo antes de subir; no se elimina el archivo local automáticamente.
  AUDITORIA_ARCHIVO_DIR: process.env.AUDITORIA_ARCHIVO_DIR || path.join(process.env.STORAGE_ROOT || './storage', 'auditoria-archivada'),

  // ── Backup real (scripts/backup/, ver docs/OPERACION-RESTORE.md) ──────────
  // BACKUP_CIFRADO_CLAVE no tiene default: es un secreto y no hay un valor
  // "seguro por defecto" para una clave de cifrado — si falta,
  // scripts/backup/respaldar.js se niega a correr con un mensaje claro (ver
  // el propio script), en vez de cifrar con algo inventado o correr sin
  // cifrar. Genera una con: openssl rand -hex 32. BACKUP_S3_* son aparte y
  // opcionales: habilitan subir el dump cifrado a almacenamiento externo
  // S3-compatible — si faltan, el script simplemente no sube nada y lo dice
  // explícitamente, nunca falla silenciosamente fingiendo que sí subió.
  BACKUP_CIFRADO_CLAVE: process.env.BACKUP_CIFRADO_CLAVE,
  BACKUP_S3_ENDPOINT: process.env.BACKUP_S3_ENDPOINT,
  BACKUP_S3_BUCKET: process.env.BACKUP_S3_BUCKET,
  BACKUP_S3_REGION: process.env.BACKUP_S3_REGION || 'auto',
  BACKUP_S3_ACCESS_KEY_ID: process.env.BACKUP_S3_ACCESS_KEY_ID,
  BACKUP_S3_SECRET_ACCESS_KEY: process.env.BACKUP_S3_SECRET_ACCESS_KEY,
  // Carpeta local donde quedan los dumps cifrados (siempre, suban o no a S3).
  BACKUP_LOCAL_DIR: process.env.BACKUP_LOCAL_DIR || path.join(process.env.STORAGE_ROOT || './storage', 'backups'),
  // Cuántos dumps locales conservar antes de borrar los más viejos (rotación
  // simple). No sustituye la retención real en almacenamiento externo.
  BACKUP_RETENCION_LOCAL: Number(process.env.BACKUP_RETENCION_LOCAL) || 7,
  // Publicación automática del módulo Cuestionarios Programados (ver
  // modules/sig_pregunta_dia/sig.worker.js). 60s es suficiente resolución
  // para "publicar a la hora programada" (a diferencia del envío de
  // notificaciones, que sí necesita los 5s de NOTIF_WORKER_INTERVALO_MS).
  SIG_WORKER_INTERVALO_MS: Number(process.env.SIG_WORKER_INTERVALO_MS) || 60_000,
  SIG_WORKER_LOTE: Number(process.env.SIG_WORKER_LOTE) || 200,
  // ── Estado de plataforma / mantenimiento ──────────────────────────────
  // Cada cuánto el worker persiste las transiciones (iniciar/finalizar) y
  // dispara las notificaciones. NO es la resolución del bloqueo: el gate se
  // deriva del reloj en cada petición (ver derivarEstado en
  // plataforma.service.js), así que subir este número no deja a nadie
  // trabajando después de la hora anunciada — solo retrasa el aviso.
  // 20s da una notificación de inicio razonablemente puntual sin castigar al
  // VPS compartido con una consulta cada segundo.
  PLATAFORMA_WORKER_INTERVALO_MS: Number(process.env.PLATAFORMA_WORKER_INTERVALO_MS) || 20_000,
  // Antelación del aviso "Skynet entra en mantenimiento en N minutos". 15 min
  // es el punto en que a alguien todavía le da tiempo de cerrar lo que está
  // haciendo sin que el aviso llegue tan pronto que se olvide.
  PLATAFORMA_AVISO_PREVIO_MIN: Number(process.env.PLATAFORMA_AVISO_PREVIO_MIN) || 15,
  STORAGE_ROOT: process.env.STORAGE_ROOT || './storage',
  FILES_PUBLIC_URL: process.env.FILES_PUBLIC_URL || 'http://localhost:3001/storage',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  // Copiloto (IA): API key gratuita de Google AI Studio. Opcional a
  // propósito (no está en `required`) — sin ella el módulo "copiloto" sigue
  // activable pero /copiloto/chat responde un error claro en vez de tumbar
  // el arranque del servidor, igual que Cloudinary.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  // Búsqueda web del copiloto. Las DOS son opcionales y se eligen por orden de
  // preferencia (Tavily > Brave); sin ninguna, la herramienta cae al modo
  // básico de DuckDuckGo, que responde bastante peor pero no rompe nada. Ver
  // copiloto.busqueda.js para el detalle de por qué están escalonadas así.
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY,
  // Email — conexión OAuth a Gmail (opcional, igual que GEMINI_API_KEY: sin
  // esto el módulo "email" sigue activable, pero "Conectar" responde un
  // error claro en vez de tumbar el arranque). Credenciales de Google Cloud
  // Console (OAuth client de tipo "Web application").
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3001}/api/email/oauth/gmail/callback`,
  // Cifra el refresh token de Gmail en Mongo (utils/cifrado.js). Genera con:
  // openssl rand -hex 32
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
}
