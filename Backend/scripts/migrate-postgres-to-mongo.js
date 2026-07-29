// Migra los datos reales de sigittn (PostgreSQL) hacia MongoDB.
// Requiere las variables PG_* en .env apuntando a la base de datos PostgreSQL viva.
//
// Uso: npm run migrate:sigittn
//
// Idempotente: puede ejecutarse varias veces sin duplicar datos.
// - Usuarios: clave natural nombre_usuario. Los usuarios de sigittn no tienen
//   email en origen, así que se sintetiza uno (nombre.apellido@skynet.local)
//   porque el login del backend unificado es por email. Las passwords ya son
//   hashes bcrypt y se copian tal cual (siguen funcionando las actuales).
// - Tickets: clave natural titulo + fecha de creación. Mensajes y ultimo_visto
//   se reconstruyen completos en cada ejecución.
// - Push subscriptions: clave natural endpoint.
// - password_reset_tokens NO se migran (tokens temporales, sin valor).

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import pg from 'pg'
import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Ticket from '../src/models/sigittn/Ticket.js'
import PushSubscription from '../src/models/PushSubscription.js'
import { Dependencia, ModuloOrigen, NivelUrgencia } from '../src/models/sigittn/Catalogos.js'

const EXTENSION_POR_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
}

// El origen guardaba fotos y videos como data-URIs base64 dentro de la fila del
// mensaje (hasta 51 MB por mensaje). Un documento Mongo no puede superar 16 MB,
// así que el binario se extrae a STORAGE_ROOT (mismo layout que upload.controller)
// y en el mensaje queda solo la URL pública. El nombre usa el hash del contenido
// para que re-ejecutar la migración no duplique archivos.
function extraerArchivo(dataUri) {
  const coincidencia = /^data:([\w/.+-]+);base64,/.exec(dataUri)
  if (!coincidencia) return dataUri // ya es una URL normal, se conserva

  const mime = coincidencia[1]
  const buffer = Buffer.from(dataUri.slice(coincidencia[0].length), 'base64')
  const extension = EXTENSION_POR_MIME[mime] || (mime.startsWith('video/') ? '.mp4' : '.bin')
  const subdir = mime.startsWith('video/') ? 'videos' : 'mensajes'
  const nombre = `migrado-${crypto.createHash('sha1').update(buffer).digest('hex')}${extension}`

  const destino = path.join(env.STORAGE_ROOT, subdir, nombre)
  if (!fs.existsSync(destino)) {
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, buffer)
  }
  return `${env.FILES_PUBLIC_URL}/${subdir}/${nombre}`
}

function sintetizarEmail(nombre) {
  const slug = nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '')
  return `${slug}@skynet.local`
}

async function migrar() {
  await connectDB()

  const cliente = new pg.Client({
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || 'sigittn',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
  })
  await cliente.connect()
  console.log('✅  Conectado a PostgreSQL')

  // --- Catálogos ---
  const { rows: dependencias } = await cliente.query(
    'SELECT id_dependencia, nombre_dependencia FROM dependencias'
  )
  const mapaDependencias = new Map()
  for (const d of dependencias) {
    await Dependencia.findOneAndUpdate(
      { nombre: d.nombre_dependencia },
      { nombre: d.nombre_dependencia },
      { upsert: true }
    )
    mapaDependencias.set(d.id_dependencia, d.nombre_dependencia)
  }

  const { rows: modulos } = await cliente.query(
    'SELECT id_modulo_origen, nombre_modulo_origen FROM modulo_origen_tickets'
  )
  const mapaModulos = new Map()
  for (const m of modulos) {
    await ModuloOrigen.findOneAndUpdate(
      { nombre: m.nombre_modulo_origen },
      { nombre: m.nombre_modulo_origen },
      { upsert: true }
    )
    mapaModulos.set(m.id_modulo_origen, m.nombre_modulo_origen)
  }

  const { rows: niveles } = await cliente.query(
    'SELECT id_nivel_urgencia, nombre_nivel_urgencia FROM nivel_urgencia_tickets'
  )
  const mapaNiveles = new Map()
  for (const n of niveles) {
    await NivelUrgencia.findOneAndUpdate(
      { nombre: n.nombre_nivel_urgencia },
      { nombre: n.nombre_nivel_urgencia },
      { upsert: true }
    )
    mapaNiveles.set(n.id_nivel_urgencia, n.nombre_nivel_urgencia)
  }
  console.log(
    `✅  Catálogos migrados: ${dependencias.length} dependencias, ${modulos.length} módulos de origen, ${niveles.length} niveles de urgencia`
  )

  const { rows: estados } = await cliente.query(
    'SELECT id_estado, nombre_estado FROM estados_ticket'
  )
  const mapaEstados = new Map(estados.map((e) => [e.id_estado, e.nombre_estado]))

  const { rows: roles } = await cliente.query('SELECT id_rol, nombre_rol FROM roles')
  const mapaRoles = new Map(roles.map((r) => [r.id_rol, r.nombre_rol]))

  // --- Usuarios ---
  const { rows: usuariosPg } = await cliente.query(
    'SELECT id_usuario, nombre_usuario, password_usuario, estado_usuario, id_rol, id_dependencia FROM usuarios ORDER BY id_usuario'
  )
  const mapaUsuarios = new Map() // id_usuario pg -> doc mongo
  let usuariosNuevos = 0
  for (const u of usuariosPg) {
    const existente = await Usuario.findOne({ nombre_usuario: u.nombre_usuario })
    if (existente) {
      if (!existente.modulos.includes('sigittn')) {
        existente.modulos.push('sigittn')
        await existente.save()
      }
      mapaUsuarios.set(u.id_usuario, existente)
      continue
    }

    const doc = await Usuario.create({
      nombre_usuario: u.nombre_usuario,
      nombre: u.nombre_usuario,
      email: sintetizarEmail(u.nombre_usuario),
      // Ya es hash bcrypt en origen: se conserva y la password actual sigue sirviendo.
      password: u.password_usuario,
      rol: mapaRoles.get(u.id_rol) === 'admin' ? 'admin' : 'usuario',
      dependencia: mapaDependencias.get(u.id_dependencia),
      modulos: ['sigittn'],
      estado: u.estado_usuario === 'inactivo' ? 'inactivo' : 'activo',
    })
    mapaUsuarios.set(u.id_usuario, doc)
    usuariosNuevos++
  }
  console.log(`✅  ${usuariosPg.length} usuarios procesados (${usuariosNuevos} nuevos)`)

  // --- Tickets con mensajes y ultimo_visto embebidos ---
  // Los mensajes se consultan por ticket (no todos a la vez) porque las columnas
  // con base64 pueden pesar cientos de MB en total.
  const { rows: ticketsPg } = await cliente.query('SELECT * FROM tickets ORDER BY id_ticket')
  const { rows: vistosPg } = await cliente.query('SELECT * FROM ticket_ultimo_visto')

  const vistosPorTicket = new Map()
  for (const v of vistosPg) {
    if (!vistosPorTicket.has(v.id_ticket)) vistosPorTicket.set(v.id_ticket, [])
    vistosPorTicket.get(v.id_ticket).push(v)
  }

  let ticketsNuevos = 0
  let ticketsActualizados = 0
  let totalMensajes = 0
  let archivosExtraidos = 0
  for (const t of ticketsPg) {
    const creador = mapaUsuarios.get(t.id_usuario_creador)
    if (!creador) {
      console.warn(`⚠️  Ticket ${t.id_ticket} sin usuario creador migrado, se omite`)
      continue
    }

    const { rows: mensajesPg } = await cliente.query(
      'SELECT * FROM mensaje_tickets WHERE id_ticket = $1 ORDER BY fecha_mensaje',
      [t.id_ticket]
    )
    totalMensajes += mensajesPg.length

    const mensajes = mensajesPg.map((m) => {
      let url = m.url_imagen_mensaje
      if (url?.startsWith('data:')) {
        url = extraerArchivo(url)
        archivosExtraidos++
      }
      return {
        texto_mensaje: m.texto_mensaje,
        url_imagen_mensaje: url,
        usuario: mapaUsuarios.get(m.id_usuario)?._id,
        fecha_mensaje: m.fecha_mensaje,
        leido_mensaje: m.leido_mensaje,
      }
    })

    const ultimoVisto = (vistosPorTicket.get(t.id_ticket) || [])
      .filter((v) => mapaUsuarios.has(v.id_usuario))
      .map((v) => ({
        usuario: mapaUsuarios.get(v.id_usuario)._id,
        visto_en: v.visto_en,
      }))

    const datos = {
      titulo_ticket: t.titulo_ticket,
      descripcion_ticket: t.descripcion_ticket || '',
      fecha_creacion_ticket: t.fecha_creacion_ticket,
      fecha_cierre_ticket: t.fecha_cierre_ticket || undefined,
      modulo_origen: mapaModulos.get(t.id_modulo_origen) || 'Sin especificar',
      nivel_urgencia: mapaNiveles.get(t.id_nivel_urgencia) || 'Sin especificar',
      estado: mapaEstados.get(t.id_estado) || 'Nuevo',
      usuario_creador: creador._id,
      usuario_asignado: mapaUsuarios.get(t.id_usuario_asignado)?._id,
      mensajes,
      ultimo_visto: ultimoVisto,
    }

    const existente = await Ticket.findOne({
      titulo_ticket: t.titulo_ticket,
      fecha_creacion_ticket: t.fecha_creacion_ticket,
    })
    if (existente) {
      existente.set(datos)
      await existente.save()
      ticketsActualizados++
    } else {
      await Ticket.create(datos)
      ticketsNuevos++
    }
  }
  console.log(
    `✅  ${ticketsPg.length} tickets procesados (${ticketsNuevos} nuevos, ${ticketsActualizados} actualizados), ${totalMensajes} mensajes embebidos, ${archivosExtraidos} archivos multimedia extraídos a storage`
  )

  // --- Suscripciones push ---
  const { rows: subsPg } = await cliente.query(
    'SELECT id_usuario, endpoint, p256dh, auth FROM push_subscriptions'
  )
  let subsMigradas = 0
  for (const s of subsPg) {
    const usuario = mapaUsuarios.get(s.id_usuario)
    if (!usuario) continue
    await PushSubscription.findOneAndUpdate(
      { endpoint: s.endpoint },
      { usuario: usuario._id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      { upsert: true }
    )
    subsMigradas++
  }
  console.log(`✅  ${subsMigradas}/${subsPg.length} suscripciones push migradas`)

  console.log('\n📧  Emails de acceso generados para los usuarios de sigittn:')
  for (const u of usuariosPg) {
    const doc = mapaUsuarios.get(u.id_usuario)
    console.log(`    ${u.nombre_usuario} -> ${doc.email}`)
  }

  await cliente.end()
  await mongoose.disconnect()
  console.log('\n🎉  Migración de sigittn completa')
}

migrar().catch((err) => {
  console.error('❌  Error durante la migración:', err)
  process.exit(1)
})
