import mongoose from 'mongoose'

const registroDespliegueSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: ['prueba', 'oficial'], required: true },
    // Solo relevante para tipo:'oficial': es la mitad "reclamada" del patrón
    // compare-and-swap que evita un envío oficial duplicado por una carrera
    // (dos confirmaciones casi simultáneas — doble clic, dos pestañas del
    // Super Admin). Ver el índice único parcial abajo y
    // ejecutarProtocoloDespliegue() en copiloto.despliegue.js; mismo criterio
    // de CONCURRENCIA ya aplicado en plataforma.service.js#cerrarMantenimiento
    // (docs/DEFINITION-OF-DONE.md §5). Nunca se toca para tipo:'prueba': la
    // prueba se puede repetir a propósito mientras se ajusta la configuración
    // de correo antes del lanzamiento real.
    reclamado: { type: Boolean, default: false },
    ejecutadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // Desnormalizado, mismo motivo que RegistroAuditoria.usuarioNombre: el
    // registro debe seguir siendo legible aunque el usuario se desactive o
    // se elimine después.
    ejecutadoPorNombre: { type: String, required: true },
    // 'procesando' solo lo usa tipo:'prueba', que corre en el worker (ver
    // copiloto.despliegue.worker.js): es el estado entre que el worker
    // reclama el trabajo y termina el lote. El despliegue oficial no pasa por
    // aquí — se ejecuta de forma síncrona tras el botón de confirmación.
    estado: {
      type: String,
      enum: ['pendiente', 'procesando', 'exito', 'parcial', 'error', 'sin_destinatarios'],
      required: true,
      default: 'pendiente',
    },
    totalActivos: { type: Number, default: 0 },
    totalDestinatarios: { type: Number, default: 0 },
    sinCorreo: { type: Number, default: 0 },
    exitosos: { type: Number, default: 0 },
    fallidos: { type: Number, default: 0 },

    // ── Progreso durable del lote (solo tipo:'prueba') ────────────────────
    // `destinatarios` se CONGELA cuando el worker reclama el trabajo, y
    // `cursor` avanza tras cada envío. Juntos son lo que permite que un
    // reinicio del proceso a mitad del lote retome donde iba en vez de
    // reenviarle a todo el mundo: sin esto, "no perder trabajos" y "no
    // duplicar envíos" serían objetivos incompatibles.
    //
    // Se guarda el correo (no solo el id) por el mismo motivo que
    // EnvioNotificacion.emailDestino: es el dato con el que se envía, y
    // congelarlo hace que el lote sea reproducible aunque alguien edite su
    // perfil a mitad de la corrida.
    destinatarios: [{ _id: false, usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }, email: String }],
    cursor: { type: Number, default: 0 },
    // Marca de arranque del worker sobre este trabajo. Es el "lease": si un
    // trabajo lleva demasiado en 'procesando', es que el proceso murió a
    // mitad y otro tick puede retomarlo (ver RECLAMO_VENCIDO_MS).
    procesandoDesde: { type: Date },
    // Snapshot del correo que falló, no una referencia al Usuario: sigue
    // siendo útil para diagnosticar un rebote aunque esa persona cambie de
    // dirección o se desactive después (mismo criterio de snapshot que
    // Requerimiento.financiero.nombreAprobador).
    detalleFallos: [{ _id: false, email: String, error: String }],
    // Motivo de un fallo de PRE-FLIGHT (verificarConfiguracionEmail) o de
    // cualquier excepción antes de intentar el primer envío — distinto de un
    // fallo puntual de un destinatario (eso va en detalleFallos).
    error: { type: String, trim: true },
  },
  // A diferencia de RegistroAuditoria/RegistroPurgaAuditoria (write-once), un
  // registro 'oficial' SÍ muta: nace 'pendiente'/reclamado, y termina con el
  // resultado real del envío — de ahí updatedAt sí activo.
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
)

// Compare-and-swap: como mucho UN registro 'oficial' puede estar
// reclamado:true a la vez — es lo que impide que dos confirmaciones casi
// simultáneas disparen el correo oficial dos veces. partialFilterExpression
// deja fuera tipo:'prueba' (repetible a propósito) y reclamado:false (una
// corrida vieja liberada por fallo total, por "sin destinatarios" o por
// forzar:true no debe seguir bloqueando nada).
registroDespliegueSchema.index(
  { tipo: 1, reclamado: 1 },
  { unique: true, partialFilterExpression: { tipo: 'oficial', reclamado: true } }
)
registroDespliegueSchema.index({ tipo: 1, creadoEn: -1 })
// El worker filtra exactamente por esta forma (tipo + estado, ordenado por
// antigüedad) en cada tick; mismo criterio que el índice
// {estado, proximoIntentoEn} de EnvioNotificacion.
registroDespliegueSchema.index({ tipo: 1, estado: 1, creadoEn: 1 })

export default mongoose.model('RegistroDespliegue', registroDespliegueSchema)
