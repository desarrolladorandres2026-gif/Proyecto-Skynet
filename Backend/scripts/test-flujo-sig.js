// Prueba de flujo END-TO-END de notificaciones del módulo "Cuestionarios
// Programados": ejercita los SERVICIOS REALES (crearPregunta,
// crearProgramacionIndividual, publicarPendientes — el mismo motor que usa
// sig.worker.js) y verifica que publicar una pregunta programada encola y
// ENTREGA de verdad un correo a cada trabajador de la audiencia.
//
// Mismo criterio que test-flujo-notificaciones.js:
// - Base de datos: Mongo EN MEMORIA. No toca el Atlas real.
// - SMTP: REAL (el de .env). Los correos salen de verdad al destinatario.
// - La conexión se abre ANTES de importar nada que registre modelos, para
//   que todo el grafo de servicios use la instancia en memoria.
//
// Uso:  node scripts/test-flujo-sig.js [correo-destino]
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { MongoMemoryServer } from 'mongodb-memory-server'

const EMAIL_DESTINO = process.argv[2] || 'felipemartinez101203@gmail.com'

const mongod = await MongoMemoryServer.create()
await mongoose.connect(mongod.getUri())

const { default: Usuario } = await import('../src/models/Usuario.js')
const { default: Rol } = await import('../src/models/Rol.js')
const { default: Permiso } = await import('../src/models/Permiso.js')
const { default: RespuestaSig } = await import('../src/models/RespuestaSig.js')
const { default: ProgramacionSig } = await import('../src/models/ProgramacionSig.js')
const { default: EnvioNotificacion } = await import('../src/models/EnvioNotificacion.js')

const sigBanco = await import('../src/modules/sig_pregunta_dia/sig-banco.service.js')
const sigProgramaciones = await import('../src/modules/sig_pregunta_dia/sig-programaciones.service.js')
const sigRespuestas = await import('../src/modules/sig_pregunta_dia/sig-respuestas.service.js')
const { procesarPendientes } = await import('../src/modules/notificaciones/notificaciones.service.js')

const PASSWORD = 'clave-de-prueba-123'
let pasos = 0
let fallos = 0

// Sub-direccionamiento ("usuario+etiqueta@gmail.com"): Gmail entrega los 3
// correos al mismo buzón y el campo "Para:" muestra a qué trabajador iba
// dirigido cada aviso.
function emailDe(rol) {
  const [local, dominio] = EMAIL_DESTINO.split('@')
  return `${local}+sig-${rol}@${dominio}`
}

async function crearUsuario(nombre, permisos = []) {
  const docsPermiso = []
  for (const codigo of permisos) {
    const [modulo, accion] = codigo.split(':')
    docsPermiso.push(
      await Permiso.findOneAndUpdate({ codigo }, { codigo, modulo, accion, nombre: codigo }, { upsert: true, new: true })
    )
  }
  const rol = await Rol.create({
    nombre: `Rol ${nombre}`,
    slug: nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    permisos: docsPermiso.map((p) => p._id),
  })
  const usuario = await Usuario.create({
    nombre_usuario: nombre,
    nombre: `Trabajador ${nombre}`,
    password: await bcrypt.hash(PASSWORD, 4),
    email: emailDe(nombre),
    rol: rol._id,
    cargo: 'Cargo de prueba',
    dependencia: 'Dependencia de prueba',
    estado: 'activo',
  })
  return {
    doc: usuario,
    actor: {
      id_usuario: usuario._id,
      nombre_usuario: usuario.nombre_usuario,
      rol: { id: rol._id, nombre: rol.nombre, slug: rol.slug },
      esSuperAdmin: false,
      permisos: new Set(permisos),
    },
  }
}

let vistos = 0
async function verificar(descripcion, esperado) {
  const total = await EnvioNotificacion.countDocuments({ canal: 'email' })
  const nuevos = total - vistos
  vistos = total
  pasos += 1
  const ok = esperado === 0 ? nuevos === 0 : nuevos >= esperado
  if (!ok) fallos += 1
  const detalle = await EnvioNotificacion.find({ canal: 'email' }).sort({ createdAt: -1 }).limit(nuevos).select('titulo emailDestino')
  console.log(
    `  ${ok ? '✓' : '✗'} ${descripcion.padEnd(48)} ${nuevos} correo(s)` +
      (nuevos ? ` → ${detalle.map((d) => `"${d.titulo}" a ${d.emailDestino || '?'}`).join(', ')}` : '') +
      (ok ? '' : ` (esperaba ${esperado === 0 ? 'exactamente 0' : 'al menos ' + esperado})`)
  )
}

console.log(`\nPrueba de flujo del módulo Cuestionarios Programados`)
console.log(`Destino: ${EMAIL_DESTINO}`)
console.log(`Base de datos: Mongo en memoria (el Atlas real no se toca)\n`)

// ── Actores ────────────────────────────────────────────────────────────────
const admin = await crearUsuario('admin-sig', ['sig_pregunta_dia:gestionar_banco', 'sig_pregunta_dia:programar'])
const trabajador1 = await crearUsuario('trabajador1')
const trabajador2 = await crearUsuario('trabajador2')

// ── 1. Crear la pregunta en el banco ────────────────────────────────────────
console.log('MÓDULO CUESTIONARIOS PROGRAMADOS')
const pregunta = await sigBanco.crearPregunta(
  {
    enunciado: '¿Qué debes hacer si detectas un riesgo en tu área de trabajo?',
    componenteSig: 'SST',
    tema: 'Reporte de incidentes',
    opciones: [
      { texto: 'Reportarlo de inmediato', esCorrecta: true },
      { texto: 'Ignorarlo si no es grave', esCorrecta: false },
      { texto: 'Esperar a que otro lo reporte', esCorrecta: false },
      { texto: 'Resolverlo sin avisar a nadie', esCorrecta: false },
    ],
    retroalimentacion: { correcta: '¡Correcto!', incorrecta: 'Todo riesgo debe reportarse de inmediato.' },
  },
  admin.actor
)
console.log(`  Pregunta creada: "${pregunta.enunciado.slice(0, 50)}..."`)

// ── 2. Programarla (fecha/hora futura, como exige el service) ──────────────
const enUnMinuto = new Date(Date.now() + 60_000)
const fecha = enUnMinuto.toISOString().slice(0, 10)
const hora = enUnMinuto.toISOString().slice(11, 16)
// crearProgramacionIndividual devuelve un ARRAY (soporta programar varias
// preguntas de una vez, ver el comentario en sig-programaciones.service.js);
// con una sola pregunta en la lista, es el primer y único elemento.
const [programacion] = await sigProgramaciones.crearProgramacionIndividual(
  { preguntaId: pregunta._id, fecha, hora, audiencia: { todos: true } },
  admin.actor
)
console.log(`  Programada para ${fecha} ${hora} (audiencia: todos)`)

// Se retrocede la hora de publicación para no tener que esperar el minuto
// real — el propio service exige una fecha futura al crearla (protección
// real contra programar algo "para ya"), así que se ajusta DESPUÉS con el
// driver directo, simulando que "ya llegó la hora".
await ProgramacionSig.updateOne({ _id: programacion._id }, { $set: { fechaHoraPublicacion: new Date(Date.now() - 1000) } })

// ── 3. Publicar (el mismo motor que corre sig.worker.js cada 60s) ──────────
const publicadas = await sigProgramaciones.publicarPendientes(50)
console.log(`  publicarPendientes() publicó ${publicadas} programación(es)`)
// audiencia:'todos' resuelve a CUALQUIER usuario activo, incluido quien
// programó la pregunta — 3 destinatarios: admin-sig, trabajador1, trabajador2.
await verificar('publicar pregunta programada → avisa a los 3 usuarios activos (audiencia: todos)', 3)

const programacionPublicada = await ProgramacionSig.findById(programacion._id)
console.log(`  Estado tras publicar: ${programacionPublicada.estado} (esperado: publicada)`)
if (programacionPublicada.estado !== 'publicada') fallos += 1

// ── 4. Un trabajador responde ───────────────────────────────────────────────
const resultado = await sigRespuestas.responder(programacion._id, 0, trabajador1.actor)
console.log(`  ${trabajador1.doc.nombre_usuario} respondió: ${resultado.esCorrecta ? 'correcta' : 'incorrecta'}`)

// ── 5. Ese mismo trabajador intenta responder de nuevo → debe rechazarse ───
let bloqueada = false
try {
  await sigRespuestas.responder(programacion._id, 1, trabajador1.actor)
} catch (err) {
  bloqueada = err.status === 409
}
pasos += 1
if (!bloqueada) fallos += 1
console.log(`  ${bloqueada ? '✓' : '✗'} responder dos veces la misma pregunta → rechazado con 409`)

const totalRespuestas = await RespuestaSig.countDocuments({ programacion: programacion._id })
console.log(`  Respuestas registradas para esta programación: ${totalRespuestas} (esperado: 1, no 2)`)
if (totalRespuestas !== 1) fallos += 1

// ── Envío real ─────────────────────────────────────────────────────────────
const pendientes = await EnvioNotificacion.countDocuments({ estado: 'pendiente', canal: 'email' })
console.log(`\nEnviando ${pendientes} correo(s) por SMTP real...`)
await procesarPendientes(200)

const enviados = await EnvioNotificacion.countDocuments({ canal: 'email', estado: 'enviado' })
const fallidos = await EnvioNotificacion.find({ canal: 'email', estado: { $ne: 'enviado' } }).select('titulo estado error')

console.log(`\n${'─'.repeat(64)}`)
console.log(`Pasos verificados   : ${pasos - fallos}/${pasos}`)
console.log(`Correos entregados  : ${enviados}/${pendientes}`)
if (fallidos.length) {
  console.log(`\nEnvíos con problema:`)
  fallidos.forEach((f) => console.log(`  ✗ "${f.titulo}" [${f.estado}] ${f.error || ''}`))
}
console.log('─'.repeat(64))

await mongoose.disconnect()
await mongod.stop()

const exito = fallos === 0 && fallidos.length === 0
console.log(
  exito
    ? '\nRESULTADO: la publicación automática y la notificación por correo funcionan de punta a punta.\n'
    : '\nRESULTADO: hay fallos, revisa el detalle arriba.\n'
)
process.exit(exito ? 0 : 1)
