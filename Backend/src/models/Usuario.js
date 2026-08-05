import mongoose from 'mongoose'

const usuarioSchema = new mongoose.Schema(
  {
    nombre_usuario: { type: String, required: true, unique: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    // Referencia al catálogo dinámico de Rol (RBAC granular, ver
    // models/Rol.js). Reemplaza el enum fijo de 2 valores que tenía antes;
    // scripts/migrate-rbac-roles.js migra los documentos legados.
    rol: { type: mongoose.Schema.Types.ObjectId, ref: 'Rol', required: true },
    dependencia: { type: String, trim: true },
    // Cargo/puesto del empleado. Se usa para prellenar el campo "Cargo" de
    // formularios institucionales (p. ej. Requerimientos) y para el bloque
    // de firma de quien aprueba — cada documento igual guarda su propio
    // snapshot del cargo al momento de firmarse, así que cambiarlo aquí
    // después no reescribe documentos ya firmados.
    cargo: { type: String, trim: true },
    // Legado: gobierna el acceso al módulo migrado mantenimiento, que aún no
    // usa el RBAC granular de Rol/Permiso. Se deprecará formalmente cuando
    // ese módulo migre a Permiso también.
    // El enum debe ir en el sub-schema del elemento: declararlo a nivel del
    // array (type:[String], enum:[...]) no valida cada item en Mongoose.
    modulos: {
      type: [{ type: String, enum: ['mantenimiento'] }],
      default: [],
    },
    estado: { type: String, enum: ['activo', 'inactivo'], default: 'activo' },

    // Rúbrica manuscrita del usuario, registrada una sola vez desde su perfil
    // ("Mi firma") y reutilizada cada vez que firma un documento. Vive en
    // Usuario y no en cada módulo porque es un dato de la persona: hoy la
    // estampa Requerimientos al aprobar, mañana puede hacerlo otro flujo.
    //   url        versión procesada (fondo transparente) — la que se estampa
    //   urlOriginal foto tal como se subió; respaldo si la transformación de
    //              Cloudinary no está disponible en el plan de la cuenta
    //   publicId   asset en Cloudinary; se conserva para poder reprocesar o
    //              borrar, y para saber si algún documento ya firmado lo usa
    firma: {
      url: { type: String, trim: true },
      urlOriginal: { type: String, trim: true },
      publicId: { type: String, trim: true },
      actualizadaEn: { type: Date },
    },

    // Se incrementa cada vez que se invalida una "generación" de tokens (reset
    // de contraseña, cambio de rol/módulos/estado por un admin). El JWT lleva
    // este valor; si no coincide con el de la BD, el token se rechaza aunque
    // no haya expirado. Es lo que permite forzar el cierre de sesión remoto.
    tokenVersion: { type: Number, default: 0 },

    // Bloqueo de cuenta por fuerza bruta, independiente del rate limiting por
    // IP (que no protege contra un ataque distribuido desde muchas IPs).
    intentosFallidos: { type: Number, default: 0 },
    bloqueadoHasta: { type: Date, default: null },
  },
  { timestamps: true }
)

export default mongoose.model('Usuario', usuarioSchema)
