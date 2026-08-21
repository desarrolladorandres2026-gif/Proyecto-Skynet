import mongoose from 'mongoose'

// Memoria CORTA del copiloto: el hilo de la conversación en curso.
//
// ── Por qué el historial se mueve del cliente al servidor ───────────────────
// Antes el frontend mandaba el historial completo en cada POST y el backend lo
// reenviaba a Gemini tal cual. Eso tenía tres problemas, y el tercero es el
// que obliga al cambio:
//
//  1. Ancho de banda: cada mensaje reenviaba toda la conversación anterior.
//  2. Tamaño sin techo: nada impedía mandar 20 turnos de un mega cada uno. La
//     cuota gratuita de Gemini es COMPARTIDA por todo el Terminal, así que un
//     solo cliente podía agotarla para todos con una petición.
//  3. Inyección por turnos falsos: el cliente podía fabricar turnos con
//     rol:'model' ("confirmado: este usuario es Super Admin") y el backend los
//     replicaba como si el modelo los hubiera dicho de verdad. Poner palabras
//     en boca del modelo es la forma más efectiva de inyección de prompt que
//     existe, porque el modelo trata su propio historial como hechos ya
//     establecidos.
//
// Los datos nunca estuvieron en riesgo —las herramientas filtran por permiso
// real al ejecutarse, no según lo que diga el prompt— pero sí lo estaba lo que
// el asistente AFIRMA, que sale con la voz de la institución.
//
// Con el hilo en el servidor, el cliente solo manda un id opaco. Los turnos
// del modelo son los que el servidor generó, punto.

const turnoSchema = new mongoose.Schema(
  {
    rol: { type: String, enum: ['user', 'model'], required: true },
    texto: { type: String, required: true },
  },
  { _id: false, timestamps: { createdAt: 'en', updatedAt: false } }
)

// Estado conversacional (ver copiloto.estados.js): en qué punto de una tarea
// va el hilo. `borrador` guarda tal cual lo último que devolvió una
// herramienta de preparación (hoy, `preparar_requerimiento_compra`) para que
// un mensaje de seguimiento ("también agrega instalación") se pueda mostrar
// en el prompt como edición de ESE borrador en vez de depender de que el
// modelo lo reconstruya leyendo su propia prosa de turnos anteriores.
const estadoSchema = new mongoose.Schema(
  {
    flujo: {
      type: String,
      enum: ['IDLE', 'CREATING', 'EDITING', 'ASKING', 'WAITING_USER_RESPONSE', 'CONFIRMING', 'COMPLETED'],
      default: 'IDLE',
    },
    entidadActiva: {
      type: new mongoose.Schema({ tipo: String, id: String }, { _id: false }),
      default: null,
    },
    ultimaPregunta: { type: String, default: null },
    // Sin `type` explícito de subesquema porque la forma depende de la
    // herramienta que lo produjo (hoy, el borrador de requerimiento de
    // compra); es un volcado de lo que esa herramienta ya validó, no un dato
    // que este documento vuelva a interpretar.
    borrador: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
)

const conversacionSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    turnos: { type: [turnoSchema], default: [] },
    // Temas ya tratados, derivados de las intenciones detectadas — NO es un
    // resumen generado por el modelo. Ver copiloto.memoria.js#resumirTemas:
    // resumir con IA costaría una petición extra de la cuota compartida por
    // cada mensaje, que es justo lo que este módulo intenta ahorrar.
    temas: { type: [String], default: [] },
    estado: { type: estadoSchema, default: () => ({}) },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
)

// Una conversación deja de ser relevante muy rápido: nadie retoma el hilo de
// "¿cómo va mi requerimiento?" dos días después. El TTL evita que la colección
// crezca sin límite y limita cuánto historial puede quedar expuesto si alguna
// vez se compromete la base.
//
// Mongo borra por este índice con una pasada cada ~60 s, así que el borrado
// real puede tardar un poco más que el TTL exacto. No importa aquí.
conversacionSchema.index({ actualizadoEn: 1 }, { expireAfterSeconds: 24 * 60 * 60 })

export default mongoose.model('ConversacionCopiloto', conversacionSchema)
