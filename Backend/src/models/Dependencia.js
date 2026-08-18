import mongoose from 'mongoose'

const dependenciaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    // Jerarquía organizacional. Opcional: la mayoría de dependencias del
    // catálogo actual son planas (creadas antes de que existiera este
    // concepto) y no todas necesitan un padre. El nombre se fijó como
    // "Dependencia" (no "Departamento") para no chocar con "Área" si algún
    // día existe en el dominio de Activos/Infraestructura.
    padre: { type: mongoose.Schema.Types.ObjectId, ref: 'Dependencia', default: null, index: true },
  },
  { timestamps: true }
)

export default mongoose.model('Dependencia', dependenciaSchema)
