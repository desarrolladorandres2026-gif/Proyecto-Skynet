/**
 * Crea el rol "Personal Administrativo" (ver seedData/rbac.data.js) y mueve a
 * él a los usuarios activos de dependencia 'Administrativo' cuyo rol actual no
 * recibe correo.
 *
 * Para qué: el canal correo del motor de notificaciones solo escribe a los
 * roles con 'notificaciones:recibir_email' (ver notificaciones.service.js).
 * El personal administrativo sin funciones de gestión estaba en 'Usuario
 * Común', el mismo rol de los ~86 operativos, así que quedaba sin correo —
 * incluido el aviso de cada cuestionario programado disponible. Darle el
 * permiso a 'Usuario Común' habría vuelto a abrir el canal a todo el personal
 * operativo, que es justo lo que agotaba la cuota diaria del proveedor SMTP.
 *
 * El criterio de "es administrativo" es Usuario.dependencia === 'Administrativo':
 * es la clasificación que la propia institución ya mantiene en el catálogo de
 * Dependencias, no una lista inventada en el código. Quien tenga un rol que ya
 * recibe correo (Administrador, Dir. Administrativo y Gestión, Bodega, Talento
 * Humano, Gestor De Comunicaciones, Operador) o sea Super Admin se deja
 * intacto: ese rol le da capacidades reales que este NO tiene, y moverlo aquí
 * sería quitarle acceso.
 *
 * Cambiar el rol aplica de inmediato y sin cerrar sesiones: middleware/auth.js
 * resuelve rol+permisos desde Mongo en cada petición (no viajan en el JWT), y
 * el rol nuevo tiene el mismo piso de privilegios que 'Usuario Común', así que
 * nadie gana ni pierde acceso a ninguna pantalla.
 *
 * Idempotente. Por defecto SOLO SIMULA; hay que pasar --aplicar para escribir.
 *
 * Uso:
 *   node scripts/asignar-rol-personal-administrativo.js            # simulación
 *   node scripts/asignar-rol-personal-administrativo.js --aplicar  # escribe
 */

import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import Usuario from '../src/models/Usuario.js'
import { guardaProduccion } from './lib/guardaProduccion.js'

const APLICAR = process.argv.includes('--aplicar')

if (APLICAR) {
  guardaProduccion({
    script: 'asignar-rol-personal-administrativo.js',
    operacion: "mover al rol 'Personal Administrativo' a los usuarios administrativos sin correo",
  })
}

const DEPENDENCIA_ADMINISTRATIVA = 'Administrativo'

const DEF_PERMISO = {
  codigo: 'notificaciones:recibir_email',
  modulo: 'notificaciones',
  accion: 'recibir_email',
  nombre: 'Recibir notificaciones por correo electrónico',
}

// Mismo literal que seedData/rbac.data.js.
const DEF_ROL = {
  nombre: 'Personal Administrativo',
  slug: 'personal_administrativo',
  descripcion:
    'Trabajador del área administrativa sin funciones de gestión en el sistema. Tiene las mismas capacidades que Usuario Común y además recibe las notificaciones por correo electrónico.',
  esSuperAdmin: false,
  ambito: 'global',
  esSistema: false,
}

async function run() {
  await connectDB()

  const permiso = await Permiso.findOneAndUpdate(
    { codigo: DEF_PERMISO.codigo },
    { $setOnInsert: DEF_PERMISO },
    { upsert: true, new: true }
  )

  // $setOnInsert en los campos editables: si alguien ya renombró el rol o le
  // ajustó la descripción desde la pantalla Roles, volver a correr el script
  // no le pisa el cambio. El permiso sí se garantiza con $addToSet, porque sin
  // él el rol no cumple su única razón de existir.
  const rol = await Rol.findOneAndUpdate(
    { slug: DEF_ROL.slug },
    { $setOnInsert: DEF_ROL, $addToSet: { permisos: permiso._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  console.log(`📌  Rol destino: "${rol.nombre}" (slug ${rol.slug})`)

  // Roles que YA reciben correo: a sus usuarios no hay que tocarlos.
  const rolesConEmail = await Rol.find({
    $or: [{ esSuperAdmin: true }, { permisos: permiso._id }],
  }).select('_id')
  const idsRolesConEmail = rolesConEmail.map((r) => r._id)

  const candidatos = await Usuario.find({
    estado: 'activo',
    dependencia: DEPENDENCIA_ADMINISTRATIVA,
    rol: { $nin: idsRolesConEmail },
  })
    .populate('rol', 'nombre')
    .select('nombre email cargo rol')

  if (!candidatos.length) {
    console.log('\n✅  Ningún usuario administrativo quedó sin correo — nada que mover.')
  } else {
    console.log(`\n${APLICAR ? '✏️  Moviendo' : '🔎  Se moverían'} ${candidatos.length} usuario(s):`)
    for (const u of candidatos) {
      console.log(`      ${u.nombre} — ${u.rol?.nombre} → ${rol.nombre} (${u.email})`)
    }
    if (APLICAR) {
      const res = await Usuario.updateMany(
        { _id: { $in: candidatos.map((u) => u._id) } },
        { $set: { rol: rol._id } }
      )
      console.log(`\n✅  ${res.modifiedCount} usuario(s) actualizado(s).`)
    } else {
      console.log('\nℹ️  Simulación: no se escribió nada. Repite con --aplicar para ejecutar.')
    }
  }

  const total = await Usuario.countDocuments({
    estado: 'activo',
    rol: { $in: [...idsRolesConEmail, rol._id] },
  })
  console.log(`\n📬  Usuarios activos que reciben correo tras este script: ${total}`)

  console.log('\n🏁  Listo.')
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Error inesperado:', err)
  process.exit(1)
})
