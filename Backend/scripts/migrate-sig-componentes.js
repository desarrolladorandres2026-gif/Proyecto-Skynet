import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import ConfiguracionSig, { COMPONENTES_SIG_DEFECTO } from '../src/models/ConfiguracionSig.js'
import PreguntaSig from '../src/models/PreguntaSig.js'
import ProgramacionSig from '../src/models/ProgramacionSig.js'
import RespuestaSig from '../src/models/RespuestaSig.js'
import PlanRefuerzoSig from '../src/models/PlanRefuerzoSig.js'
import CapacitacionTemaSig from '../src/models/CapacitacionTemaSig.js'

export async function migrarComponentesSig() {
  console.log('--- Iniciando migración de componentes SIG (PTEE, PESV, SARLAFT) ---')

  let config = await ConfiguracionSig.findOne({})
  if (!config) {
    config = await ConfiguracionSig.create({ componentes: COMPONENTES_SIG_DEFECTO })
    console.log('Se creó el documento de ConfiguracionSig con componentes por defecto.')
  } else {
    const actuales = config.componentes || []
    const sincronizados = []
    let cambiado = false

    for (const c of actuales) {
      const normal = c === 'SARLAF' ? 'SARLAFT' : c
      if (c === 'SARLAF') cambiado = true
      if (!sincronizados.includes(normal)) sincronizados.push(normal)
    }

    for (const def of COMPONENTES_SIG_DEFECTO) {
      if (!sincronizados.includes(def)) {
        sincronizados.push(def)
        cambiado = true
      }
    }

    if (cambiado) {
      config.componentes = sincronizados
      await config.save()
      console.log('ConfiguracionSig actualizada con componentes:', sincronizados)
    } else {
      console.log('ConfiguracionSig ya tenía los componentes actualizados:', sincronizados)
    }
  }

  // Corregir referencias SARLAF -> SARLAFT en colecciones SIG
  const resPreguntas = await PreguntaSig.updateMany(
    { componenteSig: 'SARLAF' },
    { $set: { componenteSig: 'SARLAFT' } }
  )
  if (resPreguntas.modifiedCount > 0) {
    console.log(`PreguntaSig: ${resPreguntas.modifiedCount} pregunta(s) corregida(s) de SARLAF a SARLAFT.`)
  }

  const resProgramaciones = await ProgramacionSig.updateMany(
    { 'snapshotPregunta.componenteSig': 'SARLAF' },
    { $set: { 'snapshotPregunta.componenteSig': 'SARLAFT' } }
  )
  if (resProgramaciones.modifiedCount > 0) {
    console.log(`ProgramacionSig: ${resProgramaciones.modifiedCount} programación(es) corregida(s) de SARLAF a SARLAFT.`)
  }

  const resRespuestas = await RespuestaSig.updateMany(
    { componenteSigSnapshot: 'SARLAF' },
    { $set: { componenteSigSnapshot: 'SARLAFT' } }
  )
  if (resRespuestas.modifiedCount > 0) {
    console.log(`RespuestaSig: ${resRespuestas.modifiedCount} respuesta(s) corregida(s) de SARLAF a SARLAFT.`)
  }

  const resPlanes = await PlanRefuerzoSig.updateMany(
    { componenteSig: 'SARLAF' },
    { $set: { componenteSig: 'SARLAFT' } }
  )
  if (resPlanes.modifiedCount > 0) {
    console.log(`PlanRefuerzoSig: ${resPlanes.modifiedCount} plan(es) de refuerzo corregido(s) de SARLAF a SARLAFT.`)
  }

  const resCapacitaciones = await CapacitacionTemaSig.updateMany(
    { componenteSig: 'SARLAF' },
    { $set: { componenteSig: 'SARLAFT' } }
  )
  if (resCapacitaciones.modifiedCount > 0) {
    console.log(`CapacitacionTemaSig: ${resCapacitaciones.modifiedCount} capacitación(es) corregida(s) de SARLAF a SARLAFT.`)
  }

  console.log('--- Migración de componentes SIG completada exitosamente ---')
}

// Ejecución directa por CLI si se corre con node
if (process.argv[1]?.endsWith('migrate-sig-componentes.js')) {
  try {
    await connectDB()
    await migrarComponentesSig()
  } catch (err) {
    console.error('Error durante la migración de componentes SIG:', err)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
  }
}
