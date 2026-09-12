/**
 * Script puntual: otorga el permiso 'notificaciones:recibir_email' a los
 * roles con cargo administrativo del Terminal (ver seedData/rbac.data.js).
 *
 * A partir de ese permiso, el canal CORREO del motor de notificaciones
 * (modules/notificaciones/notificaciones.service.js#notificar) solo escribe a
 * quien lo tenga — más los roles esSuperAdmin, que lo reciben por bypass sin
 * necesidad de asignárselo. Todos los demás siguen recibiendo el mismo aviso
 * por push y en la campana interna: no se pierde ninguna notificación, solo
 * deja de salir el correo.
 *
 * Necesario porque sembrarCatalogoRBAC() usa $setOnInsert para no pisar
 * personalizaciones hechas desde la pantalla Roles: un rol que ya existe en
 * Atlas nunca recibe automáticamente un permiso agregado después en el
 * código. Mismo caso que scripts/otorgar-permiso-catalogos.js.
 *
 * Idempotente: si el rol ya tiene el permiso, no hace nada.
 *
 * Uso:
 *   node scripts/otorgar-permiso-recibir-email.js
 *
 * Con --ver-efecto imprime, además, cuántos usuarios activos quedan con y sin
 * correo habilitado — para confirmar el resultado sin enviar nada.
 */

import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import Usuario from '../src/models/Usuario.js'
import { guardaProduccion } from './lib/guardaProduccion.js'

guardaProduccion({
  script: 'otorgar-permiso-recibir-email.js',
  operacion: "otorgar 'notificaciones:recibir_email' a los roles administrativos",
})

// Se apunta por SLUG y no por nombre: el slug es el identificador interno
// estable (ver models/Rol.js), y en Atlas hay roles ya renombrados desde la
// pantalla Roles — 'comunicador' se muestra hoy como "Gestor De
// Comunicaciones", por ejemplo.
//
// La lista cubre TODOS los roles del catálogo: la decisión del Terminal es que
// todo el personal reciba los avisos por correo, no solo el área
// administrativa. Los datos de la cola respaldan que cabe: los días de 91-99
// correos (un cuestionario programado a los 91 usuarios reales) salen sin un
// solo fallo, y los 352 fallos históricos son de dos días con picos de 559 y
// 298 encolados, no del reparto diario.
//
// 'super_admin' no está porque `esSuperAdmin` ya bypassa cualquier permiso;
// asignárselo sería redundante y ruido en la matriz de Roles.
//
// Para RECORTAR el alcance más adelante no hay que editar esto: se desmarca el
// permiso del rol que sea desde la pantalla Roles. Quien pierde el correo sigue
// recibiendo el push y la campana interna.
const SLUGS_DESTINO = [
  'administrador',
  'administrativo_financiero',
  'bodega',
  'talento_humano',
  'sig_hseq',
  'comunicador',
  'operador',
  'usuario_comun',
  'personal_administrativo',
  'mantenimiento',
  'seguridad',
]

// Mismo literal que seedData/rbac.data.js — se upserta aquí también (no solo
// se busca) para no depender de que el backend desplegado ya haya arrancado
// con el código nuevo y corrido sincronizarCatalogoSistema().
const DEF_PERMISO = {
  codigo: 'notificaciones:recibir_email',
  modulo: 'notificaciones',
  accion: 'recibir_email',
  nombre: 'Recibir notificaciones por correo electrónico',
}

async function resumirEfecto(permisoId) {
  const rolesConEmail = await Rol.find({
    $or: [{ esSuperAdmin: true }, { permisos: permisoId }],
    estado: 'activo',
  }).select('nombre')

  const ids = rolesConEmail.map((r) => r._id)
  const conCorreo = await Usuario.countDocuments({ estado: 'activo', rol: { $in: ids } })
  const sinCorreo = await Usuario.countDocuments({ estado: 'activo', rol: { $nin: ids } })

  console.log('\n📬  Roles que reciben correo:')
  for (const r of rolesConEmail) {
    const n = await Usuario.countDocuments({ estado: 'activo', rol: r._id })
    console.log(`      ${r.nombre} — ${n} usuario(s) activo(s)`)
  }
  console.log(`\n    Usuarios activos CON correo: ${conCorreo}`)
  console.log(`    Usuarios activos SIN correo:  ${sinCorreo} (siguen recibiendo push y campana interna)`)
}

async function run() {
  await connectDB()

  const permiso = await Permiso.findOneAndUpdate(
    { codigo: DEF_PERMISO.codigo },
    { $setOnInsert: DEF_PERMISO },
    { upsert: true, new: true }
  )

  for (const slug of SLUGS_DESTINO) {
    const rol = await Rol.findOne({ slug })
    if (!rol) {
      console.log(`ℹ️  El rol con slug "${slug}" no existe en la BD — nada que hacer.`)
      continue
    }

    if (rol.permisos.some((id) => id.equals(permiso._id))) {
      console.log(`ℹ️  El rol "${rol.nombre}" ya tenía el permiso — sin cambios.`)
      continue
    }

    await Rol.updateOne({ _id: rol._id }, { $addToSet: { permisos: permiso._id } })
    console.log(`✅  Permiso "${DEF_PERMISO.codigo}" agregado al rol "${rol.nombre}".`)
  }

  if (process.argv.includes('--ver-efecto')) await resumirEfecto(permiso._id)

  console.log('\n🏁  Listo.')
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Error inesperado:', err)
  process.exit(1)
})
