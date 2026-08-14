import mongoose from 'mongoose'

const cargoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    // Dependencia por defecto de este cargo (Talento Humano Fase 1).
    // Opcional por la misma razón que Dependencia.padre: cargos creados
    // antes de este concepto no tienen por qué quedar sin catalogar.
    dependencia: { type: mongoose.Schema.Types.ObjectId, ref: 'Dependencia', default: null, index: true },
  },
  { timestamps: true }
)

export default mongoose.model('Cargo', cargoSchema)
