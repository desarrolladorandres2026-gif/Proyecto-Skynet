import mongoose from 'mongoose'

const nombreSchema = { nombre: { type: String, required: true, unique: true, trim: true } }

export const Dependencia = mongoose.model('Dependencia', new mongoose.Schema(nombreSchema))
export const ModuloOrigen = mongoose.model('ModuloOrigen', new mongoose.Schema(nombreSchema))
export const NivelUrgencia = mongoose.model('NivelUrgencia', new mongoose.Schema(nombreSchema))
