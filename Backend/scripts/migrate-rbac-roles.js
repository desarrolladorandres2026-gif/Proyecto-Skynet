import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import { sembrarCatalogoRBAC } from '../src/seedData/rbacCatalogo.js'

// 'admin' legado -> Super Administrador (mismo alcance: hoy es el único rol
// que pasa soloAdmin, y Super Administrador es esSuperAdmin:true).
// 'usuario' legado -> Operador (el rol menos privilegiado del catálogo
// nuevo). Un Super Admin debe revisar/reasignar manualmente tras migrar.
const MAPEO_ROL_LEGADO = { admin: 'super_admin', usuario: 'operador' }

// Corre contra el driver nativo de Mongo, NO contra el modelo Mongoose ya
// migrado: en cuanto Usuario.js declara `rol: ObjectId`, cualquier documento
// que aún tenga `rol:"admin"` (string) provoca un CastError al hidratarse.
// Es idempotente (filtra por rol todavía string) y seguro de correr antes o
// después de desplegar el código nuevo.
async function migrarUsuarios(rolIdPorSlug) {
  const coleccion = mongoose.connection.db.collection('usuarios')
  const cursor = coleccion.find({ rol: { $type: 'string' } })

  let migrados = 0
  for await (const doc of cursor) {
    const slugDestino = MAPEO_ROL_LEGADO[doc.rol]
    if (!slugDestino) {
      console.warn(`Usuario ${doc._id} tiene rol legado desconocido "${doc.rol}", se omite`)
      continue
    }
    await coleccion.updateOne(
      { _id: doc._id },
      { $set: { rol: rolIdPorSlug.get(slugDestino) }, $inc: { tokenVersion: 1 } }
    )
    migrados++
  }
  console.log(`Usuarios migrados: ${migrados}`)
}

async function run() {
  await connectDB()
  const rolIdPorSlug = await sembrarCatalogoRBAC()
  console.log(`Catálogo RBAC sembrado/actualizado: ${rolIdPorSlug.size} roles.`)
  await migrarUsuarios(rolIdPorSlug)
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
