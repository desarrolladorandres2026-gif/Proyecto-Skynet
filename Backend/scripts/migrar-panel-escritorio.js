/**
 * Script puntual: guarda Rol.panelEscritorio en los roles que todavía no lo
 * tienen, con el valor que ya recibían por la lista legada de
 * utils/panelEscritorio.js (así nadie gana ni pierde panel al migrar).
 *
 * Idempotente: solo toca roles donde el campo no existe.
 *
 * Uso:
 *   node scripts/migrar-panel-escritorio.js
 */

import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Rol from '../src/models/Rol.js'
import { tienePanelEscritorio } from '../src/utils/panelEscritorio.js'
import { guardaProduccion } from './lib/guardaProduccion.js'

guardaProduccion({
  script: 'migrar-panel-escritorio.js',
  operacion: 'guardar panelEscritorio en los roles que no lo tienen',
})

async function run() {
  await connectDB()

  const roles = await Rol.find({ panelEscritorio: { $exists: false } }).select('nombre slug esSuperAdmin')
  for (const rol of roles) {
    const valor = tienePanelEscritorio(rol)
    await Rol.updateOne({ _id: rol._id }, { $set: { panelEscritorio: valor } })
    console.log(`✅  ${rol.nombre} (${rol.slug}): panelEscritorio = ${valor}`)
  }
  if (roles.length === 0) console.log('ℹ️  Todos los roles ya tenían el campo — sin cambios.')

  console.log('\n🏁  Listo.')
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Error inesperado:', err)
  process.exit(1)
})
