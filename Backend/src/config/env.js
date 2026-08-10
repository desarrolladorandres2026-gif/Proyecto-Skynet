import dotenv from 'dotenv'

dotenv.config()

const required = ['MONGO_URI', 'JWT_SECRET']
const missing = required.filter((key) => !process.env[key])

if (missing.length) {
  throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`)
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3001,
  MONGO_URI: process.env.MONGO_URI,
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
