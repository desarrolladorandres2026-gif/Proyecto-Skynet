import Requerimiento from '../../models/Requerimiento.js'
import Usuario from '../../models/Usuario.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { reautenticar } from '../../utils/reautenticacion.js'
import { vincularRequerimiento } from '../danos/danos.service.js'
import { usuariosConPermiso } from '../mantenimiento/comun.js'
import { notificarUsuarios as _notificarUsuarios } from '../../utils/sendPush.js'
import { obtenerRequerimiento, puedeVer, auditar } from './comun.js'

const ESTADOS_BODEGA = ['pendiente', 'aprobada', 'no_aprobada']

// Categoría fija para todo este módulo (ver notificaciones.catalogo.js).
// Requerimientos es el primer flujo conectado end-to-end al motor nuevo de
// notificaciones (antes no avisaba a nadie en ningún paso) — sirve como caso
// real para las pruebas de integración del sistema.
const notificarUsuarios = (userIds, payload) => _notificarUsuarios(userIds, payload, 'requerimientos')

function validarItemsCompra(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ErrorValidacion('Debes agregar al menos un producto')
  }
  for (const item of items) {
    if (!item?.descripcionProducto?.trim()) {
      throw new ErrorValidacion('La descripción del producto es obligatoria en cada ítem')
    }
    if (!item.fechaSolicitud || Number.isNaN(new Date(item.fechaSolicitud).getTime())) {
      throw new ErrorValidacion('La fecha de la solicitud es obligatoria en cada ítem')
    }
    if (!item.cantidad || Number(item.cantidad) < 1) {
      throw new ErrorValidacion('La cantidad debe ser mayor a 0 en cada ítem')
    }
  }
}

function normalizarItemsCompra(items) {
  return items.map((item) => ({
    fechaSolicitud: new Date(item.fechaSolicitud),
    descripcionProducto: String(item.descripcionProducto).trim(),
    cantidad: Number(item.cantidad),
    destino: item.destino ? String(item.destino).trim() : '',
  }))
}

function validarDetalleServicio(detalle) {
  if (!detalle?.descripcionTipoServicio?.trim()) {
    throw new ErrorValidacion('La descripción del tipo de servicio es obligatoria')
  }
}

function normalizarDetalleServicio(detalle) {
  return {
    descripcionTipoServicio: String(detalle.descripcionTipoServicio).trim(),
    competencia: detalle.competencia ? String(detalle.competencia).trim() : '',
    laboresADesarrollar: detalle.laboresADesarrollar ? String(detalle.laboresADesarrollar).trim() : '',
    requisitosSST: detalle.requisitosSST ? String(detalle.requisitosSST).trim() : '',
  }
}

export async function crearRequerimiento(datos, usuarioActor) {
  const { tipo, cargo, areaOProceso, itemsCompra, detalleServicio, origenDano } = datos || {}
  if (!['compra', 'servicio'].includes(tipo)) {
    throw new ErrorValidacion('tipo debe ser "compra" o "servicio"')
  }

  let cargoSolicitante = typeof cargo === 'string' ? cargo.trim() : ''
  if (!cargoSolicitante) {
    const usuario = await Usuario.findById(usuarioActor.id_usuario).select('cargo')
    cargoSolicitante = usuario?.cargo || ''
  }
  if (!cargoSolicitante) {
    throw new ErrorValidacion('El cargo del solicitante es obligatorio')
  }

  const datosCreacion = {
    tipo,
    solicitante: usuarioActor.id_usuario,
    cargoSolicitante,
    areaOProceso: areaOProceso ? String(areaOProceso).trim() : '',
    estado: 'pendiente_financiero',
  }

  if (tipo === 'compra') {
    validarItemsCompra(itemsCompra)
    datosCreacion.itemsCompra = normalizarItemsCompra(itemsCompra)
    datosCreacion.versionOriginal = { areaOProceso: datosCreacion.areaOProceso, itemsCompra: datosCreacion.itemsCompra }
  } else {
    validarDetalleServicio(detalleServicio)
    datosCreacion.detalleServicio = normalizarDetalleServicio(detalleServicio)
    datosCreacion.versionOriginal = { areaOProceso: datosCreacion.areaOProceso, detalleServicio: datosCreacion.detalleServicio }
  }

  if (origenDano) datosCreacion.origenDano = origenDano

  const doc = await Requerimiento.create(datosCreacion)
  await auditar(usuarioActor, 'crear', doc, `Creó un requerimiento de ${tipo}`)

  // Cierra el vínculo del otro lado (ReporteDano.requerimientos + su
  // historial). Mejor esfuerzo: si el daño ya no existe, el requerimiento es
  // válido igual — perder la referencia cruzada no justifica rechazarlo.
  if (origenDano) {
    try {
      await vincularRequerimiento(origenDano, doc, usuarioActor)
    } catch (err) {
      console.error('No se pudo vincular el requerimiento al reporte de daño:', String(origenDano), err.message)
    }
  }

  const financieros = await usuariosConPermiso('requerimientos:aprobar_financiero')
  notificarUsuarios(financieros, {
    title: 'Nuevo requerimiento pendiente',
    body: `${usuarioActor.nombre_usuario} solicitó un requerimiento de ${tipo}`,
    url: `/requerimientos/${doc._id}`,
  }).catch((err) => console.error('Error notificando nuevo requerimiento:', err.message))

  return obtenerRequerimiento(doc._id)
}

function snapshotEditable(doc) {
  return {
    areaOProceso: doc.areaOProceso,
    itemsCompra: doc.tipo === 'compra' ? doc.itemsCompra : undefined,
    detalleServicio: doc.tipo === 'servicio' ? doc.detalleServicio : undefined,
    analisisTecnico: doc.financiero?.analisisTecnico,
  }
}

// Compartido entre editarComoFinanciero (edición sola) y aprobarComoFinanciero
// (edición final justo al aprobar) — ambas guardan el mismo tipo de snapshot
// en financiero.historialEdiciones. Devuelve `true` si de verdad hubo algún
// cambio en el body (para que editar sin cambios sea un 400, no un no-op).
function aplicarEdicionFinanciero(doc, cambios, usuarioActor) {
  const huboCambios =
    cambios.areaOProceso !== undefined ||
    cambios.itemsCompra !== undefined ||
    cambios.detalleServicio !== undefined ||
    cambios.analisisTecnico !== undefined
  if (!huboCambios) return false

  const snapshotAntes = snapshotEditable(doc)

  if (cambios.areaOProceso !== undefined) doc.areaOProceso = String(cambios.areaOProceso).trim()
  if (doc.tipo === 'compra' && cambios.itemsCompra !== undefined) {
    validarItemsCompra(cambios.itemsCompra)
    doc.itemsCompra = normalizarItemsCompra(cambios.itemsCompra)
  }
  if (doc.tipo === 'servicio' && cambios.detalleServicio !== undefined) {
    validarDetalleServicio(cambios.detalleServicio)
    doc.detalleServicio = normalizarDetalleServicio(cambios.detalleServicio)
  }
  if (cambios.analisisTecnico !== undefined) {
    doc.financiero.analisisTecnico = String(cambios.analisisTecnico).trim()
  }

  doc.financiero.historialEdiciones.push({
    editadoPor: usuarioActor.id_usuario,
    nombreEditor: usuarioActor.nombre_usuario,
    snapshotAntes,
    comentario: cambios.comentario ? String(cambios.comentario).trim() : '',
  })
  return true
}

async function obtenerParaMutar(id) {
  const doc = await Requerimiento.findById(id)
  if (!doc) throw new ErrorNoEncontrado('Requerimiento no encontrado')
  return doc
}

export async function editarComoFinanciero(id, cambios, usuarioActor) {
  const doc = await obtenerParaMutar(id)
  if (doc.estado !== 'pendiente_financiero') {
    throw new ErrorConflicto(`No se puede editar un requerimiento en estado "${doc.estado}"`)
  }
  const huboCambios = aplicarEdicionFinanciero(doc, cambios || {}, usuarioActor)
  if (!huboCambios) throw new ErrorValidacion('No se recibió ningún cambio para guardar')

  await doc.save()
  await auditar(usuarioActor, 'editar_financiero', doc, 'Financiero editó el requerimiento')
  return obtenerRequerimiento(doc._id)
}

export async function aprobarComoFinanciero(id, body, usuarioActor) {
  const doc = await obtenerParaMutar(id)
  if (doc.estado !== 'pendiente_financiero') {
    throw new ErrorConflicto(`No se puede aprobar un requerimiento en estado "${doc.estado}"`)
  }

  // La reautenticación (la "firma") va PRIMERO, antes de tocar el documento:
  // si falla, no debe quedar ningún efecto secundario a medias.
  await reautenticar(usuarioActor.id_usuario, body?.password)

  aplicarEdicionFinanciero(doc, body || {}, usuarioActor)

  const aprobador = await Usuario.findById(usuarioActor.id_usuario).select('nombre cargo')

  doc.financiero.aprobadoPor = usuarioActor.id_usuario
  doc.financiero.nombreAprobador = aprobador?.nombre || usuarioActor.nombre_usuario
  doc.financiero.cargoAprobador = aprobador?.cargo || ''
  doc.financiero.fechaDecision = new Date()
  doc.financiero.motivoRechazo = undefined
  doc.estado = 'pendiente_bodega'
  doc.bodega.estado = 'pendiente'

  await doc.save()
  await auditar(usuarioActor, 'aprobar_financiero', doc, 'Financiero aprobó el requerimiento (firma con reautenticación)')

  const bodega = await usuariosConPermiso('requerimientos:gestionar_bodega')
  notificarUsuarios(bodega, {
    title: 'Requerimiento aprobado por Financiero',
    body: `Pendiente de gestionar en Bodega (${doc.tipo})`,
    url: `/requerimientos/${doc._id}`,
  }).catch((err) => console.error('Error notificando aprobación financiera:', err.message))

  return obtenerRequerimiento(doc._id)
}

export async function rechazarComoFinanciero(id, { motivoRechazo } = {}, usuarioActor) {
  const doc = await obtenerParaMutar(id)
  if (doc.estado !== 'pendiente_financiero') {
    throw new ErrorConflicto(`No se puede rechazar un requerimiento en estado "${doc.estado}"`)
  }
  if (!motivoRechazo?.trim()) {
    throw new ErrorValidacion('El motivo de rechazo es obligatorio')
  }

  const aprobador = await Usuario.findById(usuarioActor.id_usuario).select('nombre cargo')

  // Rechazo definitivo (decisión de negocio confirmada): no hay "devolver
  // para corregir", si el solicitante insiste debe crear un requerimiento
  // nuevo.
  doc.estado = 'rechazado'
  doc.financiero.motivoRechazo = motivoRechazo.trim()
  doc.financiero.aprobadoPor = usuarioActor.id_usuario
  doc.financiero.nombreAprobador = aprobador?.nombre || usuarioActor.nombre_usuario
  doc.financiero.cargoAprobador = aprobador?.cargo || ''
  doc.financiero.fechaDecision = new Date()

  await doc.save()
  await auditar(usuarioActor, 'rechazar_financiero', doc, 'Financiero rechazó el requerimiento', {
    motivoRechazo: doc.financiero.motivoRechazo,
  })

  notificarUsuarios([doc.solicitante], {
    title: 'Requerimiento rechazado',
    body: doc.financiero.motivoRechazo,
    url: `/requerimientos/${doc._id}`,
  }).catch((err) => console.error('Error notificando rechazo financiero:', err.message))

  return obtenerRequerimiento(doc._id)
}

export async function marcarEstadoBodega(id, { estado, observacion, password } = {}, usuarioActor) {
  const doc = await obtenerParaMutar(id)
  if (doc.estado !== 'pendiente_bodega') {
    throw new ErrorConflicto('Solo se puede gestionar en Bodega un requerimiento ya aprobado por Financiero')
  }
  if (!ESTADOS_BODEGA.includes(estado)) {
    throw new ErrorValidacion(`estado debe ser uno de: ${ESTADOS_BODEGA.join(', ')}`)
  }

  // Firma digital solo para la decisión afirmativa, mismo criterio que
  // aprobarComoFinanciero: "no aprobada" y "pendiente" no exigen reautenticación.
  if (estado === 'aprobada') {
    await reautenticar(usuarioActor.id_usuario, password)
  }

  const revisor = await Usuario.findById(usuarioActor.id_usuario).select('nombre cargo')

  doc.bodega.estado = estado
  doc.bodega.revisadoPor = usuarioActor.id_usuario
  doc.bodega.nombreRevisor = revisor?.nombre || usuarioActor.nombre_usuario
  doc.bodega.cargoRevisor = revisor?.cargo || ''
  doc.bodega.fecha = new Date()
  if (observacion !== undefined) doc.bodega.observacion = String(observacion).trim()

  await doc.save()
  await auditar(usuarioActor, 'marcar_estado_bodega', doc, `Bodega marcó el requerimiento como "${estado}"`)

  // 'pendiente' es el estado de entrada (Bodega aún gestionando): no es una
  // decisión que le interese al solicitante todavía.
  if (estado === 'aprobada' || estado === 'no_aprobada') {
    notificarUsuarios([doc.solicitante], {
      title: estado === 'aprobada' ? 'Requerimiento aprobado en Bodega' : 'Requerimiento no aprobado en Bodega',
      body: doc.bodega.observacion || `Tu requerimiento fue marcado como "${estado}"`,
      url: `/requerimientos/${doc._id}`,
    }).catch((err) => console.error('Error notificando decisión de bodega:', err.message))
  }

  return obtenerRequerimiento(doc._id)
}

// Paso posterior y distinto a marcarEstadoBodega: confirma que un producto
// llegó físicamente. Solo aplica a compra y solo una vez Bodega ya aprobó.
export async function marcarControlRecibidoItem(id, itemId, { recibido, observacion } = {}, usuarioActor) {
  const doc = await obtenerParaMutar(id)
  if (doc.tipo !== 'compra') {
    throw new ErrorValidacion('El control de recibido solo aplica a requerimientos de compra')
  }
  if (doc.bodega.estado !== 'aprobada') {
    throw new ErrorConflicto('Solo se puede marcar el control de recibido cuando el requerimiento está aprobado en Bodega')
  }
  const item = doc.itemsCompra.id(itemId)
  if (!item) throw new ErrorNoEncontrado('Ítem no encontrado')

  const marcarRecibido = Boolean(recibido)
  item.controlRecibido = {
    recibido: marcarRecibido,
    fecha: marcarRecibido ? new Date() : null,
    marcadoPor: usuarioActor.id_usuario,
    observacion: observacion ? String(observacion).trim() : '',
  }

  await doc.save()
  await auditar(
    usuarioActor,
    'marcar_control_recibido',
    doc,
    `Bodega marcó el ítem "${item.descripcionProducto}" como ${marcarRecibido ? 'recibido' : 'pendiente'}`
  )
  return obtenerRequerimiento(doc._id)
}

export function listarMios(usuarioActor) {
  return Requerimiento.find({ solicitante: usuarioActor.id_usuario })
    .populate('financiero.aprobadoPor', 'nombre nombre_usuario')
    .populate('bodega.revisadoPor', 'nombre nombre_usuario')
    .sort({ createdAt: -1 })
}

export function listarBandejaFinanciero() {
  return Requerimiento.find({ estado: 'pendiente_financiero' })
    .populate('solicitante', 'nombre nombre_usuario dependencia')
    .sort({ createdAt: -1 })
}

export function listarBandejaBodega() {
  return Requerimiento.find({ estado: 'pendiente_bodega' })
    .populate('solicitante', 'nombre nombre_usuario dependencia')
    .populate('financiero.aprobadoPor', 'nombre nombre_usuario')
    .sort({ createdAt: -1 })
}

export function listarTodos({ estado, tipo } = {}) {
  const filtro = {}
  if (estado) filtro.estado = estado
  if (tipo) filtro.tipo = tipo
  return Requerimiento.find(filtro)
    .populate('solicitante', 'nombre nombre_usuario dependencia')
    .populate('financiero.aprobadoPor', 'nombre nombre_usuario')
    .populate('bodega.revisadoPor', 'nombre nombre_usuario')
    .sort({ createdAt: -1 })
}

export async function obtenerDetalle(id, usuarioActor) {
  const doc = await obtenerRequerimiento(id)
  if (!doc) throw new ErrorNoEncontrado('Requerimiento no encontrado')
  if (!puedeVer(doc, usuarioActor)) {
    throw new ErrorConflicto('No tienes acceso a este requerimiento')
  }
  return doc
}
