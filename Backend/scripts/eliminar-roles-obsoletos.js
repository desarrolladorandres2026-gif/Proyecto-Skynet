/**
 * Script de limpieza: elimina de la base de datos los roles retirados del
 * catálogo RBAC (seedData/rbac.data.js) si todavía existen de una versión
 * anterior del sistema. El script es idempotente: si un rol ya no existe,
 * no hace nada.
 *
 * PRECAUCIÓN: Si hay usuarios asignados a un rol obsoleto, el script los
 * reasigna automáticamente al rol de reemplazo indicado en MAPEO_REASIGNACION
 * antes de borrar el rol, para que no queden huérfanos (Usuario.rol es
 * requerido).
 *
 * Uso:
 *   node scripts/eliminar-roles-obsoletos.js
 */

import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Rol from '../src/models/Rol.js'
import Usuario from '../src/models/Usuario.js'

// slug obsoleto -> slug del rol al que se reasignan sus usuarios.
const MAPEO_REASIGNACION = {
  // Retirados junto con el módulo de flota/despachos/horarios/novedades.
  despachador: 'operador',
  empresa_transportadora: 'operador',
  // OJO: 'usuario_comun' NO va en este mapeo. Estuvo aquí entre el
  // 2026-08-05 y el 2026-08-20 mandando sus usuarios a 'operador', y fue un
  // error: 'Operador' trae pqrs:gestionar, publicaciones:gestionar y
  // reportes:ver_basicos, así que la reasignación subía privilegios en vez
  // de conservarlos, y de paso dejaba el catálogo sin ninguna opción de
  // privilegio cero que asignar al editar un usuario. 'Usuario Común' está
  // de vuelta en seedData/rbac.data.js como rol de sistema: si lo agregas
  // aquí otra vez, este script lo borrará en la siguiente corrida.
  // El rol dedicado 'Financiero' se fusionó en 'Dir. Administrativo y
  // Gestión' (slug administrativo_financiero, mismo slug de antes de
  // renombrarse) el 2026-08-05: cualquier usuario que quedara con el rol
  // viejo pasa directo al rol fusionado, no a Operador.
  financiero: 'administrativo_financiero',
}

async function run() {
  await connectDB()

  let rolesEliminados = 0

  for (const [slugObsoleto, slugDestino] of Object.entries(MAPEO_REASIGNACION)) {
    const rol = await Rol.findOne({ slug: slugObsoleto })

    if (!rol) {
      console.log(`ℹ️  El rol con slug "${slugObsoleto}" no existe en la BD — nada que hacer.`)
      continue
    }

    const rolDestino = await Rol.findOne({ slug: slugDestino })
    if (!rolDestino) {
      console.error(
        `❌  No se encontró el rol destino "${slugDestino}" para reasignar usuarios de "${slugObsoleto}". Se omite este rol.`
      )
      continue
    }

    const { modifiedCount } = await Usuario.updateMany(
      { rol: rol._id },
      { $set: { rol: rolDestino._id }, $inc: { tokenVersion: 1 } }
    )

    if (modifiedCount > 0) {
      console.log(
        `⚠️  ${modifiedCount} usuario(s) con rol "${rol.nombre}" reasignados a "${rolDestino.nombre}".`
      )
    }

    await Rol.deleteOne({ _id: rol._id })
    console.log(`✅  Rol "${rol.nombre}" (slug: "${slugObsoleto}") eliminado correctamente.`)
    rolesEliminados++
  }

  console.log(
    `\n🏁  Limpieza completada. Roles eliminados: ${rolesEliminados}/${Object.keys(MAPEO_REASIGNACION).length}`
  )
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Error inesperado:', err)
  process.exit(1)
})
