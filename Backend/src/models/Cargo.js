import mongoose from 'mongoose'

const cargoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true, trim: true },
})

export default mongoose.model('Cargo', cargoSchema)
