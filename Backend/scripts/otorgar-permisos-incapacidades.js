/**
 * Script puntual: asigna los permisos del trámite de incapacidades a los roles
 * que corresponda en TU base de datos.
 *
 * Por qué hace falta: sembrarCatalogoRBAC() usa $setOnInsert para no pisar lo
 * que se personalizó desde la pantalla Roles, así que un rol que ya existe
 * nunca recibe un permiso agregado después en el código. Los permisos nuevos
 * se crean solos al arrancar el backend, pero hay que asignarlos a los roles.
 * Esto lo hace de una vez; también se puede hacer a mano en Roles y permisos.
 *
 * Los roles se indican por SLUG (el identificador interno, que no cambia
 * aunque se renombre el rol). Cada flag recibe uno o varios slugs separados
 * por coma:
 *
 *   --verificar=sig                 SIG: verifica el soporte, aprueba o devuelve
 *   --foliar=seguridad              Secretaria de Gerencia: folía y completa el folio
 *   --direccionar=gn                Gerencia: direcciona a Talento Humano
 *   --recibir=talento_humano        Talento Humano: recibe (y sale como destinatario posible)
 *   --supervisar=gn,sig,talento_humano   Supervisión de todas las incapacidades
 *
 * Sin --aplicar solo MUESTRA lo que haría (vista previa); no escribe nada.
 *
 * Uso:
 *   node scripts/otorgar-permisos-incapacidades.js --verificar=sig --foliar=seguridad \
 *     --direccionar=gn --recibir=talento_humano --supervisar=gn,sig
 *   (revisar la vista previa y repetir el mismo comando agregando --aplicar)
 *
 * Idempotente: si el rol ya tiene el permiso, no hace nada.
 */

import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import Usuario from '../src/models/Usuario.js'
import { PERMISOS } from '../src/seedData/rbac.data.js'
import { guardaProduccion } from './lib/guardaProduccion.js'

guardaProduccion({
  script: 'otorgar-permisos-incapacidades.js',
  operacion: 'asignar los permisos del trámite de incapacidades a roles',
})

const FLAGS = {
  verificar: 'ausencias:verificar_incapacidades',
  foliar: 'ausencias:foliar_incapacidades',
  direccionar: 'ausencias:direccionar_incapacidades',
  recibir: 'ausencias:recibir_incapacidades',
  supervisar: 'ausencias:supervisar_incapacidades',
}

function leerArgumentos() {
  const asignaciones = []
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([a-z]+)=(.+)$/)
    if (!m || !(m[1] in FLAGS)) continue
    for (const slug of m[2].split(',').map((x) => x.trim()).filter(Boolean)) {
      asignaciones.push({ slug, codigo: FLAGS[m[1]] })
    }
  }
  return asignaciones
}

async function run() {
  const asignaciones = leerArgumentos()
  const aplicar = process.argv.includes('--aplicar')

  if (asignaciones.length === 0) {
    console.error('Indica al menos un rol. Ejemplo:\n  node scripts/otorgar-permisos-incapacidades.js --verificar=sig --foliar=seguridad --direccionar=gn --recibir=talento_humano --supervisar=gn,sig')
    process.exit(1)
  }

  await connectDB()
  console.log(aplicar ? '\nAplicando cambios.\n' : '\nVISTA PREVIA: no se escribe nada. Agrega --aplicar para ejecutar.\n')

  // Se upsertan aquí también (no solo se buscan) para no depender de que el
  // backend ya haya arrancado con el código nuevo.
  const permisoPorCodigo = new Map()
  for (const codigo of new Set(asignaciones.map((a) => a.codigo))) {
    const def = PERMISOS.find((p) => p.codigo === codigo)
    const doc = aplicar
      ? await Permiso.findOneAndUpdate({ codigo }, { $setOnInsert: def }, { upsert: true, new: true })
      : await Permiso.findOne({ codigo })
    permisoPorCodigo.set(codigo, doc)
  }

  for (const { slug, codigo } of asignaciones) {
    const rol = await Rol.findOne({ slug })
    if (!rol) {
      console.log(`⚠️  No existe un rol con slug "${slug}" — se omite ${codigo}.`)
      continue
    }
    const permiso = permisoPorCodigo.get(codigo)
    if (permiso && rol.permisos.some((id) => id.equals(permiso._id))) {
      console.log(`ℹ️  "${rol.nombre}" (${slug}) ya tiene ${codigo}.`)
      continue
    }
    const usuarios = await Usuario.countDocuments({ rol: rol._id, estado: 'activo' })
    if (!aplicar) {
      console.log(`➡️  Se agregaría ${codigo} a "${rol.nombre}" (${slug}) — ${usuarios} usuario(s) activo(s).`)
      continue
    }
    await Rol.updateOne({ _id: rol._id }, { $addToSet: { permisos: permiso._id } })
    console.log(`✅  ${codigo} agregado a "${rol.nombre}" (${slug}) — ${usuarios} usuario(s) activo(s).`)
  }

  console.log('\n🏁  Listo.')
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Error inesperado:', err)
  process.exit(1)
})
