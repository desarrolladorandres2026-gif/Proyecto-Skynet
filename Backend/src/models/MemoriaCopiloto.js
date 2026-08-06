import mongoose from 'mongoose'

// Memoria LARGA del copiloto: lo que debe seguir sabiendo de una persona
// cuando la conversación de hoy ya expiró (ver ConversacionCopiloto, TTL 24 h).
//
// Un documento por usuario, con una lista corta de hechos que ÉL MISMO pidió
// recordar. No es un registro de todo lo que dice: es lo que sirve para no
// volver a preguntar lo mismo ("el área que solicita siempre es Mantenimiento",
// "prefiero que me respondas cortico").
//
// ── Por qué los hechos los escribe el modelo y no un extractor automático ───
// La alternativa era analizar cada conversación al cerrarla para deducir
// preferencias. Eso cuesta una petición extra de la cuota gratuita compartida
// POR CONVERSACIÓN, y produce memoria basura: el modelo "deduce" preferencias
// de comentarios de paso y termina recordando cosas que la persona nunca pidió
// recordar, sin que ella sepa que quedaron guardadas.
//
// Aquí el modelo solo escribe cuando llama a la herramienta `recordar`, que se
// dispara con una petición explícita ("acuérdate de que…"), y el usuario puede
// ver y borrar lo guardado. Es menos "mágico" y mucho más predecible, que es
// lo que se quiere de un sistema que guarda datos de personas.

const hechoSchema = new mongoose.Schema(
  {
    // Clave normalizada: permite reemplazar un hecho en vez de acumular
    // versiones contradictorias del mismo dato ("mi área es Bodega" dicho hoy
    // debe pisar "mi área es Mantenimiento" dicho el mes pasado).
    clave: { type: String, required: true, trim: true, maxlength: 60 },
    valor: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { _id: false, timestamps: { createdAt: 'en', updatedAt: false } }
)

const memoriaSchema = new mongoose.Schema(
  {
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      unique: true,
    },
    hechos: { type: [hechoSchema], default: [] },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
)

export default mongoose.model('MemoriaCopiloto', memoriaSchema)
