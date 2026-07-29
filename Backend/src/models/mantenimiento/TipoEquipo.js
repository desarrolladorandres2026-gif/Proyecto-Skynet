import mongoose from 'mongoose'

const tipoEquipoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true, trim: true },
})

export default mongoose.model('TipoEquipo', tipoEquipoSchema)
