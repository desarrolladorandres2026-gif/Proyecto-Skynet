import { env } from '../../config/env.js'

// Dos vistas del mismo estado, deliberadamente distintas.
//
// `aEstadoPublico` lo consume GET /api/plataforma/estado, que NO exige sesión
// (la pantalla de login tiene que poder preguntarlo antes de que exista un
// usuario). Por eso expone lo mínimo que el usuario necesita para entender
// qué pasa y cuándo vuelve, y NADA más: ni quién lo programó, ni ids
// internos, ni las banderas de notificación. Un endpoint público es
// superficie de ataque; que sea aburrido es la característica.
export function aEstadoPublico(doc) {
  return {
    status: doc.status,
    enabled: doc.enabled === true,
    scheduledStart: doc.scheduledStart,
    scheduledEnd: doc.scheduledEnd,
    reason: doc.reason || '',
    message: doc.message || '',
    // Instante del servidor: el frontend lo usa para calcular la cuenta
    // regresiva contra el RELOJ DEL SERVIDOR y no contra el del dispositivo.
    // Un celular con la hora corrida 20 minutos (mucho más común de lo que
    // parece en tablets de operación) mostraría un contador sin relación con
    // la realidad; con este ancla, el desfase se corrige solo.
    ahora: new Date(),
    // Antelación EFECTIVA del aviso previo, en minutos. Viaja aquí para que el
    // frontend no tenga que conocer el número: el banner se vuelve obligatorio
    // en el mismo umbral en que este backend manda el push/correo de "entra en
    // mantenimiento en N minutos" (ver evaluarTransiciones).
    //
    // Es el valor EFECTIVO, no el valor por defecto: si en el VPS se define
    // PLATAFORMA_AVISO_PREVIO_MIN=30, el banner sigue al backend solo. Esa es
    // justamente la divergencia que ninguna prueba podría detectar, porque
    // vive en un .env que no está en el repositorio.
    //
    // No es información sensible: dice cuánta antelación se da al avisar, algo
    // que el usuario ve igualmente en la propia notificación.
    avisoPrevioMin: env.PLATAFORMA_AVISO_PREVIO_MIN,
  }
}

// Vista administrativa: todo lo anterior más la trazabilidad. Solo la ven
// quienes pasan requierePermiso('plataforma:gestionar') o son Super Admin.
export function aEstadoAdmin(doc) {
  return {
    ...aEstadoPublico(doc),
    mantenimientoId: doc.mantenimientoId,
    createdBy: doc.createdBy,
    createdByNombre: doc.createdByNombre || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    iniciadoEn: doc.iniciadoEn,
    finalizadoEn: doc.finalizadoEn,
    avisoPrevioEnviado: doc.avisoPrevioEnviado === true,
  }
}

export function aEventoPublico(evento) {
  return {
    id: evento._id,
    mantenimientoId: evento.mantenimientoId,
    tipo: evento.tipo,
    usuarioNombre: evento.usuarioNombre || 'Sistema',
    reason: evento.reason || '',
    message: evento.message || '',
    scheduledStart: evento.scheduledStart,
    scheduledEnd: evento.scheduledEnd,
    duracionMinutos: evento.duracionMinutos,
    creadoEn: evento.creadoEn,
  }
}
