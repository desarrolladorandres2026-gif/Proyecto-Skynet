import mongoose from 'mongoose'

// Estado de UN destinatario frente a UN aviso institucional. Existe separado
// de AvisoTerminal (evento) por el mismo motivo que EnvioNotificacion existe
// separado de Notificacion: "se transmitió" y "esta persona ya lo
// escuchó" son hechos distintos que ocurren en momentos distintos, y el
// panel necesita poder mostrar los dos ("enviado" vs "reproducido" del
// enunciado del requerimiento).
//
// Ciclo de vida (nunca retrocede):
//   pendiente  -> creada al transmitir, antes de cualquier intento de push
//   enviado    -> se intentó Web Push a al menos un dispositivo activo del
//                 usuario (o no tenía ninguno: igual pasa a 'enviado' porque
//                 el mensaje ya está disponible vía polling en cuanto abra
//                 la app — ver avisos.service.js)
//   entregado  -> el dispositivo del usuario confirmó que lo recibió
//                 (push mostrado o polling lo trajo)
//   reproducido-> el dispositivo confirmó que terminó de sonar la locución
//   fallido    -> nunca se pudo entregar (usuario inactivo al momento de
//                 resolver audiencia; no debería ocurrir en la práctica
//                 porque resolverDestinatarios() ya filtra por activo)
const avisoTerminalEntregaSchema = new mongoose.Schema(
  {
    aviso: { type: mongoose.Schema.Types.ObjectId, ref: 'AvisoTerminal', required: true },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    estado: {
      type: String,
      enum: ['pendiente', 'enviado', 'entregado', 'reproducido', 'fallido'],
      default: 'pendiente',
    },
    enviadoEn: { type: Date },
    entregadoEn: { type: Date },
    reproducidoEn: { type: Date },
    error: { type: String, trim: true },
  },
  { timestamps: true }
)

// Un usuario nunca debe recibir dos filas del mismo aviso (ver "Evitar
// duplicación de mensajes" en los requisitos): resolverDestinatarios() ya
// deduplica antes del insertMany, este índice es la garantía de base de
// datos si alguna vez se reintenta la creación.
avisoTerminalEntregaSchema.index({ aviso: 1, usuario: 1 }, { unique: true })
// "Mis avisos pendientes" (polling del reproductor) y "mi historial de
// avisos recibidos": siempre por usuario, más reciente primero.
avisoTerminalEntregaSchema.index({ usuario: 1, estado: 1, createdAt: -1 })

export default mongoose.model('AvisoTerminalEntrega', avisoTerminalEntregaSchema)
