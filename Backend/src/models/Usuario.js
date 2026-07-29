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
    // Solo aplica a usuarios con un Rol de ambito:'empresa' (Empresa
    // Transportadora): cargarScopeEmpresa() lo usa para restringir cada
    // consulta/mutación a los datos de esta empresa.
    empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', default: null },
    dependencia: { type: String, trim: true },
    // Cargo/puesto del empleado. Se usa para prellenar el campo "Cargo" de
    // formularios institucionales (p. ej. Requerimientos) y para el bloque
    // de firma de quien aprueba — cada documento igual guarda su propio
    // snapshot del cargo al momento de firmarse, así que cambiarlo aquí
    // después no reescribe documentos ya firmados.
    cargo: { type: String, trim: true },
    // Legado: gobierna el acceso a los módulos migrados (mantenimiento,
    // sigittn), que aún no usan el RBAC granular de Rol/Permiso. Se deprecará
    // formalmente cuando esos dos módulos migren a Permiso también.
    // El enum debe ir en el sub-schema del elemento: declararlo a nivel del
    // array (type:[String], enum:[...]) no valida cada item en Mongoose.
    modulos: {
      type: [{ type: String, enum: ['mantenimiento', 'sigittn'] }],
      default: [],
    },
    estado: { type: String, enum: ['activo', 'inactivo'], default: 'activo' },

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
