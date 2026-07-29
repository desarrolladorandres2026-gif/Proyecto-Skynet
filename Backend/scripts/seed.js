import { connectDB } from '../src/config/db.js'
import Usuario from '../src/models/Usuario.js'
import Empresa from '../src/models/Empresa.js'
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

async function crearEmpresaDemoSiNoExiste() {
  const existente = await Empresa.findOne({ nit: '900123456-1' })
  if (existente) return existente
  return Empresa.create({ nombre: 'Transportes Demo S.A.S.', nit: '900123456-1', estado: 'activo' })
}

async function seed() {
  await connectDB()

  const rolIdPorSlug = await sembrarCatalogoRBAC()
  const empresaDemo = await crearEmpresaDemoSiNoExiste()

  // Los 6 usuarios seed conservan modulos:['mantenimiento','sigittn'] para
  // poder probar en QA que el acceso a los módulos legados no se ve afectado
  // por el rol nuevo asignado (ver plan de Fase 0: regresión legada).
  const MODULOS_LEGADOS = ['mantenimiento', 'sigittn']

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
    nombre_usuario: 'empresa',
    nombre: 'Empresa Transportadora de Prueba',
    email: 'empresa@skynet.local',
    password: process.env.SEED_EMPRESA_PASSWORD || 'Empresa.Skynet.2026',
    rol: rolIdPorSlug.get('empresa_transportadora'),
    rolNombre: 'Empresa Transportadora',
    empresa: empresaDemo._id,
    modulos: MODULOS_LEGADOS,
    estado: 'activo',
  })

  await crearSiNoExiste({
    nombre_usuario: 'despachador',
    nombre: 'Despachador de Prueba',
    email: 'despachador@skynet.local',
    password: process.env.SEED_DESPACHADOR_PASSWORD || 'Despachador.Skynet.2026',
    rol: rolIdPorSlug.get('despachador'),
    rolNombre: 'Despachador',
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
    nombre_usuario: 'usuario.comun',
    nombre: 'Usuario Común de Prueba',
    email: 'usuario.comun@skynet.local',
    password: process.env.SEED_USUARIO_COMUN_PASSWORD || 'UsuarioComun.Skynet.2026',
    rol: rolIdPorSlug.get('usuario_comun'),
    rolNombre: 'Usuario Común',
    // Sin módulos legados: este rol solo reporta daños y hace la inducción.
    modulos: [],
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
