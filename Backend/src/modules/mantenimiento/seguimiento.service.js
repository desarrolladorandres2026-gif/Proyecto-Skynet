import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import Usuario from '../../models/Usuario.js'
import RegistroAuditoria from '../../models/RegistroAuditoria.js'
import { ErrorConflicto } from '../../utils/errores.js'
import { usuariosConPermiso } from './comun.js'

// Seguimiento en Tiempo Real (Fase 3.1) — coordinación, no vigilancia:
// "última actividad" y "sin actividad" se derivan de eventos que el técnico
// ya registró (RegistroAuditoria), nunca de un mecanismo nuevo de presencia
// continua. La ubicación reutiliza el último GPS de "Registrar Llegada", no
// se rastrea posición en vivo — ver diseño aprobado.
const ESTADOS_SEGUIMIENTO = ['asignada', 'en_progreso', 'en_espera']

export async function obtenerSeguimientoTecnicos(usuarioActor) {
  if (!usuarioActor.esSuperAdmin && !usuarioActor.permisos?.has('mantenimiento:ver_todas')) {
    throw new ErrorConflicto('No tienes acceso al seguimiento operativo')
  }

  const tecnicoIds = await usuariosConPermiso('mantenimiento:ejecutar')
  const [tecnicos, ordenesActivas] = await Promise.all([
    Usuario.find({ _id: { $in: tecnicoIds } }).select('nombre nombre_usuario'),
    Mantenimiento.find({ tecnico_asignado: { $in: tecnicoIds }, estado: { $in: ESTADOS_SEGUIMIENTO } })
      .populate('equipo')
      .sort({ prioridad: -1, fecha: 1 }),
  ])

  const ordenesPorTecnico = new Map()
  for (const ot of ordenesActivas) {
    const key = String(ot.tecnico_asignado)
    if (!ordenesPorTecnico.has(key)) ordenesPorTecnico.set(key, [])
    ordenesPorTecnico.get(key).push(ot)
  }

  const resultado = []
  for (const tecnico of tecnicos) {
    const ordenes = ordenesPorTecnico.get(String(tecnico._id)) || []
    const ultimaAuditoria = await RegistroAuditoria.findOne({ usuario: tecnico._id, modulo: 'mantenimiento' })
      .sort({ creadoEn: -1 })
      .select('creadoEn descripcion')

    const otPrincipal = ordenes[0] || null
    resultado.push({
      tecnico: { _id: tecnico._id, nombre: tecnico.nombre },
      disponible: ordenes.length === 0,
      ordenesActivas: ordenes.length,
      ordenActual: otPrincipal
        ? {
            _id: otPrincipal._id,
            equipo: otPrincipal.equipo?.numero_inventario,
            estado: otPrincipal.estado,
            prioridad: otPrincipal.prioridad,
            pasoOperativo: otPrincipal.pasoOperativo,
            motivo_espera: otPrincipal.motivo_espera,
            ultimaUbicacion: otPrincipal.llegada?.ubicacion,
          }
        : null,
      ultimaActividadEn: ultimaAuditoria?.creadoEn || null,
      ultimaActividadDescripcion: ultimaAuditoria?.descripcion || null,
    })
  }

  return resultado
}
