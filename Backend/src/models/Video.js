import mongoose from 'mongoose'

// "Videos informativos": contenido institucional que un administrador publica
// y que los trabajadores ven en su pantalla de inicio (ver modules/videos).
// El video más recientemente publicado es el destacado; el resto forma el
// historial.
//
// No hay estados (borrador/publicado/desactivado): todo video está publicado
// desde su `fechaPublicacion`. Con fecha futura queda programado; para
// retirarlo, se elimina.
// 'local' = archivo subido desde el computador y guardado en el disco del VPS
// (ver modules/videos/videos.almacenamiento.js). 'archivo' es otra cosa: un
// enlace https directo a un .mp4 alojado en otro servidor.
export const PROVEEDORES_VIDEO = ['youtube', 'vimeo', 'archivo', 'externo', 'local']

const videoSchema = new mongoose.Schema(
  {
    titulo: { type: String, required: true, trim: true, maxlength: 140 },
    descripcion: { type: String, trim: true, maxlength: 600, default: '' },
    // Área, comité o categoría responsable. Texto libre con sugerencias del
    // frontend (las ya usadas): los comités no son dependencias del catálogo.
    categoria: { type: String, required: true, trim: true, maxlength: 80 },

    // URL registrada + lo que el servidor dedujo de ella (ver utils/videoUrl.js).
    // Vacía cuando el video es un archivo subido (proveedor 'local'): la regla
    // "URL o archivo, uno de los dos" la hace cumplir videos.service.js.
    url: { type: String, trim: true, maxlength: 2048, default: '' },
    proveedor: { type: String, enum: PROVEEDORES_VIDEO, required: true },
    videoId: { type: String, trim: true, default: '' },
    videoHash: { type: String, trim: true, default: '' },

    // Solo con proveedor 'local'. `nombre` es el generado por el servidor (el
    // único que se usa para leer del disco); `nombreOriginal` es solo para
    // mostrarle al administrador qué subió. `mimeType` es el tipo DETECTADO en
    // el contenido, no el que declaró el navegador.
    archivo: {
      nombre: { type: String, trim: true },
      nombreOriginal: { type: String, trim: true },
      tamano: { type: Number },
      mimeType: { type: String, trim: true },
    },

    // Miniatura subida a Cloudinary. Si falta, el frontend usa la de YouTube
    // (derivada del videoId) o un fondo neutro.
    miniatura: {
      url: { type: String, trim: true },
      publicId: { type: String, trim: true },
    },

    // Legado: hasta el 2026-09-23 existía un estado (borrador/publicado/
    // desactivado). Ya no se expone ni se escribe; se conserva solo para que un
    // documento antiguo que quedó en 'borrador' o 'desactivado' NO aparezca de
    // golpe ante el personal. Editarlo lo publica (actualizarVideo quita el
    // campo). Ver OCULTOS_LEGADO en videos.service.js.
    estado: { type: String, trim: true },
    // Momento desde el cual el video es visible: al crearlo, la fecha que elija
    // el administrador o, si la deja vacía, el momento de guardarlo. Con fecha
    // futura queda programado (no aparece hasta entonces).
    fechaPublicacion: { type: Date, required: true },

    // Snapshots de autoría (mismo criterio que AvisoTerminal.creadoPor): el
    // historial sigue siendo legible aunque la cuenta cambie o se renombre.
    creadoPor: {
      usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
      nombre: { type: String, required: true, trim: true },
    },
    actualizadoPor: {
      usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
      nombre: { type: String, trim: true },
    },
  },
  { timestamps: true }
)

// Consulta del destacado y del historial: fecha descendente, con _id como
// desempate estable si dos videos comparten el mismo instante.
videoSchema.index({ fechaPublicacion: -1, _id: -1 })
videoSchema.index({ categoria: 1, fechaPublicacion: -1 })

export default mongoose.model('Video', videoSchema)
