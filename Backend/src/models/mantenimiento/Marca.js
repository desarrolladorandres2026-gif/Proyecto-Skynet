import mongoose from 'mongoose'

const marcaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true, trim: true },
})

export default mongoose.model('Marca', marcaSchema)
