import mongoose from 'mongoose'

// Documento único (sin `clave` fija a propósito): el service siempre hace
// findOne({}) / findOneAndUpdate({}, ..., {upsert:true}), mismo patrón que
// ConfiguracionIA. Centraliza todo lo que la especificación del módulo pide
// "no dejar hardcodeado": catálogo de componentes SIG, niveles de desempeño
// y sus umbrales, horario por defecto y notificaciones.

const nivelDesempenoSchema = new mongoose.Schema(
  {
    clave: { type: String, required: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    // Porcentaje de acierto MÍNIMO (inclusive) para alcanzar este nivel.
    umbralMinimo: { type: Number, required: true, min: 0, max: 100 },
    color: { type: String, trim: true, default: '#64748b' },
    orden: { type: Number, required: true },
  },
  { _id: false }
)

export const COMPONENTES_SIG_DEFECTO = [
  'Calidad',
  'Ambiental',
  'SST',
  'Integración SIG',
  'PTEE',
  'PESV',
  'SARLAFT',
]

const configuracionSigSchema = new mongoose.Schema(
  {
    horaPublicacionDefecto: { type: String, trim: true, default: '08:00' },
    componentes: {
      type: [String],
      default: COMPONENTES_SIG_DEFECTO,
    },
    // Orden descendente por umbralMinimo (100 -> 0), sin huecos: ver
    // validación en sig-configuracion.service.js. Los defaults de abajo son
    // los del Excel de referencia, ya como datos configurables y no como
    // código.
    nivelesDesempeno: {
      type: [nivelDesempenoSchema],
      default: [
        { clave: 'alto', nombre: 'Alto', umbralMinimo: 90, color: '#059669', orden: 1 },
        { clave: 'adecuado', nombre: 'Adecuado', umbralMinimo: 75, color: '#0891b2', orden: 2 },
        { clave: 'bajo', nombre: 'Bajo', umbralMinimo: 60, color: '#d97706', orden: 3 },
        { clave: 'critico', nombre: 'Crítico', umbralMinimo: 0, color: '#dc2626', orden: 4 },
      ],
    },
    // null = nivel de desempeño calculado sobre el histórico completo del
    // trabajador; con un número, solo sobre sus últimos N días.
    ventanaDesempenoDias: { type: Number, default: null },
    notificarAlPublicar: { type: Boolean, default: true },
    actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  },
  { timestamps: true }
)

export default mongoose.model('ConfiguracionSig', configuracionSigSchema)
