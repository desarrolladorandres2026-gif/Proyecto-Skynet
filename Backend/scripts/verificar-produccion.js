#!/usr/bin/env node
/**
 * Verify general de producción — protección PERMANENTE para que ninguna
 * funcionalidad nueva se salte seguridad/configuración por descuido. Ver
 * docs/DEFINITION-OF-DONE.md y docs/ARQUITECTURA-SEGURIDAD-E-INTEGRIDAD.md.
 *
 * Checks estáticos y rápidos (no toca la base de datos real, no necesita
 * `mongodump` ni conexión a Atlas) — pensado para correr:
 *   - a mano antes de cada deploy: npm run verify
 *   - como último paso de la Definition of Done de cualquier PR
 *
 * Exit 0 solo si ningún check 🔴 bloqueante falló. Los 🟡 advierten sin
 * bloquear (requieren juicio humano, no son heurísticas 100% precisas).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(RAIZ, 'src')
const SCRIPTS = path.join(RAIZ, 'scripts')

const resultados = []
function registrar({ categoria, nombre, ok, detalle = '', bloqueante = true }) {
  resultados.push({ categoria, nombre, ok, detalle, bloqueante })
}

async function listarArchivos(dir, extension) {
  const salida = []
  async function recorrer(actual) {
    let entradas
    try {
      entradas = await fs.readdir(actual, { withFileTypes: true })
    } catch {
      return
    }
    for (const entrada of entradas) {
      if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue
      const rutaCompleta = path.join(actual, entrada.name)
      if (entrada.isDirectory()) await recorrer(rutaCompleta)
      else if (entrada.name.endsWith(extension)) salida.push(rutaCompleta)
    }
  }
  await recorrer(dir)
  return salida
}

// ── 1. Configuración de entorno ────────────────────────────────────────────
// Reutiliza la validación real de config/env.js (incluida la de producción
// sin localhost, ver Fase 7 de la auditoría 2026-08-22) en vez de duplicar
// la lógica: si env.js no lanza, el entorno actual es válido para arrancar.
async function checkEntorno() {
  try {
    await import('../src/config/env.js')
    registrar({ categoria: 'Entorno', nombre: 'Variables de entorno requeridas / URLs de producción', ok: true })
  } catch (err) {
    registrar({ categoria: 'Entorno', nombre: 'Variables de entorno requeridas / URLs de producción', ok: false, detalle: err.message })
  }
}

// ── 2. .env nunca debe estar versionado ─────────────────────────────────────
function checkEnvNoVersionado() {
  try {
    const rastreados = execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /(^|\/)\.env$|(^|\/)\.env\.[^.]/.test(f) && !f.endsWith('.example'))
    registrar({
      categoria: 'Secretos',
      nombre: '.env no está versionado en git',
      ok: rastreados.length === 0,
      detalle: rastreados.length ? `Archivos rastreados: ${rastreados.join(', ')}` : '',
    })
  } catch (err) {
    registrar({ categoria: 'Secretos', nombre: '.env no está versionado en git', ok: false, detalle: `No se pudo verificar: ${err.message}`, bloqueante: false })
  }
}

// ── 3. Secretos hardcodeados en el código fuente (no en .env) ──────────────
const PATRONES_SECRETOS = [
  { nombre: 'MongoDB URI con credenciales embebidas', regex: /mongodb(\+srv)?:\/\/[^:'"\s]+:[^@'"\s]+@/ },
  { nombre: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/ },
  { nombre: 'Clave privada PEM', regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { nombre: 'Fallback de secreto inseguro (|| "algo")', regex: /JWT_SECRET\s*\|\|\s*['"]/ },
]

async function checkSecretosHardcodeados() {
  const archivos = await listarArchivos(SRC, '.js')
  const hallazgos = []
  for (const archivo of archivos) {
    const contenido = await fs.readFile(archivo, 'utf8')
    for (const patron of PATRONES_SECRETOS) {
      if (patron.regex.test(contenido)) {
        hallazgos.push(`${patron.nombre} en ${path.relative(RAIZ, archivo)}`)
      }
    }
  }
  registrar({
    categoria: 'Secretos',
    nombre: 'Sin secretos/credenciales hardcodeadas en src/',
    ok: hallazgos.length === 0,
    detalle: hallazgos.join('; '),
  })
}

// ── 4. Todo router debe mencionar verificarToken ────────────────────────────
// Heurística de archivo completo (no línea por línea): si un *.routes.js NO
// menciona verificarToken en ningún lado, es una señal fuerte de que esa
// superficie completa quedó sin autenticar. No sustituye una revisión
// humana de CADA ruta (una ruta pública EXTRA dentro de un router que sí
// usa verificarToken para el resto no la detecta esto), pero atrapa el caso
// más grave: un router nuevo completo sin ningún gate.
const ROUTERS_PUBLICOS_PERMITIDOS = []
async function checkRutasSinAuth() {
  const archivos = (await listarArchivos(path.join(SRC, 'modules'), '.routes.js'))
  const sinAuth = []
  for (const archivo of archivos) {
    const relativo = path.relative(RAIZ, archivo)
    if (ROUTERS_PUBLICOS_PERMITIDOS.includes(relativo)) continue
    const contenido = await fs.readFile(archivo, 'utf8')
    if (!contenido.includes('verificarToken')) sinAuth.push(relativo)
  }
  registrar({
    categoria: 'Autenticación',
    nombre: 'Todo router de módulo menciona verificarToken',
    ok: sinAuth.length === 0,
    detalle: sinAuth.length
      ? `Sin ninguna mención de verificarToken: ${sinAuth.join(', ')} — si es deliberado, agrégalo a ROUTERS_PUBLICOS_PERMITIDOS en este script con un comentario explicando por qué.`
      : '',
  })
}

// ── 5. Scripts que escriben en Mongo deben usar guardaProduccion ───────────
// Heurística: si un script en scripts/ (no scripts/lib/, no scripts/backup/,
// que ya tienen su propio criterio) contiene una operación de escritura de
// Mongoose/driver y NO importa guardaProduccion, es candidato a revisión —
// no todo script de escritura necesita el guard (algunos ya tienen su propio
// dry-run explícito), así que esto es 🟡 advertencia, no bloqueante.
const OPERACIONES_ESCRITURA = /\.(create|insertMany|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findByIdAndDelete|findOneAndDelete|save|bulkWrite)\s*\(/
const SCRIPTS_EXCLUIDOS_DEL_GUARD = [
  'scripts/lib/guardaProduccion.js',
  'scripts/free-port.js',
  'scripts/detectar-usuarios-duplicados.js', // de solo lectura, documentado en el propio archivo
  'scripts/verificar-fechas-tz.js',
  'scripts/loadtest.js',
  'scripts/verificar-restore.js', // conecta a --uri explícito del operador, no a MONGO_URI
  // Herramientas de diagnóstico MANUAL para un desarrollador (no scripts de
  // datos de producción): ejercitan flujos reales contra la BD que apunte
  // MONGO_URI (incluido envío real de correo/push en los de notificaciones,
  // ya autodocumentado en cada uno) para depurar en desarrollo — no tiene
  // sentido exigirles --confirmar-produccion, exigirían el flag SIEMPRE que
  // alguien las use para lo que son.
  'scripts/test-flujo-mantenimiento.js',
  'scripts/test-flujo-notificaciones.js',
  'scripts/test-flujo-sig.js',
  'scripts/test-notificaciones.js',
  'scripts/test-notificaciones-modulos.js',
]
async function checkScriptsSinGuard() {
  const archivos = await listarArchivos(SCRIPTS, '.js')
  const sospechosos = []
  for (const archivo of archivos) {
    const relativo = path.relative(RAIZ, archivo).replace(/\\/g, '/')
    if (SCRIPTS_EXCLUIDOS_DEL_GUARD.includes(relativo) || relativo.startsWith('scripts/backup/')) continue
    const contenido = await fs.readFile(archivo, 'utf8')
    if (OPERACIONES_ESCRITURA.test(contenido) && !contenido.includes('guardaProduccion')) {
      sospechosos.push(relativo)
    }
  }
  registrar({
    categoria: 'Scripts destructivos',
    nombre: 'Scripts que escriben en Mongo usan guardaProduccion()',
    ok: sospechosos.length === 0,
    detalle: sospechosos.length
      ? `Revisar si necesitan el guard: ${sospechosos.join(', ')}`
      : '',
    bloqueante: false,
  })
}

// ── 6. Dependencias: vulnerabilidades críticas/altas ────────────────────────
async function checkDependencias() {
  try {
    const salida = execFileSync('npm', ['audit', '--omit=dev', '--json'], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
    const reporte = JSON.parse(salida)
    const severidades = reporte.metadata?.vulnerabilities || {}
    const criticas = (severidades.critical || 0) + (severidades.high || 0)
    registrar({
      categoria: 'Dependencias',
      nombre: 'Sin vulnerabilidades críticas/altas en dependencias de producción',
      ok: criticas === 0,
      detalle: criticas
        ? `${criticas} vulnerabilidad(es) crítica(s)/alta(s) — correr "npm audit --omit=dev" para el detalle. No se corrige automáticamente.`
        : `${severidades.moderate || 0} moderada(s) / ${severidades.low || 0} baja(s) (no bloqueante, ya evaluadas manualmente).`,
    })
  } catch (err) {
    // npm audit sale con código != 0 si encuentra vulnerabilidades — igual
    // hay que leer su stdout (JSON), no tratarlo como fallo del check en sí.
    try {
      const reporte = JSON.parse(err.stdout?.toString() || '{}')
      const severidades = reporte.metadata?.vulnerabilities || {}
      const criticas = (severidades.critical || 0) + (severidades.high || 0)
      registrar({
        categoria: 'Dependencias',
        nombre: 'Sin vulnerabilidades críticas/altas en dependencias de producción',
        ok: criticas === 0,
        detalle: criticas ? `${criticas} vulnerabilidad(es) crítica(s)/alta(s).` : `${severidades.moderate || 0} moderada(s) (no bloqueante).`,
      })
    } catch {
      registrar({ categoria: 'Dependencias', nombre: 'npm audit ejecutable', ok: false, detalle: err.message, bloqueante: false })
    }
  }
}

// ── 7. Backup configurado ───────────────────────────────────────────────────
// BLOQUEANTE en producción: desplegar sin capacidad de backup real es
// exactamente el escenario que este check existe para impedir. Fuera de
// producción no aplica (no tiene sentido exigirle esto a un desarrollador).
async function checkBackupConfigurado() {
  if (process.env.NODE_ENV !== 'production') {
    registrar({ categoria: 'Backup', nombre: 'BACKUP_CIFRADO_CLAVE configurada', ok: true, detalle: 'N/A fuera de producción', bloqueante: false })
    return
  }
  registrar({
    categoria: 'Backup',
    nombre: 'BACKUP_CIFRADO_CLAVE configurada',
    ok: Boolean(process.env.BACKUP_CIFRADO_CLAVE),
    detalle: process.env.BACKUP_CIFRADO_CLAVE
      ? ''
      : 'Sin esto, scripts/backup/respaldar.js se niega a correr — no hay backup real posible. Genera una con: openssl rand -hex 32 (ver docs/OPERACION-RESTORE.md).',
    bloqueante: true,
  })
}

// ── 8. Posibles fugas de datos sensibles en logs ────────────────────────────
async function checkLogsSensibles() {
  const archivos = await listarArchivos(SRC, '.js')
  const hallazgos = []
  const patron = /console\.(log|error|warn|info)\([^)]*\b(password|contrase|token|secret|authorization)\b/i
  for (const archivo of archivos) {
    const lineas = (await fs.readFile(archivo, 'utf8')).split('\n')
    lineas.forEach((linea, i) => {
      if (patron.test(linea)) hallazgos.push(`${path.relative(RAIZ, archivo)}:${i + 1}`)
    })
  }
  registrar({
    categoria: 'Logs',
    nombre: 'Sin console.log/error que mencionen password/token/secret cerca',
    ok: hallazgos.length === 0,
    detalle: hallazgos.join(', '),
    bloqueante: false, // requiere revisión humana: puede ser un falso positivo (variable que se llama "token" pero no imprime su valor)
  })
}

async function main() {
  await checkEntorno()
  checkEnvNoVersionado()
  await checkSecretosHardcodeados()
  await checkRutasSinAuth()
  await checkScriptsSinGuard()
  await checkDependencias()
  await checkBackupConfigurado()
  await checkLogsSensibles()

  console.log('\n═══ Verify de producción — Skynet ═══\n')
  let hayBloqueante = false
  for (const r of resultados) {
    const icono = r.ok ? '✅' : r.bloqueante ? '🔴' : '🟡'
    console.log(`${icono}  [${r.categoria}] ${r.nombre}`)
    if (!r.ok && r.detalle) console.log(`     ${r.detalle}`)
    if (!r.ok && r.bloqueante) hayBloqueante = true
  }

  const fallidos = resultados.filter((r) => !r.ok)
  console.log(`\n${resultados.length - fallidos.length}/${resultados.length} checks en verde.`)

  if (hayBloqueante) {
    console.log('\n🛑  Hay al menos un check BLOQUEANTE fallido — no continuar con el deploy sin resolverlo.')
    process.exitCode = 1
  } else if (fallidos.length > 0) {
    console.log('\n⚠️   Hay advertencias — revisar antes de desplegar, pero no bloquean por sí solas.')
  } else {
    console.log('\n✅  Todos los checks pasaron.')
  }
}

main().catch((err) => {
  console.error('❌  El verify falló inesperadamente:', err)
  process.exitCode = 1
})
