/**
 * Script puntual: otorga el permiso 'catalogos:gestionar' (agregar/eliminar
 * Dependencias y Cargos, ver seedData/rbac.data.js) a los roles semilla que
 * ya deberían tenerlo por PERMISOS_ADMINISTRADOR_BASE — administrador y
 * administrativo_financiero (Dir. Administrativo y Gestión).
 *
 * Necesario porque sembrarCatalogoRBAC() usa $setOnInsert para no pisar
 * personalizaciones hechas desde la pantalla Roles: un rol que ya existía en
 * la base (como estos dos) nunca recibe automáticamente un permiso agregado
 * después en el código. Solo un Super Admin (bypass total) podía crear
 * catálogos nuevos hasta correr esto.
 *
 * Idempotente: si el rol ya tiene el permiso, no hace nada.
 *
 * Uso:
 *   node scripts/otorgar-permiso-catalogos.js
 */

import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'

const SLUGS_DESTINO = ['administrador', 'administrativo_financiero']

// Mismo literal que seedData/rbac.data.js — se upserta aquí también (no solo
// se busca) para no depender de que el backend desplegado ya haya arrancado
// con el código nuevo y corrido sincronizarCatalogoSistema().
const DEF_PERMISO = {
  codigo: 'catalogos:gestionar',
  modulo: 'catalogos',
  accion: 'gestionar',
  nombre: 'Agregar y eliminar dependencias y cargos',
}

async function run() {
  await connectDB()

  const permiso = await Permiso.findOneAndUpdate(
    { codigo: DEF_PERMISO.codigo },
    { $setOnInsert: DEF_PERMISO },
    { upsert: true, new: true }
  )

  for (const slug of SLUGS_DESTINO) {
    const rol = await Rol.findOne({ slug })
    if (!rol) {
      console.log(`ℹ️  El rol con slug "${slug}" no existe en la BD — nada que hacer.`)
      continue
    }

    const yaLoTiene = rol.permisos.some((id) => id.equals(permiso._id))
    if (yaLoTiene) {
      console.log(`ℹ️  El rol "${rol.nombre}" ya tenía el permiso — sin cambios.`)
      continue
    }

    await Rol.updateOne({ _id: rol._id }, { $addToSet: { permisos: permiso._id } })
    console.log(`✅  Permiso "catalogos:gestionar" agregado al rol "${rol.nombre}".`)
  }

  console.log('\n🏁  Listo.')
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Error inesperado:', err)
  process.exit(1)
})
