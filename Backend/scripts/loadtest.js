// Prueba de carga end-to-end del backend real (Express + middlewares +
// Mongoose), contra una base de datos MongoDB EN MEMORIA — mismo mecanismo
// que tests/setup.js (mongodb-memory-server) — para poder simular decenas de
// usuarios concurrentes sin tocar el Atlas real de desarrollo/producción ni
// competir por recursos con el VPS compartido donde vive producción.
//
// Siembra el catálogo RBAC real (seedData/rbac.data.js) + N usuarios
// repartidos por rol en la misma proporción que la organización real, y hace
// que cada uno "navegue" la plataforma (dashboard, listados propios,
// bandejas de gestión según su rol) durante un rato, todos a la vez.
//
// El login (bcrypt + rate limiter de 10/15min por IP) se prueba aparte, con
// un puñado de usuarios reales bajo ese límite: simular a los 120 iniciando
// sesión a la vez no reproduce nada real (en la vida real cada persona tiene
// su propia IP) y solo dispararía la protección antifuerza bruta por diseño.
// Para el tráfico masivo se firman los JWT directamente (misma forma que
// firmarToken() en auth.controller.js) y se inyectan como cookie, simulando
// 120 sesiones ya iniciadas navegando al mismo tiempo.
//
// Uso:
//   npm run test:carga                  -> 120 usuarios, 30s
//   npm run test:carga -- 200 60        -> 200 usuarios, 60s

import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'

const NUM_USUARIOS = Number(process.argv[2]) || 120
const DURACION_MS = (Number(process.argv[3]) || 30) * 1000
const PORT = Number(process.env.LOADTEST_PORT) || 4310
const PENSAR_MIN_MS = 300
const PENSAR_MAX_MS = 1500
const TIMEOUT_PETICION_MS = 10000

// Reparto por rol: refleja la composición real de un terminal de transporte
// (ver seedData/rbac.data.js) — la mayoría Operador/Mantenimiento, los roles
// de aprobación/gestión son minoría. Suma 1.00 sobre el total SIN contar al
// Super Admin, que se reserva aparte (1 solo, como en la vida real).
const DISTRIBUCION_ROLES = [
  { slug: 'operador', proporcion: 0.55 },
  { slug: 'mantenimiento', proporcion: 0.2 },
  { slug: 'seguridad', proporcion: 0.1 },
  { slug: 'administrativo_financiero', proporcion: 0.06 },
  { slug: 'bodega', proporcion: 0.05 },
  { slug: 'talento_humano', proporcion: 0.03 },
  { slug: 'administrador', proporcion: 0.01 },
]

// Endpoints de lectura que cualquier autenticado puede visitar (universales
// por diseño RBAC — ver comentarios en cada *.routes.js). "/mantenimiento/
// ordenes" también es universal: solo exige módulo activo, sin permiso.
const RUTAS_UNIVERSALES = [
  '/auth/me',
  '/dashboard',
  '/perfil/firma',
  '/notificaciones/categorias',
  '/notificaciones/preferencias',
  '/ia/avisos',
  '/danos/mios',
  '/requerimientos/mios',
  '/ausencias/mias',
  '/mantenimiento/ordenes',
]

// Endpoints adicionales según el permiso real que otorga cada rol (ver
// seedData/rbac.data.js) — así los 403 del reporte final son de verdad
// anomalías, no rutas mal asignadas a un rol sin el permiso.
const RUTAS_POR_ROL = {
  super_admin: [
    '/danos', '/danos/tecnicos',
    '/mantenimiento/ordenes/tecnicos', '/mantenimiento/ordenes/seguimiento',
    '/mantenimiento/ordenes/supervisor/centro-control', '/mantenimiento/ordenes/supervisor/dashboard',
    '/requerimientos', '/requerimientos/financiero', '/requerimientos/bodega',
    '/ausencias', '/ausencias/bandeja',
  ],
  administrador: [
    '/danos', '/danos/tecnicos',
    '/mantenimiento/ordenes/tecnicos', '/mantenimiento/ordenes/seguimiento',
    '/mantenimiento/ordenes/supervisor/centro-control', '/mantenimiento/ordenes/supervisor/dashboard',
  ],
  // NO incluye '/mantenimiento/ordenes/seguimiento' ni '/tecnicos': exigen
  // mantenimiento:ver_todas/asignar (supervisión), que este rol no tiene —
  // solo mantenimiento:ejecutar (ver/avanzar SOLO lo propio asignado).
  mantenimiento: [
    '/danos',
    '/mantenimiento/ordenes/indicadores',
    '/mantenimiento/ordenes/plantillas', '/mantenimiento/ordenes/conocimiento', '/mantenimiento/ordenes/inventario/materiales',
  ],
  administrativo_financiero: ['/requerimientos', '/requerimientos/financiero', '/danos', '/ausencias'],
  bodega: ['/requerimientos/bodega'],
  talento_humano: ['/ausencias', '/ausencias/bandeja', '/ausencias/calendario'],
  seguridad: [],
  operador: [],
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function esperarSalud(url, timeoutMs) {
  const limite = Date.now() + timeoutMs
  while (Date.now() < limite) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // el servidor aún no acepta conexiones — reintenta
    }
    await esperar(250)
  }
  throw new Error(`El backend no respondió en ${url} tras ${timeoutMs}ms`)
}

// Reparte NUM_USUARIOS entre los slugs de DISTRIBUCION_ROLES + 1 super_admin
// fijo, ajustando el redondeo para que la suma total sea exacta.
function repartirUsuarios(total) {
  const paraSuperAdmin = 1
  const resto = Math.max(0, total - paraSuperAdmin)
  const conteos = DISTRIBUCION_ROLES.map((r) => ({
    slug: r.slug,
    cantidad: Math.max(1, Math.round(resto * r.proporcion)),
  }))
  let diferencia = resto - conteos.reduce((suma, c) => suma + c.cantidad, 0)
  let i = 0
  while (diferencia !== 0) {
    conteos[i % conteos.length].cantidad += diferencia > 0 ? 1 : -1
    diferencia += diferencia > 0 ? -1 : 1
    i += 1
  }
  conteos.push({ slug: 'super_admin', cantidad: paraSuperAdmin })
  return conteos
}

function firmarTokenPrueba(usuarioDoc, env) {
  return jwt.sign(
    {
      id_usuario: usuarioDoc._id,
      nombre_usuario: usuarioDoc.nombre_usuario,
      rol: usuarioDoc.rol,
      modulos: usuarioDoc.modulos,
      tokenVersion: usuarioDoc.tokenVersion,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, algorithm: 'HS256' }
  )
}

function registrarMetrica(metricas, ruta, status, ms) {
  if (!metricas.has(ruta)) {
    metricas.set(ruta, { total: 0, ok: 0, authFail: 0, error: 0, latencias: [] })
  }
  const m = metricas.get(ruta)
  m.total += 1
  m.latencias.push(ms)
  if (status === 401 || status === 403) m.authFail += 1
  else if (typeof status === 'number' && status >= 200 && status < 400) m.ok += 1
  else m.error += 1
}

function percentil(valoresOrdenados, p) {
  if (valoresOrdenados.length === 0) return 0
  const idx = Math.min(valoresOrdenados.length - 1, Math.floor((p / 100) * valoresOrdenados.length))
  return valoresOrdenados[idx]
}

async function simularUsuario(usuario, hastaCuando, metricas) {
  const rutas = [...RUTAS_UNIVERSALES, ...(RUTAS_POR_ROL[usuario.rolSlug] || [])]
  while (Date.now() < hastaCuando) {
    const ruta = rutas[Math.floor(Math.random() * rutas.length)]
    const inicio = performance.now()
    const controlador = new AbortController()
    const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_PETICION_MS)
    try {
      const res = await fetch(`http://localhost:${PORT}/api${ruta}`, {
        headers: { Cookie: `skynet_token=${usuario.token}` },
        signal: controlador.signal,
      })
      // Drena el body: si no, con keep-alive algunos runtimes no liberan el
      // socket hasta el timeout y el "throughput" real quedaría subestimado.
      await res.arrayBuffer()
      registrarMetrica(metricas, ruta, res.status, performance.now() - inicio)
    } catch (err) {
      registrarMetrica(metricas, ruta, `ERROR:${err.name}`, performance.now() - inicio)
    } finally {
      clearTimeout(timeoutId)
    }
    await esperar(PENSAR_MIN_MS + Math.random() * (PENSAR_MAX_MS - PENSAR_MIN_MS))
  }
}

async function probarLoginConcurrente(env, Usuario, hashPassword) {
  const PASSWORD = 'CargaSkynet.2026.Prueba'
  const passwordHash = await hashPassword(PASSWORD)
  const rolOperador = await mongoose.model('Rol').findOne({ slug: 'operador' })

  const N = 8 // bajo el límite de 10 intentos/15min del loginLimiter
  const emails = []
  for (let i = 0; i < N; i += 1) {
    const email = `carga-login-${i}@skynet.test`
    await Usuario.create({
      nombre_usuario: `carga-login-${i}`,
      nombre: `Login Prueba ${i}`,
      email,
      password: passwordHash,
      rol: rolOperador._id,
      estado: 'activo',
    })
    emails.push(email)
  }

  const inicio = performance.now()
  const resultados = await Promise.all(
    emails.map((email) =>
      fetch(`http://localhost:${PORT}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: PASSWORD }),
      }).then((res) => res.status)
    )
  )
  const ms = performance.now() - inicio
  const exitosos = resultados.filter((s) => s === 200).length
  return { N, exitosos, ms, resultados }
}

function imprimirReporte(metricas, duracionRealMs) {
  const filas = [...metricas.entries()].map(([ruta, m]) => {
    const ordenadas = [...m.latencias].sort((a, b) => a - b)
    return {
      ruta,
      total: m.total,
      ok: m.ok,
      authFail: m.authFail,
      error: m.error,
      p50: Math.round(percentil(ordenadas, 50)),
      p95: Math.round(percentil(ordenadas, 95)),
      max: Math.round(ordenadas[ordenadas.length - 1] || 0),
    }
  })
  filas.sort((a, b) => b.total - a.total)

  const totalPeticiones = filas.reduce((s, f) => s + f.total, 0)
  const totalErrores = filas.reduce((s, f) => s + f.error, 0)
  const totalAuthFail = filas.reduce((s, f) => s + f.authFail, 0)

  console.log('\n=== Resultado por endpoint ===')
  console.log(
    'ruta'.padEnd(45), 'total'.padStart(6), 'ok'.padStart(6), '401/403'.padStart(8),
    'error'.padStart(6), 'p50ms'.padStart(7), 'p95ms'.padStart(7), 'maxms'.padStart(7)
  )
  for (const f of filas) {
    console.log(
      f.ruta.padEnd(45), String(f.total).padStart(6), String(f.ok).padStart(6),
      String(f.authFail).padStart(8), String(f.error).padStart(6),
      String(f.p50).padStart(7), String(f.p95).padStart(7), String(f.max).padStart(7)
    )
  }

  console.log('\n=== Resumen global ===')
  console.log(`Peticiones totales:     ${totalPeticiones}`)
  console.log(`Duración real:          ${(duracionRealMs / 1000).toFixed(1)}s`)
  console.log(`Throughput:             ${(totalPeticiones / (duracionRealMs / 1000)).toFixed(1)} req/s`)
  console.log(`401/403 (esperado RBAC):${totalAuthFail}`)
  console.log(`Errores 5xx/timeout:    ${totalErrores}`)
  if (totalErrores > 0) {
    console.log('\n⚠️  Hubo errores de servidor o timeouts — revisar el detalle por ruta arriba.')
  } else {
    console.log('\n✅  Ningún error de servidor ni timeout durante la prueba.')
  }
}

async function main() {
  console.log(`Prueba de carga: ${NUM_USUARIOS} usuarios simulados, ${DURACION_MS / 1000}s, puerto ${PORT}`)
  console.log('Levantando MongoDB en memoria (no toca Atlas real)...')

  const mongod = await MongoMemoryServer.create()
  process.env.MONGO_URI = mongod.getUri()
  process.env.PORT = String(PORT)
  process.env.NODE_ENV = process.env.NODE_ENV || 'development'

  // Import dinámico DESPUÉS de fijar MONGO_URI/PORT: dotenv.config() (dentro
  // de config/env.js) no pisa variables ya definidas, así que el backend
  // real arranca contra la base en memoria y en este puerto aislado.
  await import('../src/index.js')
  await esperarSalud(`http://localhost:${PORT}/health`, 20000)
  console.log('Backend arriba. Sembrando catálogo RBAC y usuarios de prueba...')

  const { sembrarCatalogoRBAC } = await import('../src/seedData/rbacCatalogo.js')
  const { default: Usuario } = await import('../src/models/Usuario.js')
  const { hashPassword } = await import('../src/utils/password.js')
  const { env } = await import('../src/config/env.js')

  const rolIdPorSlug = await sembrarCatalogoRBAC()
  const passwordHash = await hashPassword('CargaSkynet.2026.Prueba')

  const reparto = repartirUsuarios(NUM_USUARIOS)
  const usuariosDoc = []
  const rolSlugPorEmail = new Map()
  let n = 0
  for (const { slug, cantidad } of reparto) {
    const rolId = rolIdPorSlug.get(slug)
    for (let i = 0; i < cantidad; i += 1) {
      const email = `carga-${slug}-${n}@skynet.test`
      usuariosDoc.push({
        nombre_usuario: `carga-${slug}-${n}`,
        nombre: `Usuario de Carga ${n}`,
        email,
        password: passwordHash,
        rol: rolId,
        estado: 'activo',
      })
      rolSlugPorEmail.set(email, slug)
      n += 1
    }
  }
  const creados = await Usuario.insertMany(usuariosDoc)
  const usuarios = creados.map((doc) => ({
    rolSlug: rolSlugPorEmail.get(doc.email),
    token: firmarTokenPrueba(doc, env),
  }))
  console.log(`${usuarios.length} usuarios creados (reparto: ${reparto.map((r) => `${r.slug}=${r.cantidad}`).join(', ')})`)

  console.log('\nProbando el endpoint real de login (bcrypt + rate limiter) con 8 usuarios concurrentes...')
  const loginResultado = await probarLoginConcurrente(env, Usuario, hashPassword)
  console.log(
    `Login: ${loginResultado.exitosos}/${loginResultado.N} exitosos en ${loginResultado.ms.toFixed(0)}ms ` +
    `(estados: ${loginResultado.resultados.join(', ')})`
  )

  console.log(`\nLanzando ${usuarios.length} usuarios concurrentes navegando la plataforma durante ${DURACION_MS / 1000}s...`)
  const metricas = new Map()
  const inicio = Date.now()
  const hastaCuando = inicio + DURACION_MS
  await Promise.all(usuarios.map((u) => simularUsuario(u, hastaCuando, metricas)))
  const duracionRealMs = Date.now() - inicio

  imprimirReporte(metricas, duracionRealMs)

  await mongoose.disconnect()
  await mongod.stop()
  process.exit(0)
}

main().catch((err) => {
  console.error('\nLa prueba de carga falló:', err)
  process.exit(1)
})
