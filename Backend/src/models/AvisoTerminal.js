import mongoose from 'mongoose'

// "Avisos Terminal de Neiva": anuncio institucional por voz, transmitido por
// un admin desde el panel y reproducido en el dispositivo de cada
// destinatario (ver modules/avisos_terminal). Un documento por transmisión;
// el detalle de entrega/reproducción por persona vive en
// AvisoTerminalEntrega (1 aviso -> N entregas), igual que
// Notificacion/EnvioNotificacion separan el evento de su despacho por canal.
const avisoTerminalSchema = new mongoose.Schema(
  {
    // Texto tal como lo escribió el administrador, ya sanitizado (ver
    // sanitizarTexto() en avisos.service.js). Es lo que se muestra en
    // pantalla y lo que se envía como cuerpo del push.
    texto: { type: String, required: true, trim: true },
    // Texto completo que se pronuncia: PREFIJO_INSTITUCIONAL + texto.
    // Se guarda ya resuelto (en vez de recalcularlo en cada cliente) para que
    // un cambio futuro del prefijo no reescriba la locución de avisos ya
    // transmitidos.
    textoLocucion: { type: String, required: true, trim: true },

    // Snapshot de la selección de audiencia hecha por el admin. `usuarios`/
    // `rol`/`dependencia` conviven en el schema pero solo el que corresponde
    // a `tipo` se puebla — es más simple de leer en el historial que 3
    // colecciones separadas por tipo.
    destinatarios: {
      tipo: { type: String, enum: ['todos', 'usuario', 'rol', 'dependencia'], required: true },
      usuarios: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }],
      rol: { type: mongoose.Schema.Types.ObjectId, ref: 'Rol' },
      dependencia: { type: String, trim: true },
      // Etiqueta legible congelada al momento de transmitir (nombre del rol o
      // de la dependencia): evita depender de populate para pintar el
      // historial, y sobrevive a que el rol/dependencia se renombre o borre
      // después.
      etiqueta: { type: String, trim: true },
    },

    // Cuántas AvisoTerminalEntrega se crearon (= audiencia resuelta y
    // deduplicada en el momento de transmitir). Se guarda aparte para no
    // tener que contar la colección de entregas solo para pintar "12
    // destinatarios" en el historial.
    totalDestinatarios: { type: Number, required: true, default: 0 },

    // Snapshot de quién transmitió (mismo criterio que Requerimiento.firma):
    // el historial debe seguir siendo legible aunque la cuenta del admin se
    // renombre, cambie de rol o se elimine más adelante.
    creadoPor: {
      usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
      nombre: { type: String, required: true, trim: true },
      rolNombre: { type: String, trim: true },
    },

    // Voz institucional elegida por el admin para este aviso (ver
    // vocesTts.js) — se guarda aunque la generación falle, para que el
    // historial muestre qué se INTENTÓ usar. `audio.data` solo existe si la
    // generación tuvo éxito (ver generarAudioVoz() en avisos.tts.js): un
    // aviso sin audio no es un error, cada dispositivo cae a su propia voz
    // local (ver AvisoTerminalPlayer.jsx) — normalmente por haberse agotado
    // la cuota gratuita del modelo de voz (3 peticiones/min, compartida por
    // todo el proyecto).
    voz: { type: String, trim: true },
    audio: {
      data: { type: Buffer, select: false }, // select:false: nunca viaja en listados/historial, solo en el endpoint de audio
      mimeType: { type: String, trim: true, default: 'audio/wav' },
    },
  },
  { timestamps: true }
)

avisoTerminalSchema.index({ createdAt: -1 })

export default mongoose.model('AvisoTerminal', avisoTerminalSchema)
