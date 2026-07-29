import mongoose from 'mongoose'

const empresaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    nit: { type: String, trim: true },
    representante: { type: String, trim: true },
    telefono: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    direccion: { type: String, trim: true },
    estado: { type: String, enum: ['activo', 'inactivo'], default: 'activo' },
  },
  { timestamps: true }
)

export default mongoose.model('Empresa', empresaSchema)
