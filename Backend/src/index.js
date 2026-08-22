import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import mongoSanitize from 'express-mongo-sanitize'
import compression from 'compression'
import { env } from './config/env.js'
import { connectDB } from './config/db.js'
import routes from './routes/index.js'
import { sincronizarCatalogoSistema } from './modules/sistema/sistema.service.js'
import { sincronizarConfiguracionSLA } from './modules/mantenimiento/ordenes.service.js'
import { iniciarWorkerNotificaciones } from './modules/notificaciones/notificaciones.worker.js'
import { iniciarWorkerAuditoria } from './modules/auditoria/auditoria.worker.js'
import { iniciarWorkerSig } from './modules/sig_pregunta_dia/sig.worker.js'
import { iniciarWorkerPlataforma } from './modules/plataforma/plataforma.worker.js'
import { evaluarTransiciones } from './modules/plataforma/plataforma.service.js'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'
import { verificarToken } from './middleware/auth.js'
import { bloqueoMantenimiento } from './middleware/mantenimientoPlataforma.js'
import { requestId } from './middleware/requestId.js'
import { monitorLentos } from './middleware/monitorLentos.js'

const app = express()

// En producción hay UN salto de proxy delante (nginx -> 127.0.0.1:3001, ver
// deploy/nginx/skynetttn.conf), que reenvía la IP real en X-Forwarded-For. Sin
// esto, Express resuelve req.ip como 127.0.0.1 para TODAS las peticiones y los
// rate limiters de middleware/rateLimit.js (que usan req.ip como clave) tratan
// a toda la organización como un solo cliente: 10 intentos de login por
// quincena de hora para el Terminal entero, no por persona.
//
// El valor 1 es deliberado (no `true`): confía exactamente en el salto de
// nginx y en ninguno más, así que un cliente no puede falsear su IP mandando
// su propio X-Forwarded-For. Solo se activa en producción porque en desarrollo
// no hay proxy delante y confiar en la cabecera ahí sí permitiría falsearla.
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
}

app.use(requestId)
app.use(monitorLentos)

// Cabeceras de seguridad (X-Content-Type-Options, HSTS, X-Frame-Options, etc.).
app.use(helmet())

// Comprime las respuestas JSON (dashboard, reportes, listados) que hoy viajan
// sin comprimir. Se excluyen explícitamente los binarios que YA vienen
// comprimidos internamente (xlsx/zip de exportaciones y backup, PDFs) y las
// imágenes: recomprimirlos con gzip no reduce su tamaño y solo gasta CPU del
// proceso. Las fotos/firmas/evidencias en Cloudinary ni siquiera pasan por
// aquí (se sirven directo desde res.cloudinary.com), así que no las toca este
// filtro — se excluyen igual por si algún día vuelve a haber imágenes locales
// bajo /storage.
app.use(
  compression({
    filter: (req, res) => {
      const contentType = String(res.getHeader('Content-Type') || '')
      if (/spreadsheetml|zip|pdf|^image\//.test(contentType)) return false
      return compression.filter(req, res)
    },
  })
)

// Los orígenes de desarrollo (Vite dev/preview) solo se agregan fuera de
// producción: en el VPS no hay razón para que el navegador de un atacante
// pueda alegar venir de un localhost que ni siquiera es el suyo.
const corsOrigins =
  env.NODE_ENV === 'production'
    ? [env.CORS_ORIGIN].filter(Boolean)
    : [env.CORS_ORIGIN, 'http://localhost:5173', 'http://localhost:4173'].filter(Boolean)

app.use(
  cors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Necesario para que el navegador adjunte/reciba la cookie httpOnly del
    // token en peticiones cross-origin (frontend y backend en puertos/dominios
    // distintos). Solo es seguro combinado con un origin explícito (arriba),
    // nunca con '*'.
    credentials: true,
  })
)

// Límite de cuerpo reducido (antes 100 MB): frena el DoS por payloads enormes en
// rutas sin autenticar como /login. Las subidas de archivos van por multer
// (multipart) con sus propios límites, así que no se ven afectadas.
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))
app.use(cookieParser())

// Elimina claves con '$' y '.' de body, query y params: defensa en profundidad
// contra inyección de operadores NoSQL (complementa la validación por endpoint).
app.use(mongoSanitize())

// Gate global de mantenimiento de plataforma. Va AQUÍ, después de
// cookieParser (lo necesita para leer la cookie de sesión al evaluar la
// excepción de administrador) y ANTES de /storage y /api: así cubre TODA la
// superficie del backend de una sola vez, incluidos los documentos internos,
// en vez de depender de que cada router nuevo se acuerde de montarlo.
//
// Cuando no hay mantenimiento activo (el caso normal) resuelve con una
// lectura de caché en memoria y llama a next() — no agrega ni una consulta a
// Mongo al camino feliz.
app.use(bloqueoMantenimiento)

// Documentos internos (PDFs de OT, evidencias de mantenimiento): requieren
// sesión igual que el resto de la API. Antes se servían con express.static
// sin ningún control de acceso — cualquiera con la URL (los nombres son
// predecibles: `Date.now()_nombre`) podía descargarlos sin login.
app.use('/storage', verificarToken, express.static(env.STORAGE_ROOT))

app.use('/api', routes)

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }))

app.use(notFoundHandler)
app.use(errorHandler)

async function start() {
  await connectDB()

  // Upserta el catálogo de módulos (modulos.data.js) y los permisos nuevos de
  // rbac.data.js sin pisar estados ni asignaciones existentes: un módulo o
  // permiso agregado en código queda disponible al primer arranque.
  await sincronizarCatalogoSistema()
  // Crea las filas de SLA por defecto que falten (CMMS Fase 1); nunca pisa un
  // umbral ya ajustado a mano por un administrador.
  await sincronizarConfiguracionSLA()

  // Cola de notificaciones (email/push): ver notificaciones.worker.js. Corre
  // dentro de este mismo proceso — un solo temporizador, sin infraestructura
  // adicional (ver docs/notificaciones/README.md para la decisión de no usar
  // Redis/BullMQ a esta escala).
  iniciarWorkerNotificaciones()

  // Limpieza periódica de auditoría (ventana móvil de 3 meses por defecto):
  // ver auditoria.worker.js. Mismo patrón que el worker de notificaciones,
  // sin infraestructura adicional.
  iniciarWorkerAuditoria()

  // Publicación automática del módulo Cuestionarios Programados: ver
  // sig.worker.js. Mismo patrón que los dos workers de arriba, sin
  // infraestructura adicional (no hay node-cron en el proyecto).
  iniciarWorkerSig()

  // Estado de plataforma: persiste las transiciones programadas (iniciar /
  // finalizar), registra el historial y dispara las notificaciones.
  //
  // La evaluación INMEDIATA antes de arrancar el temporizador es la que hace
  // que el mantenimiento sobreviva a un reinicio de Node/PM2: si el proceso
  // estuvo caído justo cuando vencía la ventana, esto lo resuelve al arrancar
  // en vez de dejar la plataforma bloqueada hasta el primer tick (o, peor,
  // abierta durante una ventana que ya debería estar activa).
  //
  // Va dentro de un try/catch propio: un fallo aquí no debe impedir que el
  // servidor levante — el gate de cada petición deriva el estado por su
  // cuenta, así que la plataforma se comporta bien aunque esta pasada falle.
  try {
    await evaluarTransiciones()
  } catch (err) {
    console.error('No se pudieron evaluar las transiciones de mantenimiento al arrancar:', err.message)
  }
  iniciarWorkerPlataforma()

  const server = app.listen(env.PORT, () => {
    console.log(`\n🚀  Backend Skynet corriendo en http://localhost:${env.PORT}`)
    console.log(`📋  API disponible en http://localhost:${env.PORT}/api\n`)
  })

  // Corta conexiones colgadas (slowloris, cliente que nunca termina de mandar
  // el body, etc.) a los 30s en vez de dejarlas abiertas indefinidamente. El
  // backup completo (el endpoint más lento del sistema) tarda segundos, no
  // minutos, así que 30s deja margen de sobra sin dejar la puerta abierta.
  server.timeout = 30_000

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // node --watch en Windows puede dejar un proceso anterior sin liberar el
      // puerto al reiniciar tras un cambio de archivo. Falla con un mensaje
      // claro en vez de un stack trace, en vez de cerrar el proceso siempre
      // (así --watch puede seguir esperando cambios en vez de morir del todo).
      console.error(`\n❌  El puerto ${env.PORT} ya está en uso por otro proceso.`)
      console.error(`    Cierra ese proceso (en Windows: netstat -ano | findstr :${env.PORT}, luego taskkill /PID <pid> /F) y vuelve a intentarlo.\n`)
      return
    }
    throw err
  })
}

// Sin este .catch(), un fallo de start() (p. ej. connectDB() lanzando por
// credenciales inválidas, IP no permitida en Atlas, o cualquier error que no
// sea el fallback de DNS SRV que ya maneja db.js) terminaba en un unhandled
// promise rejection: un stack trace poco claro y, según versión/flags de
// Node, el proceso podía quedar colgado en vez de terminar. Como es un fallo
// de arranque (Mongo no disponible, no un error de un request ya en marcha),
// lo correcto es terminar el proceso de forma controlada — PM2 (ver
// deploy/ecosystem.config.cjs) lo reinicia solo; no hay reintento manual
// aquí a propósito, para no encadenar conexiones/procesos si Mongo sigue
// caído.
start().catch((err) => {
  console.error('❌  El backend no pudo arrancar:', err.message)
  process.exit(1)
})
