import mongoose from 'mongoose'
import { EMAIL_REGEX } from '../utils/regex.js'

const usuarioSchema = new mongoose.Schema(
  {
    nombre_usuario: { type: String, required: true, unique: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    // select:false es defensa en profundidad: ningún find()/findOne() trae el
    // hash salvo que lo pida explícitamente con .select('+password') (login,
    // reautenticación). Antes dependía 100% de que cada consulta nueva
    // recordara excluirlo a mano con '-password'.
    password: { type: String, required: true, select: false },
    // El controlador ya valida el formato con esEmailValido() antes de tocar
    // la BD; este `match` es defensa en profundidad para cualquier inserción
    // que no pase por ahí (script, migración, llamada directa al modelo).
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, match: EMAIL_REGEX },
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

    // Separa cuentas de prueba/desarrollo del personal real del Terminal.
    // Todo el código que representa personal real (dashboards, estadísticas,
    // selectores de trabajador, notificaciones, conteos) debe filtrar
    // { esPrueba: false }. Nuevos usuarios (creados a mano o por import)
    // siempre nacen con esPrueba:false; solo la migración inicial marcó los
    // 16 usuarios preexistentes como true.
    esPrueba: { type: Boolean, default: false },

    // true cuando la contraseña actual la eligió otra persona (seed de
    // desarrollo, o un admin creando la cuenta) en vez de su dueño: fuerza el
    // cambio en el siguiente login (ver POST /auth/cambiar-password).
    debeCambiarPassword: { type: Boolean, default: false },

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

// Optimiza Usuario.countDocuments({ estado: 'activo' }) / .find({ estado:
// 'activo', ... }) — usado en cada carga del dashboard universal y del
// dashboard SIG (tarjeta "usuarios", indicador "totalTrabajadores") y en
// resolverAudiencia() (sig_pregunta_dia/comun.js, cada publicación). Sin este
// índice, cada una de esas consultas escaneaba la colección completa.
usuarioSchema.index({ estado: 1 })
// Casi toda consulta de "personal real" combina esPrueba:false con otro
// filtro (estado, rol) — ver usuarios.controller.js, dashboard.service.js,
// sig_pregunta_dia/comun.js, etc.
usuarioSchema.index({ esPrueba: 1 })

export default mongoose.model('Usuario', usuarioSchema)
