/**
 * Bloquea scripts que escriben/borran datos cuando detectan NODE_ENV=production,
 * salvo confirmación explícita e inequívoca. Se ejecuta ANTES de connectDB()
 * en cada script que lo usa, así que ni siquiera llega a abrir conexión a
 * Mongo si está bloqueado.
 *
 * No reemplaza la separación real de ambientes (un usuario de Atlas sin
 * permisos sobre la base de producción es la protección de fondo — ver
 * Backend/.env.development.example) — es una segunda capa de defensa en el
 * propio código para el caso en que alguien corra un script local con
 * NODE_ENV mal configurado.
 *
 * Uso:
 *   import { guardaProduccion } from './lib/guardaProduccion.js'
 *   guardaProduccion({ script: 'seed.js', operacion: 'crear usuarios con contraseñas conocidas' })
 *   await connectDB()
 *   ...
 *
 * Para ejecutar de verdad contra NODE_ENV=production (excepcional, con
 * conocimiento de causa):
 *   NODE_ENV=production node scripts/seed.js --confirmar-produccion SI-PRODUCCION
 */
export function guardaProduccion({ script, operacion }) {
  if (process.env.NODE_ENV !== 'production') return

  // Flag Y valor exactos, sin variantes ambiguas ("si", "yes", "true" no
  // cuentan): el objetivo es que confirmar sea un acto deliberado, no algo
  // que un script de automatización pueda pasar por accidente con un flag
  // genérico de "sí a todo".
  const idxFlag = process.argv.indexOf('--confirmar-produccion')
  const confirmado = idxFlag !== -1 && process.argv[idxFlag + 1] === 'SI-PRODUCCION'

  if (confirmado) {
    console.warn(
      `\n⚠️  ${script}: ejecutando "${operacion}" con NODE_ENV=production y confirmación explícita.\n`
    )
    return
  }

  console.error(
    `\n🛑  BLOQUEADO — ${script}\n` +
      `    Operación: ${operacion}\n` +
      `    Entorno detectado: NODE_ENV=production\n` +
      `    Este script modifica datos y no debe correr contra producción sin\n` +
      `    confirmación explícita. Verifica primero que en verdad quieres apuntar a\n` +
      `    esa base de datos (revisa MONGO_URI en tu .env actual).\n\n` +
      `    Si de verdad es intencional, vuelve a ejecutarlo agregando:\n` +
      `      --confirmar-produccion SI-PRODUCCION\n`
  )
  process.exit(1)
}
