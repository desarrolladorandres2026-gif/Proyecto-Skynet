import mongoose from 'mongoose'

// Estado de activación de cada módulo funcional del sistema. El catálogo (qué
// módulos existen, cuáles son núcleo) vive en seedData/modulos.data.js y se
// sincroniza al arrancar (ver modules/sistema/sistema.service.js); aquí solo
// se persiste el estado mutable `activo`, que el Super Admin cambia desde la
// pantalla "Módulos del sistema".
const moduloSistemaSchema = new mongoose.Schema(
  {
    // Coincide con la `key` de frontend/src/config/modulosRegistry.js: es el
    // identificador compartido entre catálogo backend, gate de rutas y sidebar.
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true },
    activo: { type: Boolean, default: true },
    // Los módulos núcleo (dashboard, usuarios, roles, auditoría, sistema) no
    // pueden desactivarse: sin este candado el Super Admin podría dejarse a sí
    // mismo sin la pantalla necesaria para revertir el cambio.
    esNucleo: { type: Boolean, default: false },
    orden: { type: Number, default: 100 },
  },
  { timestamps: true }
)

export default mongoose.model('ModuloSistema', moduloSistemaSchema)
