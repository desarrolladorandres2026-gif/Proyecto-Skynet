import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import mongoSanitize from 'express-mongo-sanitize'
import { env } from './config/env.js'
import { connectDB } from './config/db.js'
import routes from './routes/index.js'
import { sincronizarCatalogoSistema } from './modules/sistema/sistema.service.js'
import { sincronizarConfiguracionSLA } from './modules/mantenimiento/ordenes.service.js'
import { iniciarWorkerNotificaciones } from './modules/notificaciones/notificaciones.worker.js'
import { iniciarWorkerAuditoria } from './modules/auditoria/auditoria.worker.js'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'

const app = express()

// Detrás de un proxy/CDN en producción, descomenta para que el rate limiting y
// los logs usen la IP real del cliente (X-Forwarded-For). NO lo actives sin un
// proxy delante: permitiría falsear la IP y saltarse el rate limiting.
// app.set('trust proxy', 1)

// Cabeceras de seguridad (X-Content-Type-Options, HSTS, X-Frame-Options, etc.).
app.use(helmet())

app.use(
  cors({
    origin: [env.CORS_ORIGIN, 'http://localhost:5173', 'http://localhost:4173'].filter(Boolean),
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

app.use('/storage', express.static(env.STORAGE_ROOT))

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

  const server = app.listen(env.PORT, () => {
    console.log(`\n🚀  Backend Skynet corriendo en http://localhost:${env.PORT}`)
    console.log(`📋  API disponible en http://localhost:${env.PORT}/api\n`)
  })

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

start()
