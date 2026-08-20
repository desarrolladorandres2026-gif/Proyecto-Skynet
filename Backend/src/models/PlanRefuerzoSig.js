import mongoose from 'mongoose'

// Seguimiento de refuerzo por trabajador + componente SIG. Se genera/actualiza
// (upsert) automáticamente cuando el cálculo de desempeño detecta a alguien
// en nivel Bajo/Crítico para un componente (ver sig-dashboard.service.js).
// Los campos de gestión (accionCapacitacion, responsable, fechaProgramada,
// observaciones, estado) quedan ya preparados desde ahora, tal como pide la
// especificación del módulo, aunque su flujo completo de asignación se
// construye más adelante — así la arquitectura no necesita otra migración
// cuando esa pantalla se construya.
const planRefuerzoSigSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    componenteSig: { type: String, required: true, trim: true },
    // Tema con mayor cantidad de errores dentro de ese componente (puede
    // quedar vacío si el refuerzo se detectó a nivel de componente completo).
    tema: { type: String, trim: true, default: '' },
    // Clave de ConfiguracionSig.nivelesDesempeno vigente en el momento de la
    // detección (no una referencia viva: si los umbrales cambian después, un
    // plan ya detectado no se reclasifica solo).
    nivelDetectado: { type: String, required: true, trim: true },
    porcentajeAcierto: { type: Number, required: true, min: 0, max: 100 },
    fechaDeteccion: { type: Date, default: Date.now },
    accionCapacitacion: { type: String, trim: true, default: '' },
    responsable: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    fechaProgramada: { type: Date, default: null },
    observaciones: { type: String, trim: true, default: '' },
    estado: { type: String, enum: ['pendiente', 'en_progreso', 'completado', 'descartado'], default: 'pendiente' },
  },
  { timestamps: true }
)

planRefuerzoSigSchema.index({ usuario: 1, componenteSig: 1, estado: 1 })

export default mongoose.model('PlanRefuerzoSig', planRefuerzoSigSchema)
