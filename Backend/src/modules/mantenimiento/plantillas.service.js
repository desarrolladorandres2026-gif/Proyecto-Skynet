import PlantillaMantenimiento from '../../models/mantenimiento/PlantillaMantenimiento.js'
import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { obtenerOT, requiereSerParticipante } from './comun.js'

// Checklists Inteligentes + Plantillas de Mantenimiento (Fase 3.1): mismo
// catálogo — una plantilla es un checklist con contexto adicional (ver
// diseño aprobado, ambos puntos comparten `mantenimiento:gestionar_plantillas`).

export async function crearPlantilla(datos, usuarioActor) {
  if (!datos.nombre?.trim()) throw new ErrorValidacion('El nombre de la plantilla es obligatorio')
  if (!datos.checklist?.length) throw new ErrorValidacion('La plantilla debe tener al menos un ítem de checklist')

  const plantilla = await PlantillaMantenimiento.create({ ...datos, creadoPor: usuarioActor.id_usuario })
  await registrarAuditoria({
    usuario: usuarioActor, accion: 'crear', modulo: 'mantenimiento', entidad: 'PlantillaMantenimiento',
    entidadId: plantilla._id, descripcion: `Plantilla creada: ${plantilla.nombre}`,
  })
  return plantilla
}

export async function listarPlantillas({ tipoEquipo, soloActivas = true } = {}) {
  const filtro = {}
  if (soloActivas) filtro.activa = true
  if (tipoEquipo) filtro.$or = [{ tiposEquipoCompatibles: tipoEquipo }, { tiposEquipoCompatibles: { $size: 0 } }]
  return PlantillaMantenimiento.find(filtro).sort({ nombre: 1 })
}

// Campos editables del schema (ver models/mantenimiento/PlantillaMantenimiento.js).
// Explícitos en vez de Object.assign(plantilla, datos) con el body crudo: así
// un campo ajeno al formulario (p. ej. `creadoPor`) nunca puede sobreescribirse
// vía mass assignment.
const CAMPOS_EDITABLES = [
  'nombre',
  'tipoMantenimiento',
  'tiposEquipoCompatibles',
  'checklist',
  'herramientasSugeridas',
  'materialesSugeridos',
  'tiempoEstimadoMinutos',
  'procedimiento',
  'riesgos',
  'documentacion',
  'recomendaciones',
  'activa',
]

export async function actualizarPlantilla(id, datos, usuarioActor) {
  const plantilla = await PlantillaMantenimiento.findById(id)
  if (!plantilla) throw new ErrorNoEncontrado('Plantilla no encontrada')
  for (const campo of CAMPOS_EDITABLES) {
    if (datos[campo] !== undefined) plantilla[campo] = datos[campo]
  }
  await plantilla.save()
  await registrarAuditoria({
    usuario: usuarioActor, accion: 'actualizar', modulo: 'mantenimiento', entidad: 'PlantillaMantenimiento',
    entidadId: plantilla._id, descripcion: `Plantilla actualizada: ${plantilla.nombre}`,
  })
  return plantilla
}

export async function desactivarPlantilla(id, usuarioActor) {
  const plantilla = await PlantillaMantenimiento.findById(id)
  if (!plantilla) throw new ErrorNoEncontrado('Plantilla no encontrada')

  // Mismo principio defensivo que los catálogos de tipo/marca de equipo: no
  // desactivar una plantilla que una OT activa está usando ahora mismo.
  const enUso = await Mantenimiento.exists({
    'checklist.plantilla': plantilla._id,
    estado: { $in: ['reportado', 'programada', 'asignada', 'en_progreso', 'en_espera', 'resuelta', 'pendiente_aprobacion'] },
  })
  if (enUso) throw new ErrorConflicto('No se puede desactivar: hay una orden de trabajo activa usando esta plantilla')

  plantilla.activa = false
  await plantilla.save()
  await registrarAuditoria({
    usuario: usuarioActor, accion: 'desactivar', modulo: 'mantenimiento', entidad: 'PlantillaMantenimiento',
    entidadId: plantilla._id, descripcion: `Plantilla desactivada: ${plantilla.nombre}`,
  })
  return plantilla
}

export async function aplicarPlantilla(otId, plantillaId, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  requiereSerParticipante(ot, usuarioActor)
  if (ot.checklist?.plantilla) throw new ErrorConflicto('Esta orden ya tiene una plantilla aplicada')

  const plantilla = await PlantillaMantenimiento.findOne({ _id: plantillaId, activa: true })
  if (!plantilla) throw new ErrorNoEncontrado('Plantilla no encontrada o inactiva')

  const tipoEquipo = ot.equipo?.tipo?.nombre
  if (plantilla.tiposEquipoCompatibles.length && tipoEquipo && !plantilla.tiposEquipoCompatibles.includes(tipoEquipo)) {
    throw new ErrorValidacion(`Esta plantilla no es compatible con el tipo de equipo "${tipoEquipo}"`)
  }

  ot.checklist = {
    plantilla: plantilla._id,
    plantillaNombre: plantilla.nombre,
    items: plantilla.checklist.map((item) => ({ texto: item.texto, obligatorioParaCierre: item.obligatorioParaCierre })),
  }
  await ot.save()

  await registrarAuditoria({
    usuario: usuarioActor, accion: 'aplicar_plantilla', modulo: 'mantenimiento', entidad: 'OrdenTrabajo',
    entidadId: ot._id, descripcion: `Plantilla aplicada: ${plantilla.nombre}`,
  })

  return ot
}

export async function marcarItemChecklist(otId, itemId, { completado, omitido, motivoOmision, comentario }, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  requiereSerParticipante(ot, usuarioActor)

  const item = ot.checklist?.items?.id(itemId)
  if (!item) throw new ErrorNoEncontrado('Ítem de checklist no encontrado')
  if (omitido && !motivoOmision?.trim()) throw new ErrorValidacion('Omitir un ítem exige motivo')

  item.completado = Boolean(completado)
  item.omitido = Boolean(omitido)
  item.motivoOmision = omitido ? motivoOmision?.trim() : undefined
  item.comentario = comentario?.trim()
  item.completadoEn = completado || omitido ? new Date() : undefined
  await ot.save()

  return ot
}
