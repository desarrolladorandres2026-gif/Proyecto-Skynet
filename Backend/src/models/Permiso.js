import mongoose from 'mongoose'

const permisoSchema = new mongoose.Schema(
  {
    // Formato fijo "modulo:accion", p. ej. "vehiculos:gestionar". Es el valor
    // que viaja en el JWT/sesión (vía Rol.permisos) y que compara
    // requierePermiso() en middleware/permisos.js.
    codigo: { type: String, required: true, unique: true, trim: true, lowercase: true },
    modulo: { type: String, required: true, trim: true, lowercase: true },
    accion: { type: String, required: true, trim: true, lowercase: true },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true },
  },
  { timestamps: true }
)

permisoSchema.index({ modulo: 1, accion: 1 }, { unique: true })

export default mongoose.model('Permiso', permisoSchema)
