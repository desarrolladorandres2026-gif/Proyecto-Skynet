import mongoose from 'mongoose'

// Talento Humano Fase 1 — expediente básico de personal, separado de
// Usuario a propósito (ver docs/arquitectura/01-talento-humano.md §5):
// Usuario responde "qué puede hacer esta persona en el sistema" (credencial,
// sesión, rol); Empleado responde "quién es esta persona para el Terminal"
// (cargo, dependencia, fecha de ingreso). Son responsabilidades que cambian
// por razones distintas y en momentos distintos.
export const TIPOS_DOCUMENTO = ['CC', 'CE', 'PA', 'TI', 'RC']

const empleadoSchema = new mongoose.Schema(
  {
    // 1:1 obligatorio desde Empleado (decisión explícita del usuario,
    // 2026-07-29): todo Empleado tiene Usuario. La relación es opcional en
    // el otro sentido — no todo Usuario es Empleado (ver Usuario.js, que no
    // gana ninguna referencia nueva en esta fase).
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, unique: true, index: true },

    numeroDocumento: { type: String, required: true, unique: true, trim: true },
    tipoDocumento: { type: String, enum: TIPOS_DOCUMENTO, default: 'CC' },
    telefono: { type: String, trim: true, default: '' },

    // Referencias reales (a diferencia de Usuario.dependencia/cargo, que son
    // texto libre legado — ver catalogos.controller.js). Opcionales: un
    // empleado puede existir sin cargo/dependencia asignados todavía.
    cargo: { type: mongoose.Schema.Types.ObjectId, ref: 'Cargo', default: null },
    dependencia: { type: mongoose.Schema.Types.ObjectId, ref: 'Dependencia', default: null, index: true },

    fechaIngreso: { type: Date, required: true },

    // Nunca se borra físicamente (mismo patrón que Usuario/Rol): desvincular
    // es un hecho de negocio con fecha y motivo, no un delete. 'inactivo' =
    // desvinculado.
    estado: { type: String, enum: ['activo', 'inactivo'], default: 'activo', index: true },
    fechaDesvinculacion: { type: Date, default: null },
    motivoDesvinculacion: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
)

export default mongoose.model('Empleado', empleadoSchema)
