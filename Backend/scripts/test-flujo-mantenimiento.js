/**
 * Prueba END-TO-END del sistema de mantenimiento de plataforma.
 *
 * A diferencia de tests/plataforma.*.test.js (que montan routers sueltos con
 * supertest), esto levanta el PROCESO REAL del backend — `node src/index.js`,
 * con su orden de middlewares, sus workers y sus temporizadores — y lo maneja
 * por HTTP como lo haría el navegador.
 *
 * ── Por qué NO usa la base de .env ──────────────────────────────────────────
 * MONGO_URI de .env apunta al Atlas real, el mismo cluster del que vive
 * https://skynetttn.online. Activar un mantenimiento ahí no sería una prueba:
 * dejaría al Terminal entero sin plataforma de verdad. Este script arranca su
 * propio Mongo efímero (mongodb-memory-server, ya presente como dependencia de
 * desarrollo) y le pasa esa URI al proceso hijo, así que no toca ni un
 * documento de producción.
 *
 * Uso:  npm run test:flujo-mantenimiento
 */
import { spawn } from 'node:child_process'
import { setTimeout as esperar } from 'node:timers/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUERTO = 3199
const BASE = `http://127.0.0.1:${PUERTO}`
const PASSWORD = 'Clave.Segura.2026'

let fallos = 0
let pasos = 0

function ok(mensaje) {
  pasos++
  console.log(`  \x1b[32m✓\x1b[0m ${mensaje}`)
}
function fallo(mensaje, detalle) {
  fallos++
  console.log(`  \x1b[31m✗\x1b[0m ${mensaje}`)
  if (detalle !== undefined) console.log(`      ${JSON.stringify(detalle)}`)
}
function comprobar(condicion, mensaje, detalle) {
  condicion ? ok(mensaje) : fallo(mensaje, detalle)
}
function titulo(texto) {
  console.log(`\n\x1b[36m▸ ${texto}\x1b[0m`)
}

// Cliente HTTP mínimo con manejo de cookie de sesión, para imitar lo que hace
// el navegador con la cookie httpOnly.
function crearCliente() {
  let cookie = null
  return {
    get cookie() {
      return cookie
    },
    async pedir(ruta, opciones = {}) {
      const cabeceras = { 'Content-Type': 'application/json', ...opciones.headers }
      if (cookie) cabeceras.Cookie = cookie
      const res = await fetch(`${BASE}${ruta}`, { ...opciones, headers: cabeceras })
      const set = res.headers.get('set-cookie')
      if (set?.includes('skynet_token=') && !set.includes('skynet_token=;')) {
        cookie = set.split(';')[0]
      }
      const cuerpo = await res.json().catch(() => null)
      return { status: res.status, cuerpo, headers: res.headers }
    },
  }
}

// Formatea un instante como lo hace un <input type="datetime-local"> en la
// zona del Terminal: sin offset. Es la entrada real del formulario.
function datetimeLocal(desplazamientoMs) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + desplazamientoMs))
  const g = (t) => partes.find((p) => p.type === t).value
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

let mongod
let servidor

function arrancarServidor(uri) {
  return new Promise((resolve, reject) => {
    const hijo = spawn(process.execPath, ['src/index.js'], {
      cwd: RAIZ,
      env: {
        ...process.env,
        MONGO_URI: uri,
        PORT: String(PUERTO),
        NODE_ENV: 'development',
        JWT_SECRET: 'secreto-solo-para-esta-prueba-local-1234567890',
        CORS_ORIGIN: 'http://localhost:5173',
        // El worker de notificaciones se deja prácticamente dormido: este
        // script comprueba que los avisos QUEDAN ENCOLADOS, no que salgan por
        // SMTP. Sin esto, con las credenciales reales de .env cargadas, el
        // proceso intentaría mandar correos de verdad a direcciones falsas.
        NOTIF_WORKER_INTERVALO_MS: '3600000',
        EMAIL_HOST: '',
        EMAIL_USER: '',
        EMAIL_PASS: '',
        VAPID_PUBLIC_KEY: '',
        VAPID_PRIVATE_KEY: '',
        // Ticks rápidos para poder observar las transiciones automáticas sin
        // que la prueba tarde minutos.
        PLATAFORMA_WORKER_INTERVALO_MS: '1500',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let salida = ''
    const alArrancar = (buf) => {
      salida += buf.toString()
      if (salida.includes('API disponible')) resolve(hijo)
    }
    hijo.stdout.on('data', alArrancar)
    hijo.stderr.on('data', (b) => {
      salida += b.toString()
    })
    hijo.on('exit', (codigo) => {
      if (codigo !== 0 && codigo !== null) reject(new Error(`El backend salió con código ${codigo}:\n${salida}`))
    })
    setTimeout(() => reject(new Error(`El backend no arrancó a tiempo:\n${salida}`)), 45_000)
  })
}

async function detenerServidor(hijo) {
  if (!hijo || hijo.exitCode !== null) return
  hijo.kill()
  await new Promise((r) => hijo.once('exit', r))
}

async function sembrarUsuarios() {
  const { default: Usuario } = await import('../src/models/Usuario.js')
  const { default: Rol } = await import('../src/models/Rol.js')
  const { default: Permiso } = await import('../src/models/Permiso.js')
  const { hashPassword } = await import('../src/utils/password.js')

  const password = await hashPassword(PASSWORD)

  const rolAdmin = await Rol.create({
    nombre: 'Super Administrador', slug: 'super_admin', ambito: 'global', esSuperAdmin: true, permisos: [],
  })
  const rolTrabajador = await Rol.create({
    nombre: 'Trabajador', slug: 'trabajador_prueba', ambito: 'global', esSuperAdmin: false, permisos: [],
  })
  // Un tercer perfil: sin ser Super Admin, tiene el permiso delegado. Sirve
  // para comprobar que la delegación funciona igual que el bypass.
  const permisoPlataforma = await Permiso.findOne({ codigo: 'plataforma:gestionar' })
  const rolGestor = await Rol.create({
    nombre: 'Gestor de plataforma', slug: 'gestor_plataforma', ambito: 'global',
    esSuperAdmin: false, permisos: permisoPlataforma ? [permisoPlataforma._id] : [],
  })

  comprobar(Boolean(permisoPlataforma), "el arranque creó el permiso 'plataforma:gestionar' en el catálogo")

  await Usuario.create([
    { nombre_usuario: 'admin', nombre: 'Admin', email: 'admin@ttn.test', password, rol: rolAdmin._id },
    { nombre_usuario: 'gestor', nombre: 'Gestor', email: 'gestor@ttn.test', password, rol: rolGestor._id },
    { nombre_usuario: 'trabajador', nombre: 'Trabajador', email: 'trabajador@ttn.test', password, rol: rolTrabajador._id },
    { nombre_usuario: 'trabajador2', nombre: 'Trabajador 2', email: 'trabajador2@ttn.test', password, rol: rolTrabajador._id },
  ])
}

async function main() {
  console.log('\n\x1b[1mFlujo end-to-end · Estado de plataforma (mantenimiento)\x1b[0m')
  console.log('\x1b[2mBase de datos efímera en memoria — no toca el Atlas de .env\x1b[0m')

  mongod = await MongoMemoryServer.create()
  const uri = mongod.getUri('skynet_prueba_mantenimiento')

  servidor = await arrancarServidor(uri)
  await mongoose.connect(uri)
  await sembrarUsuarios()

  const admin = crearCliente()
  const gestor = crearCliente()
  const trabajador = crearCliente()
  const anonimo = crearCliente()

  // ── 1. Estado inicial ────────────────────────────────────────────────────
  titulo('1. Plataforma operativa')
  {
    const { status, cuerpo } = await anonimo.pedir('/api/plataforma/estado')
    comprobar(status === 200, 'el estado público responde sin sesión', status)
    comprobar(cuerpo?.estado?.status === 'operativa', 'el estado inicial es OPERATIVA', cuerpo?.estado)
    comprobar(Boolean(cuerpo?.estado?.ahora), 'incluye el reloj del servidor para anclar la cuenta regresiva')

    const login = await trabajador.pedir('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'trabajador@ttn.test', password: PASSWORD }),
    })
    comprobar(login.status === 200, 'un trabajador puede iniciar sesión', login.cuerpo)

    const dash = await trabajador.pedir('/api/dashboard')
    comprobar(dash.status !== 503, 'y usar la API con normalidad', dash.status)
  }

  await admin.pedir('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'admin@ttn.test', password: PASSWORD }),
  })
  await gestor.pedir('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'gestor@ttn.test', password: PASSWORD }),
  })

  // ── 2. Programar ─────────────────────────────────────────────────────────
  titulo('2. Programar un mantenimiento futuro')
  {
    const res = await admin.pedir('/api/plataforma/programar', {
      method: 'POST',
      body: JSON.stringify({
        scheduledStart: datetimeLocal(3 * 60 * 60 * 1000),
        scheduledEnd: datetimeLocal(4 * 60 * 60 * 1000),
        reason: 'Mejora de rendimiento y estabilidad',
        message: 'Skynet realizará mantenimiento programado para mejorar el rendimiento.',
      }),
    })
    comprobar(res.status === 200, 'el Super Admin puede programar', res.cuerpo)
    comprobar(res.cuerpo?.estado?.status === 'programado', 'el estado pasa a MANTENIMIENTO PROGRAMADO')

    const publico = await anonimo.pedir('/api/plataforma/estado')
    comprobar(publico.cuerpo?.estado?.reason === 'Mejora de rendimiento y estabilidad', 'el aviso es visible sin sesión')
    comprobar(publico.cuerpo?.estado?.createdByNombre === undefined, 'el endpoint público no filtra quién lo programó')

    const dash = await trabajador.pedir('/api/dashboard')
    comprobar(dash.status !== 503, 'un mantenimiento PROGRAMADO no bloquea nada todavía', dash.status)

    const denegado = await trabajador.pedir('/api/plataforma/programar', {
      method: 'POST', body: JSON.stringify({ scheduledStart: datetimeLocal(60 * 60 * 1000) }),
    })
    comprobar(denegado.status === 403, 'un trabajador NO puede programar mantenimientos', denegado.status)
  }

  // ── 3. Editar y cancelar ─────────────────────────────────────────────────
  titulo('3. Editar y cancelar la programación')
  {
    const editado = await admin.pedir('/api/plataforma/programar', {
      method: 'PUT',
      body: JSON.stringify({
        scheduledStart: datetimeLocal(5 * 60 * 60 * 1000),
        scheduledEnd: datetimeLocal(6 * 60 * 60 * 1000),
        reason: 'Reprogramado',
        message: 'Nueva ventana.',
      }),
    })
    comprobar(editado.status === 200 && editado.cuerpo?.estado?.reason === 'Reprogramado', 'se puede editar la ventana')

    const cancelado = await admin.pedir('/api/plataforma/programar', { method: 'DELETE' })
    comprobar(cancelado.cuerpo?.estado?.status === 'operativa', 'cancelar devuelve la plataforma a OPERATIVA')
  }

  // ── 4. Activación inmediata ──────────────────────────────────────────────
  titulo('4. Activación inmediata del mantenimiento')
  {
    const res = await gestor.pedir('/api/plataforma/activar', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Incidente en curso', message: 'Estamos trabajando en ello.' }),
    })
    comprobar(res.status === 200, 'quien tiene el permiso delegado también puede activar', res.cuerpo)
    comprobar(res.cuerpo?.estado?.status === 'en_mantenimiento', 'el estado pasa a EN MANTENIMIENTO')
    comprobar(res.cuerpo?.estado?.enabled === true, 'enabled queda en true')
  }

  // ── 5. El bloqueo es real ────────────────────────────────────────────────
  titulo('5. Bloqueo efectivo (la sesión previa deja de servir)')
  {
    const dash = await trabajador.pedir('/api/dashboard')
    comprobar(dash.status === 503, 'la sesión abierta ANTES del mantenimiento recibe 503', dash.status)
    comprobar(dash.cuerpo?.mantenimiento === true, 'la respuesta trae la bandera mantenimiento')
    comprobar(dash.cuerpo?.estado?.message === 'Estamos trabajando en ello.', 'y el mensaje configurado por el administrador')

    const otras = await Promise.all(
      ['/api/usuarios', '/api/requerimientos', '/api/notificaciones/centro', '/api/danos'].map((r) => trabajador.pedir(r))
    )
    comprobar(otras.every((r) => r.status === 503), 'todas las APIs de negocio quedan bloqueadas', otras.map((r) => r.status))

    const salud = await anonimo.pedir('/health')
    comprobar(salud.status === 200, 'el healthcheck sigue vivo (no dispara alarmas de caída)', salud.status)

    const estado = await anonimo.pedir('/api/plataforma/estado')
    comprobar(estado.status === 200, 'el endpoint de estado sigue vivo (el frontend puede enterarse)', estado.status)

    const logout = await trabajador.pedir('/api/auth/logout', { method: 'POST' })
    comprobar(logout.status === 200, 'cerrar sesión sigue funcionando')
  }

  // ── 6. Login bloqueado ───────────────────────────────────────────────────
  titulo('6. Autenticación durante el mantenimiento')
  {
    const nuevo = crearCliente()
    const login = await nuevo.pedir('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: 'trabajador2@ttn.test', password: PASSWORD }),
    })
    comprobar(login.status === 503, 'un trabajador NO puede iniciar sesión aunque la contraseña sea correcta', login.status)
    comprobar(!nuevo.cookie, 'no se emitió cookie de sesión')

    const malas = await crearCliente().pedir('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: 'trabajador2@ttn.test', password: 'incorrecta' }),
    })
    comprobar(malas.status === 401, 'una contraseña incorrecta sigue dando 401 (no revela nada extra)', malas.status)

    const adminNuevo = crearCliente()
    const loginAdmin = await adminNuevo.pedir('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: 'admin@ttn.test', password: PASSWORD }),
    })
    comprobar(loginAdmin.status === 200, 'un administrador SÍ puede entrar a resolverlo', loginAdmin.status)
    comprobar(Boolean(adminNuevo.cookie), 'y recibe su cookie de sesión')
  }

  // ── 7. Reinicio del backend ──────────────────────────────────────────────
  titulo('7. Reinicio del backend durante el mantenimiento')
  {
    await detenerServidor(servidor)
    servidor = await arrancarServidor(uri)

    const estado = await anonimo.pedir('/api/plataforma/estado')
    comprobar(estado.cuerpo?.estado?.status === 'en_mantenimiento', 'el mantenimiento SOBREVIVE al reinicio del proceso')

    const dash = await trabajador.pedir('/api/dashboard')
    comprobar(dash.status === 503, 'y el bloqueo sigue aplicándose tras el reinicio', dash.status)
  }

  // ── 8. Finalización manual ───────────────────────────────────────────────
  titulo('8. Finalización manual y notificación')
  {
    const { default: EnvioNotificacion } = await import('../src/models/EnvioNotificacion.js')
    const { default: Notificacion } = await import('../src/models/Notificacion.js')

    const adminTrasReinicio = crearCliente()
    await adminTrasReinicio.pedir('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: 'admin@ttn.test', password: PASSWORD }),
    })

    const fin = await adminTrasReinicio.pedir('/api/plataforma/finalizar', { method: 'POST' })
    comprobar(fin.status === 200, 'el administrador puede finalizar el mantenimiento', fin.cuerpo)
    comprobar(fin.cuerpo?.estado?.status === 'operativa', 'el estado vuelve a OPERATIVA')

    const avisos = await Notificacion.countDocuments({ tipo: 'plataforma_disponible' })
    comprobar(avisos === 4, `se notificó a los 4 usuarios activos que Skynet ya está disponible (${avisos})`)

    const encolados = await EnvioNotificacion.countDocuments({ tipo: 'plataforma_disponible' })
    comprobar(encolados > 0, `los envíos quedaron encolados para el worker (${encolados})`)

    // Reintento: el CAS del cierre debe impedir un segundo aviso.
    const repetido = await adminTrasReinicio.pedir('/api/plataforma/finalizar', { method: 'POST' })
    comprobar(repetido.status === 409, 'finalizar dos veces devuelve conflicto, no un segundo aviso', repetido.status)
    const avisosTras = await Notificacion.countDocuments({ tipo: 'plataforma_disponible' })
    comprobar(avisosTras === 4, 'la notificación de finalización se envió EXACTAMENTE UNA VEZ')
  }

  // ── 9. Recuperación ──────────────────────────────────────────────────────
  titulo('9. Recuperación automática')
  {
    const nuevo = crearCliente()
    const login = await nuevo.pedir('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: 'trabajador@ttn.test', password: PASSWORD }),
    })
    comprobar(login.status === 200, 'los trabajadores pueden volver a iniciar sesión')

    const dash = await nuevo.pedir('/api/dashboard')
    comprobar(dash.status !== 503, 'y la API vuelve a responder con normalidad', dash.status)
  }

  // ── 10. Inicio y fin automáticos ─────────────────────────────────────────
  titulo('10. Ventana automática de principio a fin (sin tocar nada)')
  {
    const { default: EstadoPlataforma } = await import('../src/models/EstadoPlataforma.js')
    const { default: EventoPlataforma } = await import('../src/models/EventoPlataforma.js')
    const { default: Notificacion } = await import('../src/models/Notificacion.js')

    const avisosAntes = await Notificacion.countDocuments({ tipo: 'plataforma_disponible' })

    // Ventana real de ~8 segundos, programada por la API igual que lo haría un
    // administrador. Se usan instantes ISO (con 'Z') en vez del formato del
    // <input datetime-local> porque este solo tiene resolución de minutos, y
    // aquí hacen falta segundos. instanteLocal() respeta cualquier valor que
    // ya traiga offset, así que ambos formatos son entradas válidas.
    const inicio = new Date(Date.now() + 5000)
    const fin = new Date(Date.now() + 13000)

    const programado = await admin.pedir('/api/plataforma/programar', {
      method: 'POST',
      body: JSON.stringify({
        scheduledStart: inicio.toISOString(),
        scheduledEnd: fin.toISOString(),
        reason: 'Ventana automática',
        message: 'Prueba de transición automática.',
      }),
    })
    comprobar(programado.cuerpo?.estado?.status === 'programado', 'queda programada para dentro de 5 segundos')

    const antes = await trabajador.pedir('/api/dashboard')
    comprobar(antes.status !== 503, 'antes de la hora, nadie está bloqueado', antes.status)

    // Se cruza la hora de inicio SIN que nadie pulse nada.
    await esperar(7000)

    const durante = await trabajador.pedir('/api/dashboard')
    comprobar(durante.status === 503, 'al llegar la hora, la plataforma se cierra sola', durante.status)

    const doc = await EstadoPlataforma.findOne({ clave: 'global' })
    comprobar(doc.status === 'en_mantenimiento', 'el worker persistió el inicio automático', doc.status)
    comprobar(
      (await EventoPlataforma.countDocuments({ tipo: 'iniciado_automatico' })) === 1,
      'y lo registró una sola vez en el historial'
    )

    // Y al vencer scheduledEnd, la finalización automática.
    await esperar(9000)

    const despues = await trabajador.pedir('/api/dashboard')
    comprobar(despues.status !== 503, 'al llegar la hora de fin, la plataforma se reabre sola', despues.status)

    const cerrado = await EstadoPlataforma.findOne({ clave: 'global' })
    comprobar(cerrado.status === 'operativa', 'el estado persistido vuelve a OPERATIVA', cerrado.status)
    comprobar(
      (await EventoPlataforma.countDocuments({ tipo: 'finalizado_automatico' })) === 1,
      'la finalización automática quedó registrada una sola vez'
    )

    const avisosDespues = await Notificacion.countDocuments({ tipo: 'plataforma_disponible' })
    comprobar(
      avisosDespues - avisosAntes === 4,
      `la finalización automática también avisó a los 4 usuarios, una sola vez (${avisosDespues - avisosAntes})`
    )
  }

  // ── 11. Historial ────────────────────────────────────────────────────────
  titulo('11. Historial de eventos')
  {
    const { status, cuerpo } = await admin.pedir('/api/plataforma/historial?pagina=1&porPagina=50')
    comprobar(status === 200, 'el historial responde')
    const tipos = (cuerpo?.eventos || []).map((e) => e.tipo)
    for (const esperado of ['programado', 'editado', 'cancelado', 'iniciado', 'finalizado', 'iniciado_automatico', 'finalizado_automatico']) {
      comprobar(tipos.includes(esperado), `el historial registra "${esperado}"`)
    }
    const conResponsable = (cuerpo?.eventos || []).find((e) => e.tipo === 'iniciado')
    comprobar(conResponsable?.usuarioNombre === 'gestor', 'guarda quién activó el mantenimiento', conResponsable?.usuarioNombre)

    const denegado = await trabajador.pedir('/api/plataforma/historial')
    comprobar(denegado.status === 401 || denegado.status === 403, 'el historial no es público', denegado.status)
  }

  console.log(`\n\x1b[1m${pasos - fallos}/${pasos} comprobaciones correctas\x1b[0m`)
  if (fallos > 0) {
    console.log(`\x1b[31m${fallos} fallo(s)\x1b[0m\n`)
    process.exitCode = 1
  } else {
    console.log('\x1b[32mFlujo completo verificado end-to-end.\x1b[0m\n')
  }
}

try {
  await main()
} catch (err) {
  console.error('\n\x1b[31mLa prueba no pudo completarse:\x1b[0m', err.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect().catch(() => {})
  await detenerServidor(servidor)
  await mongod?.stop()
}
