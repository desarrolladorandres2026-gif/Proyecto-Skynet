// Datos demo de flota y operación para QA: plataformas, rutas, y vehículos +
// conductores de la empresa demo. Idempotente (busca antes de crear).
import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Empresa from '../src/models/Empresa.js'
import Vehiculo from '../src/models/Vehiculo.js'
import Conductor from '../src/models/Conductor.js'
import Plataforma from '../src/models/Plataforma.js'
import Ruta from '../src/models/Ruta.js'
import Horario from '../src/models/Horario.js'

const EN_UN_ANO = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

async function seed() {
  await connectDB()

  const empresa = await Empresa.findOne({ nit: '900123456-1' })
  if (!empresa) {
    console.error('No existe la empresa demo (corre primero: npm run seed)')
    process.exit(1)
  }

  for (let n = 1; n <= 6; n++) {
    const existe = await Plataforma.findOne({ numero: n })
    if (!existe) {
      await Plataforma.create({ numero: n, tipo: n <= 4 ? 'ascenso' : 'descenso' })
      console.log(`Plataforma ${n} creada`)
    }
  }

  const RUTAS = [
    { destino: 'Bogotá', duracionEstimadaMin: 330, paradas: ['Espinal', 'Girardot'] },
    { destino: 'Pitalito', duracionEstimadaMin: 180, paradas: ['Garzón'] },
    { destino: 'Florencia', duracionEstimadaMin: 240 },
    { destino: 'La Plata', duracionEstimadaMin: 150, paradas: ['Paicol'] },
  ]
  const rutasPorDestino = new Map()
  for (const r of RUTAS) {
    let ruta = await Ruta.findOne({ origen: 'Neiva', destino: r.destino })
    if (!ruta) {
      ruta = await Ruta.create({ origen: 'Neiva', ...r })
      console.log(`Ruta creada: Neiva → ${r.destino}`)
    }
    rutasPorDestino.set(r.destino, ruta)
  }

  const VEHICULOS = [
    { placa: 'SKY101', tipo: 'bus', marca: 'Chevrolet', modelo: 2022, capacidad: 40 },
    { placa: 'SKY202', tipo: 'buseta', marca: 'Mercedes-Benz', modelo: 2021, capacidad: 25 },
    { placa: 'SKY303', tipo: 'van', marca: 'Renault', modelo: 2023, capacidad: 12 },
  ]
  for (const v of VEHICULOS) {
    const existe = await Vehiculo.findOne({ placa: v.placa })
    if (!existe) {
      await Vehiculo.create({
        ...v,
        empresa: empresa._id,
        soatVence: EN_UN_ANO,
        tecnomecanicaVence: EN_UN_ANO,
      })
      console.log(`Vehículo creado: ${v.placa}`)
    }
  }

  const CONDUCTORES = [
    { cedula: '1075001001', nombre: 'Carlos Rojas', telefono: '3101112233' },
    { cedula: '1075001002', nombre: 'María Peña', telefono: '3204445566' },
  ]
  for (const c of CONDUCTORES) {
    const existe = await Conductor.findOne({ cedula: c.cedula })
    if (!existe) {
      await Conductor.create({
        ...c,
        empresa: empresa._id,
        licencia: { numero: `LIC-${c.cedula}`, categoria: 'C2', vence: EN_UN_ANO },
      })
      console.log(`Conductor creado: ${c.nombre}`)
    }
  }

  const HORARIOS = [
    { destino: 'Bogotá', horaSalida: '06:00' },
    { destino: 'Bogotá', horaSalida: '14:00' },
    { destino: 'Pitalito', horaSalida: '07:30' },
    { destino: 'Florencia', horaSalida: '09:00' },
  ]
  const TODOS_LOS_DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
  for (const h of HORARIOS) {
    const ruta = rutasPorDestino.get(h.destino)
    const existe = await Horario.findOne({ empresa: empresa._id, ruta: ruta._id, horaSalida: h.horaSalida })
    if (!existe) {
      await Horario.create({ empresa: empresa._id, ruta: ruta._id, horaSalida: h.horaSalida, dias: TODOS_LOS_DIAS })
      console.log(`Horario creado: ${h.destino} ${h.horaSalida}`)
    }
  }

  await mongoose.disconnect()
  console.log('Seed de operación completado.')
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
