import mongoose from 'mongoose'

const dependenciaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true, trim: true },
})

export default mongoose.model('Dependencia', dependenciaSchema)
