import { connectDB } from '../src/config/db.js'
import Usuario from '../src/models/Usuario.js'
import { hashPassword } from '../src/utils/password.js'
import { sembrarCatalogoRBAC } from '../src/seedData/rbacCatalogo.js'
import mongoose from 'mongoose'

async function crearSiNoExiste({ email, password, rolNombre, ...resto }) {
  const existente = await Usuario.findOne({ email })
  if (existente) {
    console.log(`El usuario "${email}" ya existe, no se crea de nuevo.`)
    return
  }

  const passwordHash = await hashPassword(password)
  await Usuario.create({ email, password: passwordHash, ...resto })
  console.log(`Usuario creado: email="${email}" password="${password}" (rol: ${rolNombre})`)
}

async function seed() {
  await connectDB()

  const rolIdPorSlug = await sembrarCatalogoRBAC()

  // Los usuarios seed conservan modulos:['mantenimiento'] para poder probar
  // en QA que el acceso al módulo legado no se ve afectado por el rol nuevo
  // asignado (ver plan de Fase 0: regresión legada).
  const MODULOS_LEGADOS = ['mantenimiento']

  await crearSiNoExiste({
    nombre_usuario: 'admin',
    nombre: 'Super Administrador',
    email: 'admin@skynet.local',
    // Contraseña por defecto solo para desarrollo. Cumple la política (>=12) y
    // debe cambiarse tras el primer arranque en cualquier entorno real.
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin.Skynet.2026',
    rol: rolIdPorSlug.get('super_admin'),
    rolNombre: 'Super Administrador',
    modulos: MODULOS_LEGADOS,
    estado: 'activo',
  })

  await crearSiNoExiste({
    nombre_usuario: 'administrador',
    nombre: 'Administrador de Prueba',
    email: 'administrador@skynet.local',
    password: process.env.SEED_ADMINISTRADOR_PASSWORD || 'Administrador.Skynet.2026',
    rol: rolIdPorSlug.get('administrador'),
    rolNombre: 'Administrador',
    modulos: MODULOS_LEGADOS,
    estado: 'activo',
  })

  await crearSiNoExiste({
    nombre_usuario: 'seguridad',
    nombre: 'Seguridad de Prueba',
    email: 'seguridad@skynet.local',
    password: process.env.SEED_SEGURIDAD_PASSWORD || 'Seguridad.Skynet.2026',
    rol: rolIdPorSlug.get('seguridad'),
    rolNombre: 'Seguridad',
    modulos: MODULOS_LEGADOS,
    estado: 'activo',
  })

  await crearSiNoExiste({
    nombre_usuario: 'usuario',
    nombre: 'Operador de Prueba',
    email: 'usuario@skynet.local',
    password: process.env.SEED_USER_PASSWORD || 'Usuario.Skynet.2026',
    rol: rolIdPorSlug.get('operador'),
    rolNombre: 'Operador',
    modulos: MODULOS_LEGADOS,
    estado: 'activo',
  })

  await crearSiNoExiste({
    nombre_usuario: 'mantenimiento',
    nombre: 'Técnico de Mantenimiento de Prueba',
    email: 'mantenimiento@skynet.local',
    password: process.env.SEED_MANTENIMIENTO_PASSWORD || 'Mantenimiento.Skynet.2026',
    rol: rolIdPorSlug.get('mantenimiento'),
    rolNombre: 'Mantenimiento',
    // Acceso al módulo legado de mantenimiento de equipos además de las
    // tareas de daños del RBAC nuevo.
    modulos: ['mantenimiento'],
    estado: 'activo',
  })

  await mongoose.disconnect()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
