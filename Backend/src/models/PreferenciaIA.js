import mongoose from 'mongoose'

// Preferencias personales de avisos proactivos de IA, mismo molde que
// PreferenciaNotificacion: un usuario sin documento aquí se trata como "todo
// activado, con voz" (ver ia.service.js#obtenerPreferencias) — nadie queda
// sin avisos ni sin voz por no haber visitado nunca esta pantalla.
const preferenciaIASchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, unique: true },
    // Interruptor rápido: si está en false, los avisos siguen llegando al
    // chat (burbuja) pero nunca se leen en voz alta, sin importar lo que
    // digan las categorías de abajo.
    voz: { activo: { type: Boolean, default: true } },
    // Mapa categoria -> activo. Las categorías válidas viven en
    // notificaciones.catalogo.js (se reutiliza el mismo catálogo, no se
    // duplica); una categoría ausente del mapa se trata como activa.
    categorias: {
      type: Map,
      of: Boolean,
      default: {},
    },
  },
  { timestamps: true }
)

export default mongoose.model('PreferenciaIA', preferenciaIASchema)
