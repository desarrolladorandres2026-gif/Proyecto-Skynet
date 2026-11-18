import mongoose from 'mongoose'

// Temática visual del sistema (Navidad, etc.), igual para TODOS los usuarios.
// Singleton: el servicio hace findOne({clave}) / upsert, y "sin documento"
// equivale a 'auto'.
//
// `modo` no se valida contra un catálogo aquí: las temáticas viven en el
// frontend (frontend/src/tematicas/registro.js). Un id desconocido (temática
// retirada) el frontend lo trata como 'auto'.
//   'auto'    → la temática de la temporada vigente, o ninguna
//   'ninguna' → sin decoración
//   '<id>'    → temática fija, sin importar la fecha
const configuracionTematicaSchema = new mongoose.Schema(
  {
    clave: { type: String, default: 'global', unique: true },
    modo: { type: String, default: 'auto', trim: true, maxlength: 40 },
    actualizadoPor: { type: String, trim: true },
  },
  { timestamps: true }
)

export default mongoose.model('ConfiguracionTematica', configuracionTematicaSchema)
