// Migra los datos reales de mantenimiento_db (MySQL) hacia MongoDB.
// Requiere las variables MYSQL_* en .env apuntando a la base de datos MySQL viva.
//
// Uso: npm run migrate:mantenimiento

import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { connectDB } from '../src/config/db.js'
import mongoose from 'mongoose'
import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import TipoEquipo from '../src/models/mantenimiento/TipoEquipo.js'
import Marca from '../src/models/mantenimiento/Marca.js'
import Equipo from '../src/models/mantenimiento/Equipo.js'
import Mantenimiento from '../src/models/mantenimiento/Mantenimiento.js'

function normalizarEstado(estado) {
  const limpio = (estado || '').trim().toLowerCase()
  if (['pendiente', 'programado', 'finalizado'].includes(limpio)) return limpio
  return 'pendiente'
}

async function migrar() {
  await connectDB()

  const mysqlConn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mantenimiento_db',
  })

  console.log('✅  Conectado a MySQL')

  // --- Tipos de equipo ---
  const [tipos] = await mysqlConn.execute('SELECT id, nombre FROM tipo_equipo')
  const mapaTipos = new Map() // id_mysql -> ObjectId mongo
  for (const t of tipos) {
    const doc = await TipoEquipo.findOneAndUpdate(
      { nombre: t.nombre },
      { nombre: t.nombre },
      { upsert: true, new: true }
    )
    mapaTipos.set(t.id, doc)
  }
  console.log(`✅  ${tipos.length} tipos de equipo migrados`)

  // --- Marcas ---
  const [marcas] = await mysqlConn.execute('SELECT id, nombre FROM marca')
  const mapaMarcas = new Map()
  for (const m of marcas) {
    const doc = await Marca.findOneAndUpdate(
      { nombre: m.nombre },
      { nombre: m.nombre },
      { upsert: true, new: true }
    )
    mapaMarcas.set(m.id, doc)
  }
  console.log(`✅  ${marcas.length} marcas migradas`)

  // --- Usuarios (mantenimiento) ---
  const [usuariosMysql] = await mysqlConn.execute('SELECT id, usuario, nombre, password, rol FROM usuarios')
  const mapaUsuarios = new Map()
  for (const u of usuariosMysql) {
    const existente = await Usuario.findOne({ nombre_usuario: u.usuario })
    if (existente) {
      if (!existente.modulos.includes('mantenimiento')) {
        existente.modulos.push('mantenimiento')
        await existente.save()
      }
      mapaUsuarios.set(u.id, existente)
      continue
    }

    // Las passwords de origen están en texto plano; se re-hashean con bcrypt.
    const passwordHash = await bcrypt.hash(u.password, 10)
    // El origen no tiene email y el modelo lo exige (el login unificado es por
    // email): se sintetiza uno a partir del nombre de usuario.
    const email = `${u.usuario
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9.]/g, '')}@skynet.local`
    const doc = await Usuario.create({
      nombre_usuario: u.usuario,
      nombre: u.nombre,
      email,
      password: passwordHash,
      rol: u.rol?.toLowerCase() === 'admin' ? 'admin' : 'usuario',
      modulos: ['mantenimiento'],
      estado: 'activo',
    })
    mapaUsuarios.set(u.id, doc)
  }
  console.log(`✅  ${usuariosMysql.length} usuarios migrados (passwords re-hasheadas con bcrypt)`)

  // --- Equipos ---
  const [equipos] = await mysqlConn.execute('SELECT * FROM equipos')
  const mapaEquipos = new Map()
  for (const e of equipos) {
    const tipoDoc = mapaTipos.get(e.tipo_id)
    const marcaDoc = mapaMarcas.get(e.marca_id)

    if (!tipoDoc || !marcaDoc) {
      console.warn(`⚠️  Equipo ${e.numero_inventario} (id ${e.id}) sin tipo/marca válidos, se omite`)
      continue
    }

    const doc = await Equipo.create({
      numero_inventario: e.numero_inventario,
      serial: e.serial || `SIN-SERIAL-${e.id}`,
      tipo: { id: tipoDoc._id, nombre: tipoDoc.nombre },
      marca: { id: marcaDoc._id, nombre: marcaDoc.nombre },
      modelo: e.modelo || 'Sin especificar',
      ubicacion: e.ubicacion || 'Sin especificar',
      responsable: e.responsable || 'Sin especificar',
      dependencia: e.dependencia || 'Sin especificar',
      estado_actual: e.estado_actual || 'Activo',
      procesador: e.procesador,
      ram: e.ram,
      disco_duro: e.disco_duro,
      sistema_operativo: e.sistema_operativo,
      proveedor: e.proveedor,
      fecha_compra: e.fecha_compra,
      observaciones: e.observaciones,
    })
    mapaEquipos.set(e.id, doc)
  }
  console.log(`✅  ${mapaEquipos.size}/${equipos.length} equipos migrados`)

  // --- Mantenimientos ---
  const [mantenimientos] = await mysqlConn.execute('SELECT * FROM mantenimientos')
  let migrados = 0
  for (const m of mantenimientos) {
    const equipoDoc = mapaEquipos.get(m.equipo_id)
    if (!equipoDoc) {
      console.warn(`⚠️  Mantenimiento id ${m.id} referencia un equipo no migrado, se omite`)
      continue
    }

    await Mantenimiento.create({
      equipo: equipoDoc._id,
      fecha: m.fecha,
      fecha_realizacion: m.fecha_realizacion,
      tipo: m.tipo,
      tecnico: m.tecnico,
      descripcion: m.descripcion || '',
      estado: normalizarEstado(m.estado),
      archivo_pdf: m.archivo_pdf,
    })
    migrados++
  }
  console.log(`✅  ${migrados}/${mantenimientos.length} mantenimientos migrados`)

  await mysqlConn.end()
  await mongoose.disconnect()
  console.log('\n🎉  Migración completa')
}

migrar().catch((err) => {
  console.error('❌  Error durante la migración:', err)
  process.exit(1)
})
