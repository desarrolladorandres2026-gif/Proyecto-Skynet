/**
 * Marca como `esPrueba: true` a todos los usuarios que existían ANTES de
 * introducir el campo (documentos sin `esPrueba` guardado en Mongo). No toca
 * contraseña, email, rol ni ningún otro dato — solo agrega esa marca.
 *
 * ── Por qué "sin esPrueba" y no "todos" ─────────────────────────────────────
 * El schema pone `default: false` para cualquier documento nuevo, así que un
 * usuario creado DESPUÉS de este cambio ya nace con `esPrueba: false` incluso
 * antes de correr esta migración. Filtrar por `esPrueba: { $exists: false }`
 * en vez de por fecha o por "todos" es lo que hace el script idempotente y
 * seguro de correr más de una vez: la segunda corrida no encuentra nada que
 * marcar (todos ya tienen el campo) y no reclasifica por accidente a alguien
 * que se creó real después del primer run.
 *
 * Uso:
 *   node scripts/marcar-usuarios-prueba.js            # solo reporta (dry-run)
 *   node scripts/marcar-usuarios-prueba.js --aplicar  # marca de verdad
 */

import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Usuario from '../src/models/Usuario.js'

const APLICAR = process.argv.includes('--aplicar')

// Dos de los 16 candidatos detectados en la corrida inicial (2026-08-21)
// tenían correo del dominio real del Terminal en vez de @skynet.local/gmail
// de prueba — se confirmó con el administrador que son cuentas reales y se
// excluyen explícitamente para no marcarlas por error como esPrueba:true.
const EXCLUIR_EMAILS = ['sistemas1@elterminalneiva.com', 'financiera@elterminalneiva.com']

async function run() {
  await connectDB()

  const filtro = { esPrueba: { $exists: false }, email: { $nin: EXCLUIR_EMAILS } }

  if (APLICAR && EXCLUIR_EMAILS.length) {
    // Igual quedan con `esPrueba` explícito (false): si no, seguirían
    // matcheando `$exists:false` y el reporte los listaría de nuevo cada vez.
    const { modifiedCount } = await Usuario.updateMany(
      { esPrueba: { $exists: false }, email: { $in: EXCLUIR_EMAILS } },
      { $set: { esPrueba: false } }
    )
    if (modifiedCount) console.log(`ℹ️  ${modifiedCount} usuario(s) excluido(s) marcados explícitamente como esPrueba:false.`)
  }
  const candidatos = await Usuario.find(filtro).select('nombre_usuario nombre email').lean()

  if (candidatos.length === 0) {
    console.log('✅  No hay usuarios sin `esPrueba`: la migración ya se aplicó (o no hay nada que marcar).')
    return
  }

  console.log(`\n🧪  ${candidatos.length} usuario(s) se marcarán como esPrueba:true:\n`)
  for (const u of candidatos) {
    console.log(`   · ${u.nombre_usuario} — ${u.nombre} (${u.email})`)
  }

  if (!APLICAR) {
    console.log('\n🔍  Simulación: no se modificó nada.')
    console.log('    Para aplicar: node scripts/marcar-usuarios-prueba.js --aplicar\n')
    return
  }

  const { modifiedCount } = await Usuario.updateMany(filtro, { $set: { esPrueba: true } })
  console.log(`\n✅  ${modifiedCount} usuario(s) marcados como esPrueba:true.\n`)
}

run()
  .catch((err) => {
    console.error('Error inesperado:', err)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
