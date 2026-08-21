import Requerimiento from '../../models/Requerimiento.js'
import Usuario from '../../models/Usuario.js'
import Rol from '../../models/Rol.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { reautenticar } from '../../utils/reautenticacion.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { rangoDeDias } from '../../utils/fechas.js'
import { vincularRequerimiento } from '../danos/danos.service.js'
import { usuariosConPermiso } from '../mantenimiento/comun.js'
import { notificarUsuarios as _notificarUsuarios } from '../../utils/sendPush.js'
import { obtenerRequerimiento, puedeVer, auditar } from './comun.js'

// pendiente = "pendiente por despachar" (recién llega de Financiero),
// aprobada = "despachado", no_aprobada = "no se puede despachar" (exige
// observacion, ver marcarEstadoBodega). Nombres internos sin tocar para no
// migrar datos existentes — el frontend traduce las etiquetas (ver
// RequerimientoDetallePage.jsx/BandejaBodegaPage.jsx).
const ESTADOS_BODEGA = ['pendiente', 'aprobada', 'no_aprobada']

// Cuando Bodega marca "no se puede despachar", además del solicitante se
// avisa a quien puede actuar sobre el bloqueo: Financiero (que aprobó la
// compra) y Admin/Super Admin (supervisión de toda la operación).
async function usuariosAdminYFinanciero() {
  const [rolesAdmin, financieros] = await Promise.all([
    Rol.find({ $or: [{ esSuperAdmin: true }, { slug: 'administrador' }] }).select('_id'),
    usuariosConPermiso('requerimientos:aprobar_financiero'),
  ])
  const admins = await Usuario.find({ rol: { $in: rolesAdmin.map((r) => r._id) }, estado: 'activo', esPrueba: false }).select('_id')
  return [...admins.map((u) => u._id), ...financieros]
}

// Categoría fija para todo este módulo (ver notificaciones.catalogo.js).
// Requerimientos es el primer flujo conectado end-to-end al motor nuevo de
// notificaciones (antes no avisaba a nadie en ningún paso) — sirve como caso
// real para las pruebas de integración del sistema.
const notificarUsuarios = (userIds, payload) => _notificarUsuarios(userIds, payload, 'requerimientos')

// Exportadas para que copiloto.herramientas.js valide el borrador que arma
// la IA con EXACTAMENTE las mismas reglas que exige crearRequerimiento — así
// lo que el usuario ve en el resumen del chat es garantizado aceptado al
// confirmar, sin una segunda copia de estas reglas que pueda desincronizarse.
export function validarItemsCompra(items) {
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

export function normalizarItemsCompra(items) {
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

  const aprobador = await Usuario.findById(usuarioActor.id_usuario).select('nombre cargo firma')

  // Aprobar sin rúbrica registrada dejaría el bloque de firma del PDF vacío:
  // el documento quedaría aprobado pero visualmente sin firmar, que es
  // justamente lo que este flujo debe garantizar. Se corta antes de mutar
  // nada, igual que la reautenticación.
  if (!aprobador?.firma?.url) {
    throw new ErrorValidacion(
      'No tienes una firma registrada. Regístrala en Requerimientos → Mi firma antes de aprobar.'
    )
  }

  aplicarEdicionFinanciero(doc, body || {}, usuarioActor)

  doc.financiero.aprobadoPor = usuarioActor.id_usuario
  doc.financiero.nombreAprobador = aprobador?.nombre || usuarioActor.nombre_usuario
  doc.financiero.cargoAprobador = aprobador?.cargo || ''
  // Snapshot, no referencia: si mañana el aprobador cambia su firma, este
  // documento conserva la rúbrica con la que realmente se firmó.
  doc.financiero.firma = {
    url: aprobador.firma.url,
    urlOriginal: aprobador.firma.urlOriginal,
    publicId: aprobador.firma.publicId,
  }
  doc.financiero.fechaDecision = new Date()
  doc.financiero.motivoRechazo = undefined
  // Opcional: "de ser necesario". No confundir con analisisTecnico (campo
  // formal del formato, editable desde antes de aprobar) — esto es una
  // aclaración puntual que el aprobador puede dejar justo al firmar.
  if (body?.observacion !== undefined) doc.financiero.observacion = String(body.observacion).trim()
  doc.estado = 'pendiente_bodega'
  doc.bodega.estado = 'pendiente'

  await doc.save()
  await auditar(usuarioActor, 'aprobar_financiero', doc, 'Financiero aprobó el requerimiento (firma con reautenticación)', {
    observacion: doc.financiero.observacion || undefined,
  })

  const bodega = await usuariosConPermiso('requerimientos:gestionar_bodega')
  notificarUsuarios(bodega, {
    title: 'Requerimiento aprobado por Financiero',
    // Si el aprobador dejó una nota, Bodega la ve de una vez en la
    // notificación (es la principal destinataria de esa aclaración).
    body: doc.financiero.observacion || `Pendiente de gestionar en Bodega (${doc.tipo})`,
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
  // "No se puede despachar" sin motivo deja al solicitante (y a quien deba
  // resolver el bloqueo) sin ninguna pista de qué pasó.
  if (estado === 'no_aprobada' && !observacion?.trim()) {
    throw new ErrorValidacion('Debes indicar el motivo por el cual no se puede despachar')
  }

  // Reautenticación solo para la decisión afirmativa, mismo criterio que
  // aprobarComoFinanciero: "no aprobada" y "pendiente" no exigen
  // reautenticación. A diferencia de Financiero, esto NO es una firma
  // digital (Bodega no tiene rúbrica): solo confirma identidad antes de
  // registrar el despacho — ver dibujarBloquesFirma en requerimientoPdf.js.
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
  // decisión que le interese a nadie todavía.
  if (estado === 'aprobada') {
    notificarUsuarios([doc.solicitante], {
      title: 'Requerimiento despachado',
      body: doc.bodega.observacion || 'Tu requerimiento fue despachado por Bodega',
      url: `/requerimientos/${doc._id}`,
    }).catch((err) => console.error('Error notificando despacho de bodega:', err.message))
  } else if (estado === 'no_aprobada') {
    // No se puede despachar: además del solicitante, se avisa a quien puede
    // actuar sobre el bloqueo (Financiero y Admin/Super Admin).
    const destinatarios = await usuariosAdminYFinanciero()
    notificarUsuarios([doc.solicitante, ...destinatarios], {
      title: 'Requerimiento no se pudo despachar',
      body: doc.bodega.observacion,
      url: `/requerimientos/${doc._id}`,
    }).catch((err) => console.error('Error notificando bloqueo de despacho:', err.message))
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

// ── Exportar / purgar por rango de fechas ──────────────────────────────────
// Ambas comparten el mismo filtro (fechaSolicitud entre desde y hasta, ambos
// límites inclusive): es el campo que la UI ya muestra como "Fecha" en cada
// bandeja, así que exportar/borrar "del 1 al 31" se corresponde con lo que
// el usuario ve en pantalla, no con createdAt (metadato técnico).
// Este módulo ya evitaba el setHours() que rompía a los demás, pero anclaba a
// medianoche UTC: correcto respecto a la zona del servidor, y aun así corrido
// 5 horas respecto al día que ve quien usa el sistema. rangoDeDias() ancla a
// la medianoche del Terminal, que es lo que significa "del 1 al 31" para quien
// escribe esas fechas en pantalla. Ver utils/fechas.js.
const rangoFechas = ({ desde, hasta } = {}) => rangoDeDias(desde, hasta)

// "CSV Formula Injection": si una celda empieza con =, +, -, @, tab o CR,
// Excel/Sheets la interpreta como fórmula al abrir el archivo — un
// descripcionProducto tipo "=cmd|'/c calc'!A1" (dato de usuario, no
// controlado) ejecutaría código en la máquina de quien abre el export. El
// apóstrofe inicial fuerza a leerlo como texto plano en ambos programas.
function csvEscapar(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor)
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

const ENCABEZADOS_CSV = [
  'ID', 'Fecha solicitud', 'Tipo', 'Solicitante', 'Cargo solicitante', 'Área/Proceso',
  'Estado', 'Estado Bodega', 'Aprobado/Rechazado por (Financiero)', 'Fecha decisión Financiero',
  'Motivo rechazo', 'Revisado por (Bodega)', 'Fecha Bodega', 'Observación Bodega',
  'Ítems (compra)', 'Detalle (servicio)',
]

function filaCsv(r) {
  const items = r.tipo === 'compra'
    ? (r.itemsCompra || []).map((it) => `${it.descripcionProducto} x${it.cantidad}${it.destino ? ` (${it.destino})` : ''}`).join(' | ')
    : ''
  const detalleServicio = r.tipo === 'servicio'
    ? [r.detalleServicio?.descripcionTipoServicio, r.detalleServicio?.competencia, r.detalleServicio?.laboresADesarrollar, r.detalleServicio?.requisitosSST]
        .filter(Boolean)
        .join(' | ')
    : ''
  const campos = [
    r._id,
    fmtFechaCsv(r.fechaSolicitud),
    r.tipo,
    r.solicitante?.nombre || '',
    r.cargoSolicitante || '',
    r.areaOProceso || '',
    r.estado,
    r.estado === 'pendiente_bodega' ? r.bodega?.estado || '' : '',
    r.financiero?.nombreAprobador || '',
    fmtFechaCsv(r.financiero?.fechaDecision),
    r.financiero?.motivoRechazo || '',
    r.bodega?.nombreRevisor || '',
    fmtFechaCsv(r.bodega?.fecha),
    r.bodega?.observacion || '',
    items,
    detalleServicio,
  ]
  return campos.map(csvEscapar).join(',')
}

function fmtFechaCsv(valor) {
  if (!valor) return ''
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

// Mismo alcance que cada bandeja ya aplica en su listado (listarBandejaFinanciero/
// listarBandejaBodega/listarTodos) — exportar es una lectura más de lo que
// ese rol ya puede ver, NUNCA una vía para leer lo que su bandeja no
// muestra. Sin esto, un Financiero (sin ver_todos) podía exportar
// requerimientos ya rechazados o en Bodega de cualquier solicitante, no solo
// los que tiene pendientes de aprobar.
function filtroAlcanceExport(usuarioActor) {
  if (usuarioActor.esSuperAdmin || usuarioActor.permisos?.has('requerimientos:ver_todos')) {
    return {}
  }
  const or = []
  if (usuarioActor.permisos?.has('requerimientos:aprobar_financiero')) or.push({ estado: 'pendiente_financiero' })
  if (usuarioActor.permisos?.has('requerimientos:gestionar_bodega')) or.push({ estado: 'pendiente_bodega' })
  if (or.length === 0) throw new ErrorConflicto('No tienes acceso a exportar requerimientos')
  return or.length === 1 ? or[0] : { $or: or }
}

export async function exportarCsv({ desde, hasta } = {}, usuarioActor) {
  const filtro = { fechaSolicitud: rangoFechas({ desde, hasta }), ...filtroAlcanceExport(usuarioActor) }
  const lista = await Requerimiento.find(filtro)
    .populate('solicitante', 'nombre nombre_usuario')
    .populate('financiero.aprobadoPor', 'nombre')
    .populate('bodega.revisadoPor', 'nombre')
    .sort({ fechaSolicitud: 1 })
    .lean()

  // BOM al inicio: sin esto, Excel en Windows (el consumidor esperado de
  // este CSV) interpreta acentos/ñ como caracteres corruptos al abrir el
  // archivo por doble clic en vez de detectar UTF-8.
  const bom = '﻿'
  const filas = [ENCABEZADOS_CSV.join(','), ...lista.map(filaCsv)]
  return { csv: bom + filas.join('\r\n'), total: lista.length }
}

// SuperAdmin únicamente (ver requerimientos.routes.js: soloAdmin). Exige
// reautenticación por el mismo motivo que aprobar/despachar: es la única
// operación de todo el módulo que borra datos en vez de mutar estado, y no
// hay "deshacer".
export async function eliminarPorRangoFecha({ desde, hasta, password } = {}, usuarioActor) {
  await reautenticar(usuarioActor.id_usuario, password)
  const filtro = { fechaSolicitud: rangoFechas({ desde, hasta }) }

  const total = await Requerimiento.countDocuments(filtro)
  const resultado = await Requerimiento.deleteMany(filtro)

  await registrarAuditoria({
    usuario: usuarioActor,
    accion: 'eliminar_masivo',
    modulo: 'requerimientos',
    entidad: 'Requerimiento',
    descripcion: `Eliminó ${resultado.deletedCount} requerimiento(s) con fecha entre ${desde} y ${hasta}`,
    cambios: { desde, hasta, total },
  })

  return { eliminados: resultado.deletedCount }
}

export async function obtenerDetalle(id, usuarioActor) {
  const doc = await obtenerRequerimiento(id)
  if (!doc) throw new ErrorNoEncontrado('Requerimiento no encontrado')
  if (!puedeVer(doc, usuarioActor)) {
    throw new ErrorConflicto('No tienes acceso a este requerimiento')
  }
  return doc
}
