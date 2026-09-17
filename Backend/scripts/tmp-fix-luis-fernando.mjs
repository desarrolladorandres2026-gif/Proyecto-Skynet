import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Usuario from '../src/models/Usuario.js'
import { hashPassword } from '../src/utils/password.js'

// Corrección puntual aprobada por el usuario: replica exactamente lo que se
// hace a mano en el panel admin (pegar el email en "contraseña" y "confirmar
// contraseña") para el usuario "LUIS FERNANDO", cuyo hash guardado no
// coincidía con hash(su email) — ver diagnóstico de esta conversación.
// Archivo temporal: se borra tras usarlo, no forma parte del repo.
async function main() {
  await connectDB()

  const usuario = await Usuario.findOne({ nombre_usuario: 'LUIS FERNANDO' }).select('+sesionesActivas')
  if (!usuario) {
    console.error('No se encontró el usuario "LUIS FERNANDO"')
    process.exit(1)
  }

  usuario.password = await hashPassword(usuario.email)
  usuario.debeCambiarPassword = true
  usuario.tokenVersion += 1
  usuario.intentosFallidos = 0
  usuario.bloqueadoHasta = null
  usuario.sesionesActivas = []
  await usuario.save()

  console.log(`OK: contraseña de "${usuario.nombre_usuario}" (${usuario.email}) igualada a su email.`)

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
