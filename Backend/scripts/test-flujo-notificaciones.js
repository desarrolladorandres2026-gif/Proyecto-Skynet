// Prueba de flujo END-TO-END del sistema de notificaciones: ejercita los
// SERVICIOS REALES de cada módulo vivo (requerimientos, daños, mantenimiento)
// y verifica que cada transición de negocio dispara los correos correctos.
//
// A diferencia de test-notificaciones.js (que llama a notificar() directo con
// contenido sintético), aquí se recorre el flujo de verdad: crear un
// requerimiento llama a crearRequerimiento(), que a su vez decide a quién
// avisar según permisos RBAC reales.
//
// - Base de datos: Mongo EN MEMORIA. No toca el Atlas real, así que no deja
//   usuarios/reportes de prueba en la base del Terminal.
// - SMTP: REAL (el de .env). Los correos salen de verdad al destinatario.
//
// Uso:  node scripts/test-flujo-notificaciones.js [correo-destino]
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { MongoMemoryServer } from 'mongodb-memory-server'

const EMAIL_DESTINO = process.argv[2] || 'felipemartinez101203@gmail.com'

// La conexión se abre ANTES de importar nada que registre modelos o lea
// configuración de BD, para que todo el grafo de servicios use la instancia
// en memoria y no la URI de Atlas de .env.
const mongod = await MongoMemoryServer.create()
await mongoose.connect(mongod.getUri())

const { default: Usuario } = await import('../src/models/Usuario.js')
const { default: Rol } = await import('../src/models/Rol.js')
const { default: Permiso } = await import('../src/models/Permiso.js')
const { default: Equipo } = await import('../src/models/mantenimiento/Equipo.js')
const { default: ReporteDano } = await import('../src/models/ReporteDano.js')
const { default: EnvioNotificacion } = await import('../src/models/EnvioNotificacion.js')

const requerimientos = await import('../src/modules/requerimientos/requerimientos.service.js')
const danos = await import('../src/modules/danos/danos.service.js')
const ordenes = await import('../src/modules/mantenimiento/ordenes.service.js')
const { procesarPendientes } = await import('../src/modules/notificaciones/notificaciones.service.js')

const PASSWORD = 'clave-de-prueba-123'
let pasos = 0
let fallos = 0

// Usuario.email es único, así que los 5 actores no pueden compartir la misma
// dirección. Se usa sub-direccionamiento ("usuario+etiqueta@gmail.com"):
// Gmail lo entrega al mismo buzón, y el campo "Para:" del correo recibido
// muestra a qué rol iba dirigido cada aviso — útil para revisar la prueba.
function emailDe(rol) {
  const [local, dominio] = EMAIL_DESTINO.split('@')
  return `${local}+${rol}@${dominio}`
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
    nombre: nombre,
    password: await bcrypt.hash(PASSWORD, 4),
    email: emailDe(nombre),
    rol: rol._id,
    cargo: 'Cargo de prueba',
    modulos: ['mantenimiento'],
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

// Cuenta cuántos envíos de email NUEVOS aparecieron tras ejecutar un paso, y
// reporta si coincide con lo esperado. Es la aserción real de la prueba: no
// basta con que el servicio no lance error, tiene que haber avisado a alguien.
let vistos = 0
async function verificar(descripcion, esperado) {
  const total = await EnvioNotificacion.countDocuments({ canal: 'email' })
  const nuevos = total - vistos
  vistos = total
  pasos += 1
  // esperado===0 se comprueba EXACTO: hay transiciones que deben quedarse
  // calladas a propósito (ver el paso a "en_proceso" más abajo), y un correo
  // de más ahí sería tan defectuoso como uno de menos.
  const ok = esperado === 0 ? nuevos === 0 : nuevos >= esperado
  if (!ok) fallos += 1
  const detalle = await EnvioNotificacion.find({ canal: 'email' }).sort({ createdAt: -1 }).limit(nuevos).select('titulo')
  console.log(
    `  ${ok ? '✓' : '✗'} ${descripcion.padEnd(48)} ${nuevos} correo(s)` +
      (nuevos ? ` → ${detalle.map((d) => `"${d.titulo}"`).join(', ')}` : '') +
      (ok ? '' : ` (esperaba ${esperado === 0 ? 'exactamente 0' : 'al menos ' + esperado})`)
  )
}

console.log(`\nPrueba de flujo del sistema de notificaciones`)
console.log(`Destino: ${EMAIL_DESTINO}`)
console.log(`Base de datos: Mongo en memoria (el Atlas real no se toca)\n`)

// ── Actores ────────────────────────────────────────────────────────────────
const solicitante = await crearUsuario('solicitante')
const financiero = await crearUsuario('financiero', ['requerimientos:aprobar_financiero'])
const bodega = await crearUsuario('bodega', ['requerimientos:gestionar_bodega'])
const supervisor = await crearUsuario('supervisor', ['mantenimiento:asignar', 'mantenimiento:ver_todas', 'mantenimiento:aprobar_cerrar'])
const tecnico = await crearUsuario('tecnico', ['mantenimiento:ejecutar'])

// ── 1. REQUERIMIENTOS ──────────────────────────────────────────────────────
console.log('MÓDULO REQUERIMIENTOS')
const req1 = await requerimientos.crearRequerimiento(
  { tipo: 'compra', itemsCompra: [{ descripcionProducto: 'Resma de papel carta', cantidad: 5, fechaSolicitud: new Date() }] },
  solicitante.actor
)
await verificar('crear requerimiento → avisa a Financiero', 1)

await requerimientos.aprobarComoFinanciero(req1._id, { password: PASSWORD }, financiero.actor)
await verificar('Financiero aprueba → avisa a Bodega', 1)

await requerimientos.marcarEstadoBodega(req1._id, { estado: 'aprobada', observacion: 'Entregado en almacén' }, bodega.actor)
await verificar('Bodega aprueba → avisa al solicitante', 1)

const req2 = await requerimientos.crearRequerimiento(
  { tipo: 'servicio', detalleServicio: { descripcionTipoServicio: 'Fumigación de oficinas' } },
  solicitante.actor
)
vistos = await EnvioNotificacion.countDocuments({ canal: 'email' })
await requerimientos.rechazarComoFinanciero(req2._id, { motivoRechazo: 'Sin presupuesto este trimestre' }, financiero.actor)
await verificar('Financiero rechaza → avisa al solicitante', 1)

// ── 2. REPORTES DE DAÑOS ───────────────────────────────────────────────────
console.log('\nMÓDULO REPORTES DE DAÑOS')
const reporte = await ReporteDano.create({
  tipo: 'dano',
  fecha: new Date(),
  descripcion: 'Vidrio agrietado en la puerta de la plataforma 3',
  reportadoPor: solicitante.doc._id,
  foto: { url: 'https://example.com/foto.jpg' },
})
await danos.asignarAutomaticamente(reporte)
await verificar('crear reporte → reparto automático avisa', 1)

// Por diseño (ver notificarCambioEstado en danos.service.js), un estado
// intermedio movido por el propio responsable NO avisa a nadie: al reportante
// solo se le escribe cuando su daño queda resuelto, y el actor se excluye a
// sí mismo. Se verifica el silencio explícitamente para que un cambio futuro
// que empiece a mandar correos por cada paso salte aquí.
await danos.cambiarEstadoReporte(reporte._id, { estado: 'en_proceso', nota: 'Se pidió el vidrio al proveedor' }, tecnico.actor)
await verificar('técnico pasa a en_proceso → sin ruido (por diseño)', 0)

await danos.cambiarEstadoReporte(reporte._id, { estado: 'en_espera', motivoEspera: 'repuestos', nota: 'Falta el vidrio' }, tecnico.actor)
await verificar('técnico pausa (en_espera) → avisa a supervisores', 1)

// La máquina de estados no permite en_espera → resuelto directo: hay que
// reanudar primero (ver ESTADOS/transiciones en danos.service.js).
await danos.cambiarEstadoReporte(reporte._id, { estado: 'en_proceso', nota: 'Llegó el vidrio' }, tecnico.actor)
await danos.cambiarEstadoReporte(reporte._id, { estado: 'resuelto', nota: 'Vidrio reemplazado' }, tecnico.actor)
await verificar('técnico resuelve → avisa al reportante', 1)

// ── 3. MANTENIMIENTO (Orden de Trabajo) ────────────────────────────────────
console.log('\nMÓDULO MANTENIMIENTO (Orden de Trabajo)')
const equipo = await Equipo.create({
  nombre: 'Equipo de prueba',
  numero_inventario: 'TTN-QA-001',
  serial: 'SN-QA-001',
  tipo: { id: new mongoose.Types.ObjectId(), nombre: 'Computador' },
  marca: { id: new mongoose.Types.ObjectId(), nombre: 'Genérica' },
  modelo: 'QA-1',
  ubicacion: 'Oficina de pruebas',
  responsable: 'QA',
  dependencia: 'Sistemas',
  estado_actual: 'Operativo',
})

const ot = await ordenes.reportarProblema(
  { equipoId: equipo._id, descripcion: 'No enciende tras el corte de energía', prioridad: 'alta' },
  solicitante.actor
)
await verificar('reportar problema → avisa a supervisores', 1)

await ordenes.asignarTecnico(ot._id, { tecnicoId: tecnico.doc._id }, supervisor.actor)
await verificar('supervisor asigna → avisa al técnico', 1)

await ordenes.aceptarOrden(ot._id, tecnico.actor)
await ordenes.resolverOrden(ot._id, { descripcion_solucion: 'Se reemplazó la fuente de poder' }, tecnico.actor)
await verificar('técnico resuelve → avisa a quien aprueba', 1)

await ordenes.aprobarCierre(ot._id, { comentario: 'Verificado en sitio' }, supervisor.actor)
await verificar('supervisor aprueba cierre → avisa al técnico', 1)

// ── Envío real ─────────────────────────────────────────────────────────────
const pendientes = await EnvioNotificacion.countDocuments({ estado: 'pendiente', canal: 'email' })
console.log(`\nEnviando ${pendientes} correos por SMTP real...`)
await procesarPendientes(200)

const enviados = await EnvioNotificacion.countDocuments({ canal: 'email', estado: 'enviado' })
const fallidos = await EnvioNotificacion.find({ canal: 'email', estado: { $ne: 'enviado' } }).select('titulo estado error')

console.log(`\n${'─'.repeat(64)}`)
console.log(`Transiciones verificadas : ${pasos - fallos}/${pasos}`)
console.log(`Correos entregados       : ${enviados}/${pendientes}`)
if (fallidos.length) {
  console.log(`\nEnvíos con problema:`)
  fallidos.forEach((f) => console.log(`  ✗ "${f.titulo}" [${f.estado}] ${f.error || ''}`))
}
console.log('─'.repeat(64))

await mongoose.disconnect()
await mongod.stop()

const exito = fallos === 0 && fallidos.length === 0
console.log(exito ? '\nRESULTADO: todos los flujos disparan y entregan sus correos.\n' : '\nRESULTADO: hay fallos, revisa el detalle arriba.\n')
process.exit(exito ? 0 : 1)
