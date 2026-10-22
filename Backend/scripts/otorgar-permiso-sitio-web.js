/**
 * Script puntual: otorga el permiso 'sitio_web:gestionar' (ver
 * seedData/rbac.data.js) a los roles semilla que deben tenerlo (administrador,
 * administrativo_financiero y comunicador).
 *
 * Necesario porque sincronizarCatalogoSistema() usa $setOnInsert para no
 * pisar personalizaciones hechas desde la pantalla Roles: un rol que ya
 * existía en la base nunca recibe automáticamente un permiso agregado
 * después en el código. Sin correr esto, solo un Super Admin (bypass total)
 * podría gestionar el sitio web hasta que alguien lo otorgue a mano desde Roles.
 *
 * Idempotente: si el rol ya tiene el permiso, no hace nada.
 *
 * Uso:
 *   node scripts/otorgar-permiso-sitio-web.js
 */

import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import { guardaProduccion } from './lib/guardaProduccion.js'

guardaProduccion({
  script: 'otorgar-permiso-sitio-web.js',
  operacion: "otorgar 'sitio_web:gestionar' a roles semilla",
})

const SLUGS_DESTINO = ['administrador', 'administrativo_financiero', 'comunicador']

// Mismo literal que seedData/rbac.data.js — se upserta aquí también (no solo
// se busca) para no depender de que el backend desplegado ya haya arrancado
// con el código nuevo y corrido sincronizarCatalogoSistema().
const DEF_PERMISO = {
  codigo: 'sitio_web:gestionar',
  modulo: 'sitio_web',
  accion: 'gestionar',
  nombre: 'Gestionar el sitio web público (noticias, eventos, avisos e imágenes)',
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
    if (rol.permisos.some((id) => id.equals(permiso._id))) {
      console.log(`ℹ️  El rol "${rol.nombre}" ya tenía el permiso — sin cambios.`)
      continue
    }
    await Rol.updateOne({ _id: rol._id }, { $addToSet: { permisos: permiso._id } })
    console.log(`✅  ${permiso.codigo} agregado al rol "${rol.nombre}".`)
  }

  console.log('\n🏁  Listo.')
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Error inesperado:', err)
  process.exit(1)
})
