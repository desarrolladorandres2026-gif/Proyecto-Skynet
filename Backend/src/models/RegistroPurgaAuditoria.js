import mongoose from 'mongoose'

// Bitácora de cada corrida de la purga automática de RegistroAuditoria (ver
// auditoria.worker.js / auditoria.service.js#purgarAntiguos). Deliberadamente
// una colección APARTE de RegistroAuditoria: si esto viviera dentro de
// RegistroAuditoria, la purga acabaría siendo elegible para purgarse a sí
// misma con el tiempo, complicando poder reconstruir el historial de qué se
// archivó y cuándo. Ver auditoría de producción 2026-08-22, Fase 12.
const registroPurgaAuditoriaSchema = new mongoose.Schema(
  {
    fechaCorte: { type: Date, required: true },
    cantidad: { type: Number, required: true, default: 0 },
    ubicacionArchivo: { type: String, trim: true },
    hashArchivo: { type: String, trim: true },
    tamanoBytes: { type: Number },
    resultado: { type: String, enum: ['exito', 'sin_datos', 'fallido'], required: true },
    error: { type: String, trim: true },
    duracionMs: { type: Number },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: false } }
)

registroPurgaAuditoriaSchema.index({ creadoEn: -1 })

export default mongoose.model('RegistroPurgaAuditoria', registroPurgaAuditoriaSchema)
