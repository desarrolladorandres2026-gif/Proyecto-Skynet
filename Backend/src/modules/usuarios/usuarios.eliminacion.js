import mongoose from 'mongoose'

import Notificacion from '../../models/Notificacion.js'
import EnvioNotificacion from '../../models/EnvioNotificacion.js'
import PushSubscription from '../../models/PushSubscription.js'
import EmailCuenta from '../../models/EmailCuenta.js'
import EmailConexionSolicitud from '../../models/EmailConexionSolicitud.js'
import PreferenciaIA from '../../models/PreferenciaIA.js'
import PreferenciaNotificacion from '../../models/PreferenciaNotificacion.js'
import MemoriaCopiloto from '../../models/MemoriaCopiloto.js'
import ConversacionCopiloto from '../../models/ConversacionCopiloto.js'
import PasswordResetToken from '../../models/PasswordResetToken.js'
import Usuario from '../../models/Usuario.js'

import RegistroAuditoria from '../../models/RegistroAuditoria.js'
import RegistroDespliegue from '../../models/RegistroDespliegue.js'
import Requerimiento from '../../models/Requerimiento.js'
import ReporteDano from '../../models/ReporteDano.js'
import Ausencia from '../../models/Ausencia.js'
import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import Hallazgo from '../../models/mantenimiento/Hallazgo.js'
import BitacoraEntrada from '../../models/mantenimiento/BitacoraEntrada.js'
import ArticuloConocimiento from '../../models/mantenimiento/ArticuloConocimiento.js'
import CampanaSig from '../../models/CampanaSig.js'
import ProgramacionSig from '../../models/ProgramacionSig.js'
import ConfiguracionSig from '../../models/ConfiguracionSig.js'
import PreguntaSig from '../../models/PreguntaSig.js'
import CapacitacionTemaSig from '../../models/CapacitacionTemaSig.js'
import PlanRefuerzoSig from '../../models/PlanRefuerzoSig.js'
import RespuestaSig from '../../models/RespuestaSig.js'
import EstadoPlataforma from '../../models/EstadoPlataforma.js'
import EventoPlataforma from '../../models/EventoPlataforma.js'

// ── Grupo A ──────────────────────────────────────────────────────────────
// Estado personal/de sesión del usuario: sin valor institucional una vez que
// la cuenta se elimina de verdad (nadie más necesita leer las preferencias
// de notificación o el historial de chat con el copiloto de alguien que ya
// no está). Se borra en cascada, dentro de la misma transacción que borra el
// propio Usuario — ver eliminarUsuarioDefinitivamente().
const COLECCIONES_GRUPO_A = [
  { modelo: Notificacion, campo: 'usuario' },
  { modelo: EnvioNotificacion, campo: 'usuario' },
  { modelo: PushSubscription, campo: 'usuario' },
  { modelo: EmailCuenta, campo: 'usuario' },
  { modelo: EmailConexionSolicitud, campo: 'usuario' },
  { modelo: PreferenciaIA, campo: 'usuario' },
  { modelo: PreferenciaNotificacion, campo: 'usuario' },
  { modelo: MemoriaCopiloto, campo: 'usuario' },
  { modelo: ConversacionCopiloto, campo: 'usuario' },
  { modelo: PasswordResetToken, campo: 'usuario' },
]

// ── Grupo B ──────────────────────────────────────────────────────────────
// Historial institucional: el ERP es del Terminal, no del empleado. Si el
// usuario aparece en AUNQUE SEA UN documento de aquí (como solicitante,
// aprobador, técnico asignado, autor de un mensaje, etc.), el borrado físico
// se rechaza — solo puede desactivarse (Usuario.estado='inactivo'). Cada
// entrada agrupa TODOS los campos de un mismo modelo en un solo `$or`, para
// que el resultado sea "cuántos documentos de este modelo lo mencionan en
// algún lado", no un conteo por campo.
//
// Construida revisando uno por uno los ~25 campos con `ref:'Usuario'` que
// existen hoy en Backend/src/models/ (ver auditoría de producción
// 2026-08-22, plan de la Fase 2, sección 1). Si se agrega un campo nuevo con
// ref:'Usuario' a cualquier modelo, debe añadirse aquí también — no hay
// forma de detectarlo automáticamente sin inspeccionar schemas en runtime,
// y hacerlo así sería más frágil que esta lista explícita y revisada.
const COLECCIONES_GRUPO_B = [
  { modelo: RegistroAuditoria, etiqueta: 'Registros de auditoría', campos: ['usuario'] },
  { modelo: RegistroDespliegue, etiqueta: 'Registros de despliegue', campos: ['ejecutadoPor'] },
  {
    modelo: Requerimiento,
    etiqueta: 'Requerimientos',
    campos: ['solicitante', 'financiero.aprobadoPor', 'financiero.historialEdiciones.editadoPor', 'bodega.revisadoPor', 'itemsCompra.controlRecibido.marcadoPor'],
  },
  {
    modelo: ReporteDano,
    etiqueta: 'Reportes de daño',
    campos: ['reportadoPor', 'asignadoA', 'asignadoPor', 'atendidoPor', 'historial.por'],
  },
  { modelo: Ausencia, etiqueta: 'Ausencias', campos: ['solicitante', 'decision.revisadoPor'] },
  {
    modelo: Mantenimiento,
    etiqueta: 'Órdenes de trabajo de mantenimiento',
    campos: [
      'reportadoPor', 'tecnico_asignado', 'tecnicos_apoyo', 'aprobacion.aprobadoPor',
      'materiales.registradoPor', 'herramientas.registradoPor', 'horas.tecnico', 'evidencias.subidoPor',
      'solicitudesRepuestos.solicitadoPor', 'solicitudesRepuestos.resueltoPor',
      'invitacionesApoyo.tecnico', 'invitacionesApoyo.invitadoPor', 'mensajes.autor',
    ],
  },
  { modelo: Hallazgo, etiqueta: 'Hallazgos de mantenimiento', campos: ['responsable', 'riesgoAceptado.aceptadoPor', 'registradoPor'] },
  { modelo: BitacoraEntrada, etiqueta: 'Entradas de bitácora de mantenimiento', campos: ['usuario'] },
  { modelo: ArticuloConocimiento, etiqueta: 'Artículos de la base de conocimiento', campos: ['creadoPor'] },
  { modelo: CampanaSig, etiqueta: 'Campañas SIG', campos: ['creadoPor'] },
  { modelo: ProgramacionSig, etiqueta: 'Programaciones SIG', campos: ['creadoPor', 'cancelacion.canceladaPor'] },
  { modelo: ConfiguracionSig, etiqueta: 'Configuración SIG', campos: ['actualizadoPor'] },
  { modelo: PreguntaSig, etiqueta: 'Preguntas del banco SIG', campos: ['creadoPor', 'actualizadoPor'] },
  { modelo: CapacitacionTemaSig, etiqueta: 'Capacitación SIG', campos: ['usuario', 'responsable'] },
  { modelo: PlanRefuerzoSig, etiqueta: 'Planes de refuerzo SIG', campos: ['usuario', 'responsable'] },
  { modelo: RespuestaSig, etiqueta: 'Respuestas SIG', campos: ['usuario'] },
  { modelo: EstadoPlataforma, etiqueta: 'Historial de mantenimiento de plataforma', campos: ['createdBy'] },
  { modelo: EventoPlataforma, etiqueta: 'Eventos de plataforma', campos: ['usuario'] },
]

function filtroPorCampos(usuarioId, campos) {
  if (campos.length === 1) return { [campos[0]]: usuarioId }
  return { $or: campos.map((campo) => ({ [campo]: usuarioId })) }
}

// Cuenta, colección por colección, si el usuario aparece en algún documento
// institucional. Se ejecuta ANTES de decidir si el hard-delete procede — ver
// eliminarUsuario() en usuarios.controller.js.
export async function contarReferenciasHistoricas(usuarioId) {
  const conteos = await Promise.all(
    COLECCIONES_GRUPO_B.map(async ({ modelo, etiqueta, campos }) => ({
      etiqueta,
      cantidad: await modelo.countDocuments(filtroPorCampos(usuarioId, campos)),
    }))
  )
  const detalle = conteos.filter((c) => c.cantidad > 0)
  const total = detalle.reduce((suma, c) => suma + c.cantidad, 0)
  return { total, detalle }
}

// Hard-delete real: SOLO se debe llamar después de confirmar con
// contarReferenciasHistoricas() que el total es 0 — esta función no vuelve a
// verificarlo por su cuenta (evitaría hacerlo dos veces innecesariamente),
// así que quien la llama es responsable de ese orden.
//
// Todo dentro de una transacción (Atlas y el replica set de pruebas la
// soportan): si el proceso se interrumpe a mitad de camino, no debe quedar
// un Usuario borrado con su PushSubscription/EmailCuenta todavía viva, ni al
// revés. A diferencia de notificar() (ver notificaciones.service.js), que es
// deliberadamente best-effort, aquí la intención es "todo o nada" — un
// fallo parcial dejaría el sistema en un estado ambiguo sobre si la persona
// fue borrada o no.
export async function eliminarUsuarioDefinitivamente(usuarioId) {
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      for (const { modelo, campo } of COLECCIONES_GRUPO_A) {
        await modelo.deleteMany({ [campo]: usuarioId }).session(session)
      }
      await Usuario.findByIdAndDelete(usuarioId).session(session)
    })
  } finally {
    await session.endSession()
  }
}
