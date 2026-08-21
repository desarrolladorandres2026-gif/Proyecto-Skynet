import dns from 'node:dns'
import mongoose from 'mongoose'
import { env } from './env.js'

const DNS_FALLBACK_SERVERS = ['8.8.8.8', '1.1.1.1']

export async function connectDB() {
  mongoose.connection.on('error', (err) => {
    console.error('❌  Error de conexión a MongoDB:', err.message)
  })

  const opciones = {
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    serverSelectionTimeoutMS: env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    socketTimeoutMS: env.MONGO_SOCKET_TIMEOUT_MS,
  }

  try {
    await mongoose.connect(env.MONGO_URI, opciones)
  } catch (err) {
    // Acotado estrictamente a fallos de resolución SRV (querySrv ECONNREFUSED
    // es el código real que devuelve Node cuando el resolver no soporta SRV).
    // ECONNREFUSED por sí solo puede ser Mongo caído, firewall, etc. — no debe
    // disparar un cambio de DNS global del proceso que enmascare la causa real.
    const esFalloSRV = err.message?.includes('querySrv')
    const yaUsaFallback = JSON.stringify(dns.getServers()) === JSON.stringify(DNS_FALLBACK_SERVERS)

    if (!esFalloSRV || yaUsaFallback) throw err

    console.warn(`⚠️  Fallo la resolución DNS del cluster (${err.message}), reintentando con DNS público (8.8.8.8, 1.1.1.1)...`)
    dns.setServers(DNS_FALLBACK_SERVERS)
    await mongoose.connect(env.MONGO_URI, opciones)
  }

  console.log('✅  Conectado a MongoDB')
}
