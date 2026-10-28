import mongoose from 'mongoose'

// Singleton (clave fija 'global') con el id del último radicado del sitio web
// del que Skynet ya avisó. Los radicados viven en WordPress y su id crece sin
// saltos hacia atrás, así que "nuevo" = id mayor que este. Persistirlo en Mongo
// (y no en memoria) evita re-avisar todo el historial tras cada reinicio.
const seguimientoRadicadosSchema = new mongoose.Schema(
  {
    clave: { type: String, default: 'global', unique: true, immutable: true },
    ultimoId: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
)

export default mongoose.model('SeguimientoRadicados', seguimientoRadicadosSchema)
