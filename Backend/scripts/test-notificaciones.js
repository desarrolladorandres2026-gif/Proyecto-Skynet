// Envía un ejemplo real por cada categoría del catálogo (más uno
// transaccional) a un usuario de prueba, usando el motor real
// (notificar + procesarPendientes) — no es una simulación: llega por SMTP
// de verdad. Pensado para revisar visualmente la plantilla de correo
// (notificaciones.plantillas.js) con contenido representativo de cada
// módulo. Idempotente en el usuario (upsert por email); las filas de
// EnvioNotificacion que crea son auditoría legítima, no hace falta borrarlas.
import mongoose from 'mongoose'
import crypto from 'node:crypto'
import { connectDB } from '../src/config/db.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import EnvioNotificacion from '../src/models/EnvioNotificacion.js'
import { notificar, procesarPendientes } from '../src/modules/notificaciones/notificaciones.service.js'
import { hashPassword } from '../src/utils/password.js'

const EMAIL_PRUEBA = process.argv[2] || 'felipemartinez101203@gmail.com'

async function obtenerOCrearUsuarioPrueba() {
  let usuario = await Usuario.findOne({ email: EMAIL_PRUEBA })
  if (usuario) {
    console.log(`Usuario de prueba ya existía: ${usuario.nombre_usuario} (${usuario.email})`)
    return usuario
  }

  const rol = await Rol.findOne({ estado: 'activo' }).sort({ createdAt: 1 })
  if (!rol) throw new Error('No hay ningún Rol activo en la base de datos para asociar al usuario de prueba')

  usuario = await Usuario.create({
    nombre_usuario: 'prueba.notificaciones',
    nombre: 'Prueba Notificaciones',
    // Password aleatoria, nunca se usa para iniciar sesión: esta cuenta solo
    // existe como destinatario de correo de prueba.
    password: await hashPassword(crypto.randomUUID() + crypto.randomUUID()),
    email: EMAIL_PRUEBA,
    rol: rol._id,
    estado: 'activo',
  })
  console.log(`Usuario de prueba creado: ${usuario.nombre_usuario} (${usuario.email}) — puedes borrarlo cuando quieras.`)
  return usuario
}

const EVENTOS = [
  {
    categoria: 'mantenimiento', tipo: 'orden-asignada',
    titulo: 'Orden de trabajo asignada',
    cuerpo: 'Tienes una nueva orden: mantenimiento preventivo del vehículo TTN-045.',
    url: '/mantenimiento/ordenes',
  },
  {
    categoria: 'danos', tipo: 'reporte-nuevo',
    titulo: 'Nuevo reporte de daño',
    cuerpo: 'Se reportó un daño en la Plataforma 3: vidrio de la sala de espera roto.',
    url: '/danos/tareas',
  },
  {
    categoria: 'requerimientos', tipo: 'requerimiento-creado',
    titulo: 'Nuevo requerimiento pendiente',
    cuerpo: 'Juan Pérez solicitó un requerimiento de compra: 10 resmas de papel para el área de Operación.',
    url: '/requerimientos/mios',
  },
  {
    categoria: 'sistema', tipo: 'alerta-seguridad', transaccional: true,
    titulo: 'Alerta de seguridad',
    cuerpo: 'Se detectó un inicio de sesión desde un dispositivo nuevo. Si no fuiste tú, cambia tu contraseña.',
    url: '/dashboard',
  },
]

async function main() {
  await connectDB()
  const usuario = await obtenerOCrearUsuarioPrueba()

  const idsCreados = []
  for (const evento of EVENTOS) {
    const filas = await notificar({ usuarios: [usuario._id], ...evento })
    idsCreados.push(...filas.map((f) => f._id))
    console.log(`Encolado [${evento.categoria}]: ${evento.titulo}`)
  }

  console.log('\nProcesando la cola (envío real por SMTP)...')
  await procesarPendientes(50)

  const resultado = await EnvioNotificacion.find({ _id: { $in: idsCreados } }).select('categoria canal estado error')
  console.log('\nResultado:')
  for (const r of resultado) {
    console.log(`  ${r.canal.padEnd(6)} ${r.categoria.padEnd(14)} -> ${r.estado}${r.error ? `  (${r.error})` : ''}`)
  }

  const fallidos = resultado.filter((r) => r.estado !== 'enviado')
  if (fallidos.length) {
    console.log(`\n${fallidos.length} envío(s) no se pudieron enviar. Revisa EMAIL_HOST/EMAIL_USER/EMAIL_PASS en .env.`)
    process.exitCode = 1
  } else {
    console.log(`\nListo: ${resultado.length} correos enviados a ${EMAIL_PRUEBA}.`)
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
