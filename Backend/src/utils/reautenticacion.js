import bcrypt from 'bcryptjs'
import Usuario from '../models/Usuario.js'
import { ErrorValidacion } from './errores.js'

// "Firma digital" = reingreso de contraseña como challenge de identidad
// dentro de una sesión YA autenticada (no crea sesión nueva, no toca
// tokenVersion). A diferencia de login(), aquí no hace falta el truco del
// hash señuelo/tiempo-constante de auth.controller.js: ya sabemos quién es
// el usuario (viene del JWT verificado), no hay enumeración de cuentas que
// proteger — solo confirmar que quien aprueba es realmente quien dice ser.
export async function reautenticar(usuarioId, passwordIngresada) {
  if (typeof passwordIngresada !== 'string' || !passwordIngresada) {
    throw new ErrorValidacion('Debes reingresar tu contraseña para confirmar la firma')
  }
  const usuario = await Usuario.findById(usuarioId).select('password')
  const ok = usuario && (await bcrypt.compare(passwordIngresada, usuario.password))
  if (!ok) {
    throw new ErrorValidacion('Contraseña incorrecta, no se pudo confirmar la firma')
  }
}
