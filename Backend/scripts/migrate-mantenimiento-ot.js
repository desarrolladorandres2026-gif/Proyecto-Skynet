import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Mantenimiento from '../src/models/mantenimiento/Mantenimiento.js'
import Usuario from '../src/models/Usuario.js'
import { guardaProduccion } from './lib/guardaProduccion.js'

// Traduce los documentos legado (estado 'pendiente'/'programado'/'finalizado')
// al ciclo de vida nuevo de la Orden de Trabajo (CMMS Fase 1). Es idempotente
// (solo toca documentos que todavía tengan un estado legado) y corre en modo
// dry-run por defecto: no escribe nada salvo que se invoque con --apply.
//
// Mapeo:
//   programado -> programada   (origen: preventivo)
//   pendiente  -> asignada     (origen: correctivo, migrado_legado: true —
//                               el esquema viejo ya exigía `tecnico`, se
//                               asume aceptación implícita)
//   finalizado -> cerrada      (sin aprobación retroactiva; sin SLA
//                               retroactivo, no es calculable con datos
//                               históricos sin fecha de creación del SLA)
//
// El campo `tecnico` (texto libre) se intenta resolver a un Usuario real por
// coincidencia exacta de nombre (case-insensitive). Si no hay una única
// coincidencia, el documento queda con tecnico_vinculado:false — visible para
// revisión manual, nunca bloquea la migración del resto.

const MAPA_ESTADO = {
  programado: { estado: 'programada', origen: 'preventivo' },
  pendiente: { estado: 'asignada', origen: 'correctivo' },
  finalizado: { estado: 'cerrada', origen: 'correctivo' },
}

async function resolverTecnico(nombreLibre) {
  if (!nombreLibre?.trim()) return { tecnico_asignado: null, tecnico_vinculado: false }
  const candidatos = await Usuario.find({ nombre: { $regex: `^${nombreLibre.trim()}$`, $options: 'i' } }).select('_id')
  if (candidatos.length === 1) return { tecnico_asignado: candidatos[0]._id, tecnico_vinculado: true }
  return { tecnico_asignado: null, tecnico_vinculado: false }
}

async function run() {
  const aplicar = process.argv.includes('--apply')
  // Solo bloquea la corrida que sí escribe: el dry-run (por defecto) no
  // toca datos y es seguro correrlo en cualquier entorno para inspeccionar.
  if (aplicar) {
    guardaProduccion({ script: 'migrate-mantenimiento-ot.js', operacion: 'migrar Mantenimiento a estados nuevos de OT (--apply)' })
  }
  await connectDB()

  const documentos = await Mantenimiento.find({ estado: { $in: Object.keys(MAPA_ESTADO) } })
  console.log(`Encontrados ${documentos.length} mantenimiento(s) en esquema legado.\n`)

  const resumen = { programada: 0, asignada: 0, cerrada: 0, tecnico_vinculado: 0, tecnico_no_vinculado: 0 }

  for (const doc of documentos) {
    const destino = MAPA_ESTADO[doc.estado]
    const { tecnico_asignado, tecnico_vinculado } = await resolverTecnico(doc.tecnico)

    resumen[destino.estado] += 1
    resumen[tecnico_vinculado ? 'tecnico_vinculado' : 'tecnico_no_vinculado'] += 1

    const cambios = {
      estado: destino.estado,
      origen: destino.origen,
      migrado_legado: true,
      tecnico_asignado,
      tecnico_vinculado,
    }

    console.log(
      `${aplicar ? '[APLICANDO]' : '[DRY-RUN]'} ${doc._id} ${doc.estado} -> ${destino.estado}` +
        ` | técnico "${doc.tecnico || '(sin dato)'}" ${tecnico_vinculado ? '-> vinculado' : '-> NO vinculado (revisar manualmente)'}`
    )

    if (aplicar) {
      await Mantenimiento.updateOne({ _id: doc._id }, { $set: cambios })
    }
  }

  console.log('\nResumen:')
  console.log(`  -> programada: ${resumen.programada}`)
  console.log(`  -> asignada:   ${resumen.asignada}`)
  console.log(`  -> cerrada:    ${resumen.cerrada}`)
  console.log(`  técnico vinculado:     ${resumen.tecnico_vinculado}`)
  console.log(`  técnico NO vinculado:  ${resumen.tecnico_no_vinculado}`)
  if (!aplicar) {
    console.log('\nEsto fue un dry-run: no se escribió nada. Vuelve a correr con --apply para aplicar los cambios.')
  }

  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
