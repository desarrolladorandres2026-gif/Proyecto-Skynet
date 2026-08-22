import mongoose from 'mongoose'

// ── Fuente ÚNICA de verdad del estado de la plataforma ──────────────────────
// Documento singleton (una sola fila, clave fija 'global'). Persistir esto en
// Mongo — y no en una variable de módulo — es lo que hace que el mantenimiento
// SOBREVIVA a un reinicio de Node/PM2: al arrancar, el proceso lee este
// documento y sigue exactamente donde estaba, sin ventana en la que la
// plataforma vuelva a estar abierta por accidente.
//
// Los nombres de campo del contrato (enabled, status, scheduledStart,
// scheduledEnd, reason, message, createdBy) se conservan tal cual se
// especificaron; los valores de `status` sí van en español porque son los
// mismos literales que pinta la UI y que registra la auditoría.
const estadoPlataformaSchema = new mongoose.Schema(
  {
    // Clave del singleton. El índice único es la garantía REAL de que no
    // pueden existir dos documentos de estado: si dos procesos arrancan a la
    // vez y ambos intentan crear el inicial, Mongo rechaza el segundo con
    // E11000 y ese proceso relee el que ganó (ver repository.obtenerOCrear).
    clave: { type: String, default: 'global', unique: true, immutable: true },

    // Espejo booleano de `status === 'en_mantenimiento'`. Redundante a
    // propósito: el middleware del hot path pregunta por esto y solo por
    // esto, así que un cambio futuro en los estados no puede convertirse en
    // silencio en un "la plataforma quedó abierta durante el mantenimiento".
    enabled: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ['operativa', 'programado', 'en_mantenimiento'],
      default: 'operativa',
    },

    // Instantes UTC (Mongo siempre guarda UTC). La conversión desde lo que
    // eligió el administrador en un <input type="datetime-local"> la hace
    // instanteLocal() en utils/fechas.js, que ancla el literal al offset del
    // Terminal en vez de a la TZ del proceso Node.
    scheduledStart: { type: Date, default: null },
    // Opcional: un mantenimiento puede no tener hora de fin conocida ("hasta
    // nuevo aviso"). En ese caso no hay finalización automática ni cuenta
    // regresiva de cierre — solo el botón "Finalizar mantenimiento".
    scheduledEnd: { type: Date, default: null },

    reason: { type: String, trim: true, maxlength: 200, default: '' },
    message: { type: String, trim: true, maxlength: 1000, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    // Snapshot del nombre de quien programó/activó: si esa cuenta se elimina
    // después, el historial debe seguir diciendo quién fue.
    createdByNombre: { type: String, trim: true, default: '' },

    // ── Identidad del ciclo de mantenimiento ─────────────────────────────
    // Se genera al programar/activar y se conserva hasta que ese
    // mantenimiento termina. Es la clave que hace idempotentes las
    // notificaciones: "¿ya avisé el fin de ESTE mantenimiento?" no se puede
    // responder solo con el estado (que vuelve a 'operativa' y se parece a
    // cualquier otro reposo).
    mantenimientoId: { type: mongoose.Schema.Types.ObjectId, default: null },

    iniciadoEn: { type: Date, default: null },
    finalizadoEn: { type: Date, default: null },

    // ── Banderas de idempotencia de notificaciones ───────────────────────
    // Cada una se levanta DENTRO del mismo findOneAndUpdate atómico que hace
    // la transición correspondiente (ver plataforma.service.js). Como el
    // filtro exige que la bandera esté abajo, dos procesos que evalúen el
    // mismo tick no pueden notificar los dos: uno recibe el documento, el
    // otro recibe null y no hace nada.
    avisoPrevioEnviado: { type: Boolean, default: false },
    notificacionInicioEnviada: { type: Boolean, default: false },
    notificacionFinEnviada: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export default mongoose.model('EstadoPlataforma', estadoPlataformaSchema)
