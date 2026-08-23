/**
 * Elimina los permisos que ya no existen en seedData/rbac.data.js, junto con
 * sus asignaciones en cada Rol.
 *
 * ── Por qué es un script y no parte del arranque ────────────────────────────
 * Hasta 2026-08-13 esto corría solo en cada `sincronizarCatalogoSistema()`.
 * Era destructivo y asimétrico: agregar un permiso NUNCA lo asigna a un rol
 * existente ($setOnInsert, para no pisar personalizaciones), pero borrarlo sí
 * cascadeaba a todos los roles. Un simple rollback de código —respuesta normal
 * a un incidente— borraba asignaciones de permisos que el roll-forward no
 * restauraba, sin dejar rastro en auditoría.
 *
 * Ahora el arranque solo avisa, y el borrado es una decisión consciente que
 * pasa por aquí. Ver el comentario largo en modules/sistema/sistema.service.js.
 *
 * Uso:
 *   node scripts/limpiar-permisos-obsoletos.js            # solo reporta (dry-run)
 *   node scripts/limpiar-permisos-obsoletos.js --aplicar  # borra de verdad
 *
 * Idempotente: sin permisos obsoletos no hace nada.
 */

import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import { permisosObsoletos } from '../src/modules/sistema/sistema.service.js'
import { guardaProduccion } from './lib/guardaProduccion.js'

const APLICAR = process.argv.includes('--aplicar')

if (APLICAR) {
  guardaProduccion({ script: 'limpiar-permisos-obsoletos.js', operacion: 'borrar permisos obsoletos y sus asignaciones en roles' })
}

async function run() {
  await connectDB()

  const obsoletos = await permisosObsoletos()
  if (obsoletos.length === 0) {
    console.log('✅  No hay permisos obsoletos: la base coincide con rbac.data.js.')
    return
  }

  const ids = obsoletos.map((p) => p._id)

  // Se listan los roles afectados ANTES de tocar nada: es justo la información
  // que hacía falta para poder restaurar a mano si el borrado se hace por
  // error, y que el borrado automático nunca dejó por escrito en ningún lado.
  const rolesAfectados = await Rol.find({ permisos: { $in: ids } }).select('nombre slug permisos')

  console.log(`\n⚠️  ${obsoletos.length} permiso(s) ya no existen en rbac.data.js:\n`)
  for (const p of obsoletos) {
    console.log(`   · ${p.codigo}${p.nombre ? `  (${p.nombre})` : ''}`)
  }

  if (rolesAfectados.length === 0) {
    console.log('\n   Ningún rol los tiene asignados.')
  } else {
    console.log(`\n   Roles que perderían asignaciones (${rolesAfectados.length}):\n`)
    for (const rol of rolesAfectados) {
      const pierde = obsoletos
        .filter((p) => rol.permisos.some((id) => id.equals(p._id)))
        .map((p) => p.codigo)
      console.log(`   · ${rol.nombre} (${rol.slug}) → ${pierde.join(', ')}`)
    }
  }

  if (!APLICAR) {
    console.log('\n🔍  Simulación: no se borró nada.')
    console.log('    Para aplicar: node scripts/limpiar-permisos-obsoletos.js --aplicar\n')
    return
  }

  // Primero se quitan de los roles y después se borran los documentos: al
  // revés dejaría ObjectIds colgando en Rol.permisos entre las dos escrituras.
  const { modifiedCount } = await Rol.updateMany({}, { $pull: { permisos: { $in: ids } } })
  const { deletedCount } = await Permiso.deleteMany({ _id: { $in: ids } })

  console.log(`\n🗑️   ${deletedCount} permiso(s) eliminados; ${modifiedCount} rol(es) actualizados.\n`)
}

run()
  .catch((err) => {
    console.error('Error inesperado:', err)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
