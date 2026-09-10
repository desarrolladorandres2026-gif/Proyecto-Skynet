import winston from 'winston'
import { env } from './env.js'

// Consola siempre (Coolify/PM2 capturan stdout); en producción además en
// formato JSON de una sola línea por evento, más fácil de indexar/filtrar
// que el texto "bonito" que solo importa cuando alguien lo lee a mano en
// desarrollo.
const consoleFormat =
  env.NODE_ENV === 'production'
    ? winston.format.json()
    : winston.format.combine(winston.format.colorize(), winston.format.simple())

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true })),
  transports: [new winston.transports.Console({ format: consoleFormat })],
})
