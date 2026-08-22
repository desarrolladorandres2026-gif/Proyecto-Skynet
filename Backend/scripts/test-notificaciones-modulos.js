// Prueba de flujo END-TO-END del sistema de notificaciones tras la auditoría
// 2026-08-22 (bug: `esPrueba: false` en usuariosConPermiso/tecnicosDeMantenimiento
// dejaba fuera de las alertas a cuentas reales creadas antes de la migración
// de usuarios de prueba). Ejercita los SERVICIOS REALES de los 3 módulos
// afectados (requerimientos, daños, mantenimiento) con 5 eventos que SÍ deben
// notificar en cada uno — igual criterio que test-flujo-notificaciones.js,
// pero marcando a propósito a los destinatarios (financiero, bodega,
// supervisor, técnicos) como `esPrueba: true` para reproducir EXACTAMENTE el
// escenario que estaba roto en producción y comprobar que el fix los sigue
// notificando.
//
// - Base de datos: Mongo EN MEMORIA. No toca el Atlas real, así que no deja
//   usuarios/reportes/requerimientos de prueba en la base del Terminal.
// - SMTP: REAL (el de .env). Los correos salen de verdad al destinatario.
// - Push: NO se prueba aquí — requiere una suscripción real de navegador que
//   no se puede simular desde un script. Solo se valida email + el registro
//   interno de la campana (colección Notificacion).
//
// Uso:  node scripts/test-notificaciones-modulos.js [correo-destino]
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { MongoMemoryServer } from 'mongodb-memory-server'

const EMAIL_DESTINO = process.argv[2] || 'desarrolladorandres2026@gmail.com'

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
const { default: Notificacion } = await import('../src/models/Notificacion.js')

const requerimientos = await import('../src/modules/requerimientos/requerimientos.service.js')
const danos = await import('../src/modules/danos/danos.service.js')
const ordenes = await import('../src/modules/mantenimiento/ordenes.service.js')
const { procesarPendientes } = await import('../src/modules/notificaciones/notificaciones.service.js')

const PASSWORD = 'clave-de-prueba-123'
let pasos = 0
let fallos = 0

// Usuario.email es único, así que los actores no pueden compartir la misma
// dirección. Se usa sub-direccionamiento ("usuario+etiqueta@gmail.com"):
// Gmail lo entrega al mismo buzón, y el campo "Para:" del correo recibido
// muestra a qué rol iba dirigido cada aviso — útil para revisar la prueba.
function emailDe(rol) {
  const [local, dominio] = EMAIL_DESTINO.split('@')
  return `${local}+${rol}@${dominio}`
}

async function crearUsuario(nombre, permisos = [], { esPrueba = false, firma = false } = {}) {
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
  const datos = {
    nombre_usuario: nombre,
    nombre: nombre,
    password: await bcrypt.hash(PASSWORD, 4),
    email: emailDe(nombre),
    rol: rol._id,
    cargo: 'Cargo de prueba',
    modulos: ['mantenimiento'],
    esPrueba,
  }
  if (firma) datos.firma = { url: 'https://example.com/firma-prueba.png' }
  const usuario = await Usuario.create(datos)
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
// requerimientos.service.js dispara notificarUsuarios() SIN await (fire-and-
// forget: la respuesta HTTP no debe esperar al correo) — a diferencia de
// danos/ordenes, que sí lo esperan. Sin esta pausa, verificar() corre antes
// de que el insertMany del aviso termine y el conteo se corre al paso
// siguiente. No es un bug de la app, es una carrera propia de este script.
const esperarNotificacionAsincrona = () => new Promise((r) => setTimeout(r, 50))

let vistos = 0
async function verificar(descripcion, esperado) {
  const total = await EnvioNotificacion.countDocuments({ canal: 'email' })
  const nuevos = total - vistos
  vistos = total
  pasos += 1
  const ok = esperado === 0 ? nuevos === 0 : nuevos >= esperado
  if (!ok) fallos += 1
  const detalle = await EnvioNotificacion.find({ canal: 'email' }).sort({ createdAt: -1 }).limit(nuevos).select('titulo')
  console.log(
    `  ${ok ? '✓' : '✗'} ${descripcion.padEnd(50)} ${nuevos} correo(s)` +
      (nuevos ? ` → ${detalle.map((d) => `"${d.titulo}"`).join(', ')}` : '') +
      (ok ? '' : ` (esperaba ${esperado === 0 ? 'exactamente 0' : 'al menos ' + esperado})`)
  )
}

console.log(`\nPrueba de notificaciones por módulo (5 eventos c/u que SÍ deben avisar)`)
console.log(`Destino: ${EMAIL_DESTINO}`)
console.log(`Base de datos: Mongo en memoria (el Atlas real no se toca)`)
console.log(`Reproduce el bug 2026-08-22: financiero/bodega/supervisor/técnicos nacen con esPrueba:true\n`)

// ── Actores ────────────────────────────────────────────────────────────────
// solicitante queda esPrueba:false (representa a cualquier empleado real
// pidiendo/reportando algo); el resto se marca esPrueba:true a propósito
// porque son justo los roles que en producción quedaron sin notificar.
const solicitante = await crearUsuario('solicitante')
const financiero = await crearUsuario('financiero', ['requerimientos:aprobar_financiero'], { esPrueba: true, firma: true })
const bodega = await crearUsuario('bodega', ['requerimientos:gestionar_bodega'], { esPrueba: true })
const supervisor = await crearUsuario('supervisor', ['mantenimiento:asignar', 'mantenimiento:ver_todas', 'mantenimiento:aprobar_cerrar'], { esPrueba: true })
const tecnico = await crearUsuario('tecnico', ['mantenimiento:ejecutar'], { esPrueba: true })
const tecnico2 = await crearUsuario('tecnico-b', ['mantenimiento:ejecutar'], { esPrueba: true })

// ── 1. REQUERIMIENTOS (5 eventos) ───────────────────────────────────────────
console.log('MÓDULO REQUERIMIENTOS')
const req1 = await requerimientos.crearRequerimiento(
  { tipo: 'compra', itemsCompra: [{ descripcionProducto: 'Resma de papel carta', cantidad: 5, fechaSolicitud: new Date() }] },
  solicitante.actor
)
await esperarNotificacionAsincrona()
await verificar('1. crear requerimiento → avisa a Financiero', 1)

await requerimientos.aprobarComoFinanciero(req1._id, { password: PASSWORD }, financiero.actor)
await esperarNotificacionAsincrona()
await verificar('2. Financiero aprueba → avisa a Bodega', 1)

await requerimientos.marcarEstadoBodega(req1._id, { estado: 'aprobada', observacion: 'Entregado en almacén', password: PASSWORD }, bodega.actor)
await esperarNotificacionAsincrona()
await verificar('3. Bodega despacha → avisa al solicitante', 1)

const req2 = await requerimientos.crearRequerimiento(
  { tipo: 'servicio', detalleServicio: { descripcionTipoServicio: 'Fumigación de oficinas' } },
  solicitante.actor
)
await esperarNotificacionAsincrona()
vistos = await EnvioNotificacion.countDocuments({ canal: 'email' })
await requerimientos.rechazarComoFinanciero(req2._id, { motivoRechazo: 'Sin presupuesto este trimestre' }, financiero.actor)
await esperarNotificacionAsincrona()
await verificar('4. Financiero rechaza → avisa al solicitante', 1)

const req3 = await requerimientos.crearRequerimiento(
  { tipo: 'compra', itemsCompra: [{ descripcionProducto: 'Extintor 10 lbs', cantidad: 2, fechaSolicitud: new Date() }] },
  solicitante.actor
)
await requerimientos.aprobarComoFinanciero(req3._id, { password: PASSWORD }, financiero.actor)
await esperarNotificacionAsincrona()
vistos = await EnvioNotificacion.countDocuments({ canal: 'email' })
await requerimientos.marcarEstadoBodega(req3._id, { estado: 'no_aprobada', observacion: 'No hay existencias, se pidió al proveedor' }, bodega.actor)
await esperarNotificacionAsincrona()
await verificar('5. Bodega no puede despachar → avisa a solicitante+Financiero/Admin', 2)

// ── 2. REPORTES DE DAÑOS (5 eventos) ────────────────────────────────────────
console.log('\nMÓDULO REPORTES DE DAÑOS')
const reporteA = await ReporteDano.create({
  tipo: 'dano',
  fecha: new Date(),
  descripcion: 'Vidrio agrietado en la puerta de la plataforma 3',
  reportadoPor: solicitante.doc._id,
  foto: { url: 'https://example.com/foto.jpg' },
})
await danos.asignarAutomaticamente(reporteA)
await verificar('1. crear reporte → reparto automático avisa al técnico', 1)

// La máquina de estados exige pasar por en_proceso antes de en_espera (no
// hay salto directo asignado -> en_espera); este primer tramo es silencioso
// por diseño (ver notificarCambioEstado), así que no se cuenta como evento.
await danos.cambiarEstadoReporte(reporteA._id, { estado: 'en_proceso', nota: 'Se pidió el vidrio al proveedor' }, tecnico.actor)
await danos.cambiarEstadoReporte(reporteA._id, { estado: 'en_espera', motivoEspera: 'repuestos', nota: 'Falta el vidrio' }, tecnico.actor)
await verificar('2. técnico pausa (en_espera) → avisa a supervisores', 1)

await danos.cambiarEstadoReporte(reporteA._id, { estado: 'en_proceso', nota: 'Llegó el vidrio' }, tecnico.actor)
await danos.cambiarEstadoReporte(
  reporteA._id,
  { estado: 'resuelto', nota: 'Vidrio reemplazado', reparacion: { fecha: new Date(), modulo: 'regional', evidenciasNuevas: [{ url: 'https://example.com/reparacion.jpg' }] } },
  tecnico.actor
)
await verificar('3. técnico resuelve → avisa al reportante', 1)

const reporteB = await ReporteDano.create({
  tipo: 'dano',
  fecha: new Date(),
  descripcion: 'Puerta de emergencia con bisagra suelta',
  reportadoPor: solicitante.doc._id,
  foto: { url: 'https://example.com/foto2.jpg' },
})
await danos.asignarAutomaticamente(reporteB)
await verificar('4. segundo reporte → reparto automático avisa al técnico', 1)

// El reparto automático pudo tocarle a cualquiera de los dos técnicos (ambos
// quedaron con carga 0 tras resolver reporteA) — se reasigna al OTRO para
// garantizar un cambio real de responsable.
const asignadoActual = String((await ReporteDano.findById(reporteB._id)).asignadoA)
const otroTecnico = asignadoActual === String(tecnico.doc._id) ? tecnico2 : tecnico
await danos.asignarReporte(reporteB._id, { tecnicoId: otroTecnico.doc._id, nota: 'Se reparte carga entre el equipo' }, supervisor.actor)
await verificar('5. supervisor reasigna → avisa a técnico nuevo y anterior', 2)

// ── 3. MANTENIMIENTO (Orden de Trabajo, 5 eventos) ──────────────────────────
console.log('\nMÓDULO MANTENIMIENTO (Orden de Trabajo)')
const equipo1 = await Equipo.create({
  nombre: 'Equipo de prueba 1', numero_inventario: 'TTN-QA-001', serial: 'SN-QA-001',
  tipo: { id: new mongoose.Types.ObjectId(), nombre: 'Computador' },
  marca: { id: new mongoose.Types.ObjectId(), nombre: 'Genérica' },
  modelo: 'QA-1', ubicacion: 'Oficina de pruebas', responsable: 'QA', dependencia: 'Sistemas', estado_actual: 'Operativo',
})

const ot1 = await ordenes.reportarProblema(
  { equipoId: equipo1._id, descripcion: 'No enciende tras el corte de energía', prioridad: 'alta' },
  solicitante.actor
)
await verificar('1. reportar problema → avisa a supervisores', 1)

await ordenes.asignarTecnico(ot1._id, { tecnicoId: tecnico.doc._id }, supervisor.actor)
await verificar('2. supervisor asigna → avisa al técnico', 1)

await ordenes.aceptarOrden(ot1._id, tecnico.actor)
await ordenes.resolverOrden(ot1._id, { descripcion_solucion: 'Se reemplazó la fuente de poder' }, tecnico.actor)
await verificar('3. técnico resuelve → avisa a quien aprueba el cierre', 1)

await ordenes.aprobarCierre(ot1._id, { comentario: 'Verificado en sitio' }, supervisor.actor)
await verificar('4. supervisor aprueba cierre → avisa al técnico', 1)

const equipo2 = await Equipo.create({
  nombre: 'Equipo de prueba 2', numero_inventario: 'TTN-QA-002', serial: 'SN-QA-002',
  tipo: { id: new mongoose.Types.ObjectId(), nombre: 'Impresora' },
  marca: { id: new mongoose.Types.ObjectId(), nombre: 'Genérica' },
  modelo: 'QA-2', ubicacion: 'Oficina de pruebas', responsable: 'QA', dependencia: 'Sistemas', estado_actual: 'Operativo',
})
const ot2 = await ordenes.reportarProblema(
  { equipoId: equipo2._id, descripcion: 'Atasco de papel constante', prioridad: 'media' },
  solicitante.actor
)
vistos = await EnvioNotificacion.countDocuments({ canal: 'email' })
await ordenes.escalarOrden(ot2._id, { motivo: 'Requiere repuesto importado, escalando', destino: 'jefatura' }, supervisor.actor)
await verificar('5. supervisor escala la orden → avisa a supervisores', 1)

// ── Envío real ─────────────────────────────────────────────────────────────
const pendientes = await EnvioNotificacion.countDocuments({ estado: 'pendiente', canal: 'email' })
console.log(`\nEnviando ${pendientes} correos por SMTP real a ${EMAIL_DESTINO} (+etiqueta por rol)...`)
await procesarPendientes(200)

const enviados = await EnvioNotificacion.countDocuments({ canal: 'email', estado: 'enviado' })
const fallidos = await EnvioNotificacion.find({ canal: 'email', estado: { $ne: 'enviado' } }).select('titulo estado error emailDestino')
const campana = await Notificacion.countDocuments()

console.log(`\n${'─'.repeat(70)}`)
console.log(`Eventos verificados       : ${pasos - fallos}/${pasos}`)
console.log(`Correos entregados        : ${enviados}/${pendientes}`)
console.log(`Notificaciones internas   : ${campana} (campana / centro de notificaciones)`)
console.log(`Push                      : NO probado (requiere suscripción real de navegador)`)
if (fallidos.length) {
  console.log(`\nEnvíos con problema:`)
  fallidos.forEach((f) => console.log(`  ✗ "${f.titulo}" → ${f.emailDestino} [${f.estado}] ${f.error || ''}`))
}
console.log('─'.repeat(70))

await mongoose.disconnect()
await mongod.stop()

const exito = fallos === 0 && fallidos.length === 0
console.log(exito
  ? '\nRESULTADO: los 15 eventos (5 por módulo) disparan y entregan correo, incluso con destinatarios esPrueba:true.\n'
  : '\nRESULTADO: hay fallos, revisa el detalle arriba.\n')
process.exit(exito ? 0 : 1)
