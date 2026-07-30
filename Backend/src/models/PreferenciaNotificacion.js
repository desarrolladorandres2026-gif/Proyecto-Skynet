import mongoose from 'mongoose'

// Preferencias de notificación por usuario. Un usuario sin documento aquí
// se trata como "todo activado" (ver notificaciones.service.js:
// obtenerPreferencias) — así nadie queda sin avisos por no haber visitado
// nunca la pantalla de configuración.
//
// Los eventos transaccionales (reset de contraseña, alertas de seguridad)
// NO consultan este documento: se envían siempre, sin importar lo que diga
// aquí. Esto es deliberado (ver requisito de "separar transaccional de
// promocional") y evita que alguien se quede sin poder recuperar su cuenta
// por haberse dado de baja de correos.
const preferenciaNotificacionSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, unique: true },
    email: { activo: { type: Boolean, default: true } },
    push: { activo: { type: Boolean, default: true } },
    // Mapa categoria -> activo. Las categorías válidas viven en
    // notificaciones.catalogo.js; una categoría ausente del mapa se trata
    // como activa (mismo criterio "todo activado por defecto" de arriba).
    categorias: {
      type: Map,
      of: Boolean,
      default: {},
    },
  },
  { timestamps: true }
)

export default mongoose.model('PreferenciaNotificacion', preferenciaNotificacionSchema)
