// Detección de posibles cuentas duplicadas (mismo nombre de persona, cuentas
// distintas) — SOLO LECTURA. No fusiona, elimina ni cambia nada: únicamente
// lista lo que encuentra para que un administrador decida.
//
// Nace del diagnóstico end-to-end de notificaciones (2026-08-21), que
// encontró a KARENTH JULIETH FALLA NINCO con tres cuentas activas distintas:
//   - karenth.falla@skynet.local        (Super Administrador)
//   - dir.administrativo@skynet.local   (Dir. Administrativo y Gestión)
//   - financiera@elterminalneiva.com    (Dir. Administrativo y Gestión)
// Antes de reactivar módulos con aprobación por correo (requerimientos,
// ausencias), vale la pena confirmar cuál de las tres es la vigente: si las
// notificaciones de aprobación terminan repartidas entre bandejas que la
// persona revisa de forma distinta, alguna aprobación puede pasar
// desapercibida sin que el sistema esté haciendo nada mal.
//
// General a propósito (no hardcodea "Karen"): agrupa por nombre normalizado
// y reporta cualquier grupo con más de una cuenta activa, para que sirva
// como chequeo recurrente, no solo para este caso puntual.
//
// Uso: node scripts/detectar-usuarios-duplicados.js
import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Usuario from '../src/models/Usuario.js'
import '../src/models/Rol.js'

function normalizar(nombre) {
  return nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .replace(/\s+/g, ' ')
}

async function main() {
  await connectDB()

  const usuarios = await Usuario.find({ estado: 'activo' })
    .select('nombre nombre_usuario email rol')
    .populate('rol', 'nombre')

  const grupos = new Map()
  for (const u of usuarios) {
    const clave = normalizar(u.nombre)
    if (!grupos.has(clave)) grupos.set(clave, [])
    grupos.get(clave).push(u)
  }

  const duplicados = [...grupos.entries()].filter(([, lista]) => lista.length > 1)

  if (!duplicados.length) {
    console.log('No se encontraron cuentas activas duplicadas por nombre.')
  } else {
    console.log(`Se encontraron ${duplicados.length} nombre(s) con más de una cuenta activa:\n`)
    for (const [, lista] of duplicados) {
      console.log(`"${lista[0].nombre}" — ${lista.length} cuentas:`)
      for (const u of lista) {
        console.log(`  - ${u.email} (usuario: ${u.nombre_usuario}, rol: ${u.rol?.nombre || '(sin rol)'}, _id: ${u._id})`)
      }
      console.log('')
    }
    console.log('Este script NO fusiona ni elimina nada. Si alguna de estas es un')
    console.log('duplicado real, la decisión de cuál conservar es administrativa.')
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('ERROR:', err)
  process.exit(1)
})
