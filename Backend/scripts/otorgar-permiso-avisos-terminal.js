/**
 * Script puntual: otorga los permisos 'avisos_terminal:transmitir' y
 * 'avisos_terminal:ver_historial' (ver seedData/rbac.data.js) a los roles
 * semilla que ya deberían tenerlos por PERMISOS_ADMINISTRADOR_BASE y por el
 * rol 'comunicador' — administrador, administrativo_financiero (Dir.
 * Administrativo y Gestión) y comunicador.
 *
 * Necesario porque sincronizarCatalogoSistema() usa $setOnInsert para no
 * pisar personalizaciones hechas desde la pantalla Roles: un rol que ya
 * existía en la base nunca recibe automáticamente un permiso agregado
 * después en el código (ver el comentario en sistema.service.js). Sin correr
 * esto, solo un Super Admin (bypass total) podría transmitir avisos hasta
 * que alguien lo otorgue a mano desde Roles.
 *
 * Idempotente: si el rol ya tiene el permiso, no hace nada.
 *
 * Uso:
 *   node scripts/otorgar-permiso-avisos-terminal.js
 */

import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import { guardaProduccion } from './lib/guardaProduccion.js'

guardaProduccion({
  script: 'otorgar-permiso-avisos-terminal.js',
  operacion: "otorgar 'avisos_terminal:transmitir' y 'avisos_terminal:ver_historial' a roles semilla",
})

const SLUGS_DESTINO = ['administrador', 'administrativo_financiero', 'comunicador']

// Mismos literales que seedData/rbac.data.js — se upsertan aquí también (no
// solo se buscan) para no depender de que el backend desplegado ya haya
// arrancado con el código nuevo y corrido sincronizarCatalogoSistema().
const DEFS_PERMISO = [
  {
    codigo: 'avisos_terminal:transmitir',
    modulo: 'avisos_terminal',
    accion: 'transmitir',
    nombre: 'Transmitir avisos institucionales por voz (Avisos Terminal de Neiva)',
  },
  {
    codigo: 'avisos_terminal:ver_historial',
    modulo: 'avisos_terminal',
    accion: 'ver_historial',
    nombre: 'Ver historial de avisos institucionales transmitidos',
  },
]

async function run() {
  await connectDB()

  const permisos = []
  for (const def of DEFS_PERMISO) {
    const permiso = await Permiso.findOneAndUpdate(
      { codigo: def.codigo },
      { $setOnInsert: def },
      { upsert: true, new: true }
    )
    permisos.push(permiso)
  }

  for (const slug of SLUGS_DESTINO) {
    const rol = await Rol.findOne({ slug })
    if (!rol) {
      console.log(`ℹ️  El rol con slug "${slug}" no existe en la BD — nada que hacer.`)
      continue
    }

    const faltantes = permisos.filter((p) => !rol.permisos.some((id) => id.equals(p._id)))
    if (!faltantes.length) {
      console.log(`ℹ️  El rol "${rol.nombre}" ya tenía ambos permisos — sin cambios.`)
      continue
    }

    await Rol.updateOne({ _id: rol._id }, { $addToSet: { permisos: { $each: faltantes.map((p) => p._id) } } })
    console.log(`✅  ${faltantes.map((p) => p.codigo).join(', ')} agregado(s) al rol "${rol.nombre}".`)
  }

  console.log('\n🏁  Listo.')
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Error inesperado:', err)
  process.exit(1)
})
