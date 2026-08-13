/**
 * Reancla las fechas de Ausencia a la medianoche del Terminal (BUG-003).
 *
 * ── Qué estaba mal ──────────────────────────────────────────────────────────
 * `aDia()` hacía `new Date('2026-08-20')`, que JavaScript parsea como
 * medianoche UTC, y guardaba eso. Un navegador de Colombia (UTC-5) pintaba ese
 * instante como el día 19: la lista mostraba un día y el formulario de edición
 * otro, para el mismo registro.
 *
 * Ahora se guarda la medianoche de Neiva (05:00 UTC), que se lee igual desde
 * los dos sitios. Este script lleva los documentos ya guardados a esa forma.
 *
 * ── El supuesto que hace, y por qué hay que confirmarlo ─────────────────────
 * Para un documento guardado a las 00:00 UTC, el día que la persona pidió es
 * su fecha UTC — SIEMPRE QUE el servidor haya corrido en UTC, que es el caso
 * del VPS de producción. Si en algún momento corrió con TZ=America/Bogota, ese
 * mismo documento se habría guardado a las 05:00 UTC del día ANTERIOR al
 * pedido, y desde los datos solos no hay forma de distinguir los dos casos.
 *
 * Por eso el script:
 *   · solo toca documentos guardados exactamente a las 00:00:00.000 UTC,
 *   · deja en paz los que ya están a las 05:00:00.000 UTC (forma correcta),
 *   · REPORTA sin tocar cualquier otro horario, para que una persona decida.
 *
 * Uso:
 *   node scripts/migrar-fechas-ausencias.js            # solo reporta (dry-run)
 *   node scripts/migrar-fechas-ausencias.js --aplicar  # escribe
 *
 * Idempotente: correrlo dos veces no mueve nada la segunda vez.
 */

import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Ausencia from '../src/models/Ausencia.js'
import { OFFSET_TERMINAL } from '../src/utils/fechas.js'

const APLICAR = process.argv.includes('--aplicar')

// Milisegundos desde la medianoche UTC. 0 = forma vieja (por migrar);
// 5h = forma nueva (ya correcta).
const MS_HORA = 60 * 60 * 1000
const VIEJO = 0
const NUEVO = 5 * MS_HORA

function msDelDia(fecha) {
  return (
    fecha.getUTCHours() * MS_HORA +
    fecha.getUTCMinutes() * 60000 +
    fecha.getUTCSeconds() * 1000 +
    fecha.getUTCMilliseconds()
  )
}

// El día que la persona pidió, leído en UTC: para un valor guardado a las
// 00:00 UTC es directamente su fecha.
function reanclar(fecha) {
  const dia = fecha.toISOString().slice(0, 10)
  return new Date(`${dia}T00:00:00.000${OFFSET_TERMINAL}`)
}

async function run() {
  await connectDB()

  const ausencias = await Ausencia.find().select('fechaInicio fechaFin tipo estado solicitante')
  if (ausencias.length === 0) {
    console.log('No hay ausencias en la base: nada que migrar.')
    return
  }

  const porMigrar = []
  const yaCorrectas = []
  const inesperadas = []

  for (const doc of ausencias) {
    const ms = [doc.fechaInicio, doc.fechaFin].filter(Boolean).map(msDelDia)
    if (ms.every((m) => m === NUEVO)) yaCorrectas.push(doc)
    else if (ms.every((m) => m === VIEJO)) porMigrar.push(doc)
    else inesperadas.push(doc)
  }

  console.log(`\nAusencias en la base: ${ausencias.length}`)
  console.log(`  · ya ancladas al Terminal (05:00 UTC): ${yaCorrectas.length}`)
  console.log(`  · por migrar (00:00 UTC):              ${porMigrar.length}`)
  console.log(`  · con un horario inesperado:           ${inesperadas.length}`)

  if (inesperadas.length > 0) {
    console.log('\n⚠️  Estas NO se tocan: su hora guardada no es ni 00:00 ni 05:00 UTC.')
    console.log('    Revísalas a mano antes de decidir qué día representan.\n')
    for (const doc of inesperadas.slice(0, 20)) {
      console.log(`    · ${doc._id}  ${doc.tipo}/${doc.estado}  ${doc.fechaInicio?.toISOString()} → ${doc.fechaFin?.toISOString()}`)
    }
    if (inesperadas.length > 20) console.log(`    … y ${inesperadas.length - 20} más.`)
  }

  if (porMigrar.length === 0) {
    console.log('\n✅  Nada que migrar.')
    return
  }

  console.log('\nEjemplos de lo que cambiaría:\n')
  for (const doc of porMigrar.slice(0, 5)) {
    const antes = doc.fechaInicio
    const despues = reanclar(antes)
    const verAntes = antes.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const verDespues = despues.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    console.log(`   ${doc._id}`)
    console.log(`     guardado : ${antes.toISOString()}  → se veía en Neiva como ${verAntes}`)
    console.log(`     quedará  : ${despues.toISOString()}  → se verá  en Neiva como ${verDespues}`)
  }

  if (!APLICAR) {
    console.log(`\n🔍  Simulación: no se escribió nada. ${porMigrar.length} documento(s) se migrarían.`)
    console.log('    Para aplicar: node scripts/migrar-fechas-ausencias.js --aplicar\n')
    return
  }

  // bulkWrite en vez de save() por documento: son escrituras independientes y
  // no hay hooks de Mongoose que deban correr para este campo.
  const operaciones = porMigrar.map((doc) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: {
        $set: {
          fechaInicio: reanclar(doc.fechaInicio),
          ...(doc.fechaFin ? { fechaFin: reanclar(doc.fechaFin) } : {}),
        },
      },
    },
  }))

  const resultado = await Ausencia.bulkWrite(operaciones)
  console.log(`\n✅  ${resultado.modifiedCount} ausencia(s) reancladas a la medianoche del Terminal.\n`)
}

run()
  .catch((err) => {
    console.error('Error inesperado:', err)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
