import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import { hashPassword } from '../src/utils/password.js'
import { guardaProduccion } from './lib/guardaProduccion.js'

// Sin flag de dry-run: crea usuarios reales apenas corre.
guardaProduccion({ script: 'importar-usuarios.js', operacion: 'importar usuarios en bloque desde usuarios_skynet_organizados.json' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const JSON_PATH = path.resolve(__dirname, '..', '..', 'usuarios_skynet_organizados.json')

function normalizarEmail(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, '')
}

async function resolverNombreUsuario(base) {
  const slug = base.trim()
  if (!(await Usuario.exists({ nombre_usuario: slug }))) return slug
  let i = 2
  while (true) {
    const candidato = slug + '_' + i
    if (!(await Usuario.exists({ nombre_usuario: candidato }))) return candidato
    i++
  }
}

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error('\nNo se encontro el JSON en:\n   ' + JSON_PATH + '\n')
    process.exit(1)
  }

  const usuarios = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'))
  console.log('\nArchivo cargado: ' + usuarios.length + ' entradas.')

  await connectDB()
  console.log('Conectado a MongoDB.\n')

  const roles = await Rol.find({}, 'nombre _id').lean()
  if (!roles.length) {
    console.error('No hay roles en la BD. Ejecuta primero: npm run seed')
    await mongoose.disconnect()
    process.exit(1)
  }

  const rolPorNombre = new Map()
  for (const r of roles) rolPorNombre.set(r.nombre.trim(), r._id)

  console.log('Roles disponibles: ' + [...rolPorNombre.keys()].join(' | '))
  console.log('-'.repeat(60))

  let creados = 0, omitidos = 0, errores = 0
  const listaErrores = []

  for (const u of usuarios) {
    const email = normalizarEmail(u.email || '')

    if (!email) {
      console.warn('Sin email, se omite: ' + JSON.stringify(u))
      errores++
      listaErrores.push({ entrada: u, razon: 'email vacio' })
      continue
    }

    if (await Usuario.exists({ email })) {
      console.log('Ya existe: ' + email)
      omitidos++
      continue
    }

    const nombreRol = (u.rol || '').trim()
    const rolId = rolPorNombre.get(nombreRol)
    if (!rolId) {
      const msg = 'Rol desconocido: "' + nombreRol + '"'
      console.error('ERROR ' + email + ' -> ' + msg)
      errores++
      listaErrores.push({ email, razon: msg })
      continue
    }

    const nombre_usuario = await resolverNombreUsuario(u.username || email)
    const modulos = u.mantenimiento === true ? ['mantenimiento'] : []
    const passwordHash = await hashPassword(u.password)

    try {
      await Usuario.create({
        nombre_usuario,
        nombre: (u.nombreCompleto || u.username || '').trim(),
        email,
        password: passwordHash,
        rol: rolId,
        dependencia: (u.dependencia || '').trim() || undefined,
        cargo: (u.cargo || '').trim() || undefined,
        modulos,
        estado: u.estado === 'inactivo' ? 'inactivo' : 'activo',
        esPrueba: false,
        debeCambiarPassword: true,
      })
      console.log('CREADO: ' + email + ' | rol: ' + nombreRol)
      creados++
    } catch (err) {
      console.error('ERROR creando ' + email + ': ' + err.message)
      errores++
      listaErrores.push({ email, razon: err.message })
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('RESUMEN')
  console.log('='.repeat(60))
  console.log('  Creados  : ' + creados)
  console.log('  Omitidos : ' + omitidos)
  console.log('  Errores  : ' + errores)
  if (listaErrores.length) {
    console.log('\n  Detalle errores:')
    listaErrores.forEach(e => console.log('    - ' + (e.email || JSON.stringify(e.entrada)) + ' -> ' + e.razon))
  }
  console.log('='.repeat(60) + '\n')

  await mongoose.disconnect()
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })