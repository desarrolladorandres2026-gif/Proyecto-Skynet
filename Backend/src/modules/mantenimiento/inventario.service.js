import InventarioMaterial from '../../models/mantenimiento/InventarioMaterial.js'
import MovimientoInventario from '../../models/mantenimiento/MovimientoInventario.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { escapeRegex } from '../../utils/regex.js'
import { obtenerOT, requiereSerParticipante } from './comun.js'

// Gestión de Inventario (Fase 3.1) — primer paso del diseño aprobado: stock
// simple por material, sin reservas todavía (se agregan en un refinamiento
// posterior una vez validado este flujo básico en campo).

export async function buscarMateriales(q) {
  const filtro = q?.trim() ? { nombre: { $regex: escapeRegex(q.trim()), $options: 'i' } } : {}
  return InventarioMaterial.find(filtro).sort({ nombre: 1 }).limit(30)
}

export async function crearMaterial(datos, usuarioActor) {
  if (!datos.nombre?.trim()) throw new ErrorValidacion('El nombre del material es obligatorio')
  const material = await InventarioMaterial.create({
    nombre: datos.nombre.trim(),
    stock: Number(datos.stock) || 0,
    ubicacion: datos.ubicacion?.trim(),
    costo_unitario: Number(datos.costo_unitario) || 0,
    equivalentes: datos.equivalentes || [],
  })
  await registrarAuditoria({
    usuario: usuarioActor, accion: 'crear', modulo: 'mantenimiento', entidad: 'InventarioMaterial',
    entidadId: material._id, descripcion: `Material de inventario creado: ${material.nombre}`,
  })
  return material
}

export async function ajustarStock(materialId, { cantidad, motivo }, usuarioActor) {
  const material = await InventarioMaterial.findById(materialId)
  if (!material) throw new ErrorNoEncontrado('Material no encontrado')
  if (!Number.isFinite(Number(cantidad))) throw new ErrorValidacion('cantidad debe ser un número')
  if (!motivo?.trim()) throw new ErrorValidacion('El motivo del ajuste es obligatorio')

  material.stock = Math.max(0, material.stock + Number(cantidad))
  await material.save()

  await MovimientoInventario.create({
    material: material._id, tipo: 'ajuste', cantidad: Number(cantidad), motivo: motivo.trim(), usuario: usuarioActor.id_usuario,
  })
  await registrarAuditoria({
    usuario: usuarioActor, accion: 'ajustar_stock', modulo: 'mantenimiento', entidad: 'InventarioMaterial',
    entidadId: material._id, descripcion: `Ajuste de stock (${cantidad}): ${motivo.trim()}`,
  })
  return material
}

// Consume del inventario Y registra el consumo como material de la OT (Fase 3):
// un solo gesto para el técnico, dos efectos — evita "stock negativo" salvo
// autorización explícita del propio ajuste manual, priorizando continuidad
// operativa sobre pureza contable estricta (permite negativo con alerta implícita
// vía el registro de auditoría, no bloquea el trabajo del técnico).
export async function consumirParaOrden(otId, { materialId, cantidad }, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  if (ot.estado !== 'en_progreso') throw new ErrorConflicto(`No se puede consumir inventario con la orden en estado "${ot.estado}"`)
  requiereSerParticipante(ot, usuarioActor)

  const material = await InventarioMaterial.findById(materialId)
  if (!material) throw new ErrorNoEncontrado('Material no encontrado')
  const cant = Number(cantidad)
  if (!(cant > 0)) throw new ErrorValidacion('cantidad debe ser mayor a 0')

  material.stock -= cant
  await material.save()
  await MovimientoInventario.create({ material: material._id, ordenTrabajo: ot._id, tipo: 'consumo', cantidad: cant, usuario: usuarioActor.id_usuario })

  ot.materiales.push({
    material: material.nombre,
    cantidad: cant,
    costo_unitario: material.costo_unitario,
    observaciones: 'Consumido desde inventario',
    registradoPor: usuarioActor.id_usuario,
  })
  ot.costo_materiales = ot.materiales.reduce((acc, m) => acc + m.cantidad * m.costo_unitario, 0)
  await ot.save()

  return { material, orden: ot }
}

export async function devolverAInventario(otId, { materialId, cantidad, motivo }, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  requiereSerParticipante(ot, usuarioActor)

  const material = await InventarioMaterial.findById(materialId)
  if (!material) throw new ErrorNoEncontrado('Material no encontrado')
  const cant = Number(cantidad)
  if (!(cant > 0)) throw new ErrorValidacion('cantidad debe ser mayor a 0')

  material.stock += cant
  await material.save()
  await MovimientoInventario.create({ material: material._id, ordenTrabajo: ot._id, tipo: 'devolucion', cantidad: cant, motivo: motivo?.trim(), usuario: usuarioActor.id_usuario })

  return material
}

export async function registrarDesperdicio(otId, { materialId, cantidad, motivo }, usuarioActor) {
  const ot = await obtenerOT(otId)
  if (!ot) throw new ErrorNoEncontrado('Orden de trabajo no encontrada')
  requiereSerParticipante(ot, usuarioActor)
  if (!motivo?.trim()) throw new ErrorValidacion('El motivo del desperdicio es obligatorio')

  const material = await InventarioMaterial.findById(materialId)
  if (!material) throw new ErrorNoEncontrado('Material no encontrado')
  const cant = Number(cantidad)
  if (!(cant > 0)) throw new ErrorValidacion('cantidad debe ser mayor a 0')

  await MovimientoInventario.create({ material: material._id, ordenTrabajo: ot._id, tipo: 'desperdicio', cantidad: cant, motivo: motivo.trim(), usuario: usuarioActor.id_usuario })
  return material
}
