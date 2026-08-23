#!/usr/bin/env node
/**
 * Smoke test post-restore — Fase 13/14 de la auditoría de producción
 * 2026-08-22. Se corre DESPUÉS de scripts/backup/restaurar.js, contra la
 * base recién restaurada (--uri explícito, nunca implícito), para confirmar
 * que lo que se restauró es funcionalmente coherente ANTES de promoverla a
 * producción real — ver docs/OPERACION-RESTORE.md.
 *
 * No sustituye una revisión humana de los datos críticos (paso 8 del
 * runbook); esto es la primera verificación automática y rápida.
 *
 * Uso:
 *   node scripts/verificar-restore.js --uri "mongodb://localhost:27017/skynet_restore_test"
 */
import mongoose from 'mongoose'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import RegistroAuditoria from '../src/models/RegistroAuditoria.js'
import Requerimiento from '../src/models/Requerimiento.js'
import Notificacion from '../src/models/Notificacion.js'

function leerArgumento(nombre) {
  const idx = process.argv.indexOf(`--${nombre}`)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const checks = []
function reportar(nombre, ok, detalle) {
  checks.push({ nombre, ok, detalle })
  console.log(`${ok ? '✅' : '❌'}  ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

async function main() {
  const uri = leerArgumento('uri')
  if (!uri) {
    console.error('\nUso: node scripts/verificar-restore.js --uri "<mongo-uri>"\n')
    process.exitCode = 1
    return
  }

  console.log(`Conectando a ${uri.replace(/:\/\/[^@]+@/, '://***:***@')}...\n`)
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
    reportar('Conexión a MongoDB', true)
  } catch (err) {
    reportar('Conexión a MongoDB', false, err.message)
    imprimirResumenYSalir()
    return
  }

  try {
    const usuariosActivos = await Usuario.countDocuments({ estado: 'activo' })
    reportar('Hay usuarios activos', usuariosActivos > 0, `${usuariosActivos} encontrado(s)`)

    const superAdminRoles = await Rol.find({ esSuperAdmin: true, estado: 'activo' }).select('_id')
    const idsSuperAdmin = superAdminRoles.map((r) => r._id)
    const haySuperAdminActivo = idsSuperAdmin.length > 0 && (await Usuario.countDocuments({ rol: { $in: idsSuperAdmin }, estado: 'activo' })) > 0
    reportar('Existe al menos un Super Admin activo (RBAC intacto)', haySuperAdminActivo)

    const totalRoles = await Rol.countDocuments({})
    reportar('El catálogo de roles no está vacío', totalRoles > 0, `${totalRoles} rol(es)`)

    // Estos tres son solo informativos (un dato en 0 no es necesariamente un
    // fallo — depende del rango restaurado), pero confirman que las
    // colecciones existen y son legibles sin error de esquema/cast.
    const auditoria = await RegistroAuditoria.countDocuments({})
    console.log(`ℹ️   RegistroAuditoria: ${auditoria} documento(s)`)
    const requerimientos = await Requerimiento.countDocuments({})
    console.log(`ℹ️   Requerimiento: ${requerimientos} documento(s)`)
    const notificaciones = await Notificacion.countDocuments({})
    console.log(`ℹ️   Notificacion: ${notificaciones} documento(s)`)

    // Lectura real de un documento con populate (ejercita relaciones, no
    // solo conteo): confirma que al menos un Usuario resuelve su Rol sin
    // error de referencia rota.
    const usuarioConRol = await Usuario.findOne({ estado: 'activo' }).populate('rol')
    reportar('Un usuario activo resuelve su Rol vía populate (referencias sanas)', Boolean(usuarioConRol?.rol))
  } catch (err) {
    reportar('Lectura de colecciones', false, err.message)
  }

  await mongoose.disconnect()
  imprimirResumenYSalir()
}

function imprimirResumenYSalir() {
  const fallidos = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - fallidos.length}/${checks.length} verificaciones pasaron.`)
  if (fallidos.length > 0) {
    console.log('\n🛑  Hay verificaciones fallidas — NO promuevas esta restauración a producción sin investigar primero.')
    process.exitCode = 1
  } else {
    console.log('\n✅  Smoke test básico superado. Sigue con el paso 8 del runbook (confirmar datos críticos a mano).')
  }
}

main().catch((err) => {
  console.error('❌  Verificación falló inesperadamente:', err.message)
  process.exitCode = 1
})
