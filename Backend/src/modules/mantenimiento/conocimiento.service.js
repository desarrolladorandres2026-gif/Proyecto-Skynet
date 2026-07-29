import ArticuloConocimiento from '../../models/mantenimiento/ArticuloConocimiento.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { obtenerOT } from './comun.js'

// Base de Conocimiento (Fase 3.1): nace de una OT cerrada, no automático a
// propósito (forzarlo en toda OT generaría artículos de baja calidad).

export async function convertirDesdeOT(otId, { palabrasClave, nivelComplejidad }, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (ot.estado !== 'cerrada') throw new ErrorConflicto('Solo se puede generar un artículo desde una orden cerrada')
  if (!ot.diagnostico || !ot.descripcion_solucion) {
    throw new ErrorValidacion('La orden debe tener diagnóstico y descripción de la solución registrados')
  }

  const articulo = await ArticuloConocimiento.create({
    problema: ot.descripcion,
    sintomas: ot.diagnostico,
    diagnostico: ot.causa_raiz,
    solucion: ot.descripcion_solucion,
    evidencias: (ot.evidencias || []).filter((e) => e.tipo === 'foto' || e.tipo === 'video').map((e) => ({ archivo: e.archivo, comentario: e.comentario })),
    equiposRelacionados: ot.equipo?.tipo?.nombre ? [ot.equipo.tipo.nombre] : [],
    palabrasClave: (palabrasClave || '').split(',').map((p) => p.trim()).filter(Boolean),
    nivelComplejidad: ['baja', 'media', 'alta'].includes(nivelComplejidad) ? nivelComplejidad : 'media',
    ordenOrigen: ot._id,
    creadoPor: usuarioActor.id_usuario,
  })

  await registrarAuditoria({
    usuario: usuarioActor, accion: 'crear', modulo: 'mantenimiento', entidad: 'ArticuloConocimiento',
    entidadId: articulo._id, descripcion: `Artículo de conocimiento creado desde OT ${ot._id}`,
  })

  return articulo
}

export async function buscar({ q, equipoTipo } = {}) {
  const filtro = { publicado: true }
  if (equipoTipo) filtro.equiposRelacionados = equipoTipo
  if (q?.trim()) filtro.$text = { $search: q.trim() }
  return ArticuloConocimiento.find(filtro).sort({ usosCount: -1 }).limit(20)
}

export async function vincular(articuloId, otId, usuarioActor) {
  const articulo = await ArticuloConocimiento.findById(articuloId)
  if (!articulo) throw new ErrorNoEncontrado('Artículo no encontrado')
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')

  articulo.usosCount += 1
  await articulo.save()

  await registrarAuditoria({
    usuario: usuarioActor, accion: 'vincular', modulo: 'mantenimiento', entidad: 'ArticuloConocimiento',
    entidadId: articulo._id, descripcion: `Artículo vinculado desde OT ${ot._id}`,
  })

  return articulo
}

export async function curar(articuloId, { publicado }, usuarioActor) {
  const articulo = await ArticuloConocimiento.findById(articuloId)
  if (!articulo) throw new ErrorNoEncontrado('Artículo no encontrado')

  articulo.publicado = Boolean(publicado)
  await articulo.save()

  await registrarAuditoria({
    usuario: usuarioActor, accion: 'curar', modulo: 'mantenimiento', entidad: 'ArticuloConocimiento',
    entidadId: articulo._id, descripcion: `Artículo ${publicado ? 'publicado' : 'despublicado'}`,
  })

  return articulo
}
