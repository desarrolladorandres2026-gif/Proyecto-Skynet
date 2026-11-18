import Ausencia from '../../models/Ausencia.js'
import Usuario from '../../models/Usuario.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto, ErrorAutorizacion } from '../../utils/errores.js'
import { inicioDelDia, contarDias } from '../../utils/fechas.js'
import { escapeRegex } from '../../utils/regex.js'
import { usuariosConPermiso } from '../mantenimiento/comun.js'
import {
  notificarUsuarios, auditar, obtener, obtenerParaMutar,
  detallesDeAusencia, haySolapamiento,
} from './ausencias.service.js'

// Trámite de una INCAPACIDAD, desde que se reporta hasta que llega a Talento
// Humano:
//
//   trabajador --> SIG --> Secretaria de Gerencia --> Gerencia --> Talento Humano
//    reporta     verifica   folía                     direcciona    recibe
//                o devuelve                          (y dice a
//                                                    quién va)
//   y la Secretaria completa el folio con el destinatario que definió la Gerencia.
//
// Cada paso exige su propio permiso (ver rbac.data.js) y solo es válido desde
// la etapa que le corresponde: una incapacidad no se puede foliar sin haber
// sido verificada, ni direccionar sin haber sido foliada. Todo queda en
// `historial`, que es lo que lee la supervisión.

const MAX_FOLIO = 40
const MAX_TEXTO = 1000
const MS_DIA = 24 * 60 * 60 * 1000

const tiene = (actor, codigo) => Boolean(actor.esSuperAdmin || actor.permisos?.has(codigo))
const texto = (valor, max = MAX_TEXTO) => String(valor ?? '').trim().slice(0, max)

// Las incapacidades anteriores a este trámite no tienen `etapa`. Las que siguen
// pendientes entran a SIG como cualquier otra; las ya decididas quedan fuera.
export function etapaDe(doc) {
  if (doc.etapa) return doc.etapa
  return doc.estado === 'pendiente' ? 'en_verificacion' : null
}

const ETAPA_TEXTO = {
  en_verificacion: 'En verificación (SIG)',
  devuelta: 'Devuelta al trabajador',
  por_foliar: 'Verificada y aprobada — por foliar',
  foliada: 'Foliada — a la espera de direccionamiento',
  direccionada: 'Despachada a Talento Humano',
  tramitada: 'Tramitada por Talento Humano',
}

async function cargarIncapacidad(id) {
  const doc = await obtenerParaMutar(id)
  if (doc.tipo !== 'incapacidad') {
    throw new ErrorConflicto('Esta solicitud no es una incapacidad')
  }
  return doc
}

function exigirEtapa(doc, etapa, accion) {
  const actual = etapaDe(doc)
  if (doc.estado === 'cancelada') throw new ErrorConflicto('La incapacidad fue cancelada por el trabajador')
  if (actual !== etapa) {
    throw new ErrorConflicto(`No se puede ${accion} una incapacidad en etapa "${ETAPA_TEXTO[actual] || actual || 'cerrada'}"`)
  }
}

async function firmaDe(actor) {
  const u = await Usuario.findById(actor.id_usuario).select('nombre cargo')
  return { nombre: u?.nombre || actor.nombre_usuario, cargo: u?.cargo || '' }
}

function avanzar(doc, etapa, accion, actor, firma, nota = '') {
  doc.etapa = etapa
  doc.etapaDesde = new Date()
  if (!doc.historial) doc.historial = []
  doc.historial.push({ accion, por: actor.id_usuario, nombre: firma.nombre, cargo: firma.cargo, nota: texto(nota) })
}

// ── Paso 1: SIG verifica o devuelve ────────────────────────────────────────

export async function verificarIncapacidad(id, { observacion } = {}, actor) {
  const doc = await cargarIncapacidad(id)
  exigirEtapa(doc, 'en_verificacion', 'verificar')
  if (String(doc.solicitante) === String(actor.id_usuario)) {
    throw new ErrorConflicto('No puedes verificar tu propia incapacidad')
  }
  if (await haySolapamiento(doc.solicitante, doc.fechaInicio, doc.fechaFin, doc._id)) {
    throw new ErrorConflicto('Esta persona ya tiene otra ausencia que se cruza con esas fechas')
  }

  const firma = await firmaDe(actor)
  const obs = texto(observacion)
  // "Verificado y aprobado": desde aquí es una ausencia en firme (la ve el
  // calendario y bloquea fechas), aunque el trámite administrativo continúe.
  doc.estado = 'aprobada'
  doc.verificacion = { por: actor.id_usuario, nombre: firma.nombre, cargo: firma.cargo, fecha: new Date(), observacion: obs }
  doc.decision.revisadoPor = actor.id_usuario
  doc.decision.nombreRevisor = firma.nombre
  doc.decision.cargoRevisor = firma.cargo
  doc.decision.fecha = new Date()
  doc.decision.motivoRechazo = ''
  doc.decision.observacion = obs
  avanzar(doc, 'por_foliar', 'verificada', actor, firma, obs)
  await doc.save()
  await auditar(actor, 'aprobar', doc, 'Verificó y aprobó la incapacidad (SIG)')

  notificarUsuarios([doc.solicitante], {
    title: 'Tu incapacidad fue verificada y aprobada',
    body: obs || `${firma.nombre} verificó tu soporte. Sigue su trámite en Gerencia y Talento Humano.`,
    url: '/ausencias/mias',
    detalles: detallesDeAusencia(doc, [{ etiqueta: 'Verificada por', valor: firma.nombre }]),
  }).catch((err) => console.error('Error notificando verificación de incapacidad:', err.message))

  const foliadores = await usuariosConPermiso('ausencias:foliar_incapacidades')
  notificarUsuarios(foliadores, {
    title: 'Incapacidad por foliar',
    body: 'SIG verificó y aprobó una incapacidad. Falta registrarla en el folio.',
    url: '/ausencias/incapacidades',
    detalles: detallesDeAusencia(doc, [{ etiqueta: 'Verificada por', valor: firma.nombre }]),
  }).catch((err) => console.error('Error notificando incapacidad por foliar:', err.message))

  return obtener(doc._id)
}

export async function devolverIncapacidad(id, { motivo } = {}, actor) {
  const doc = await cargarIncapacidad(id)
  exigirEtapa(doc, 'en_verificacion', 'devolver')
  const que = texto(motivo)
  if (!que) throw new ErrorValidacion('Indica qué falta o qué está mal, para que el trabajador pueda corregirlo')

  const firma = await firmaDe(actor)
  avanzar(doc, 'devuelta', 'devuelta', actor, firma, que)
  await doc.save()
  await auditar(actor, 'rechazar', doc, 'Devolvió la incapacidad al trabajador (SIG)', { motivo: que })

  notificarUsuarios([doc.solicitante], {
    title: 'Tu incapacidad necesita una corrección',
    body: que,
    url: '/ausencias/mias',
    detalles: detallesDeAusencia(doc, [{ etiqueta: 'Devuelta por', valor: firma.nombre }]),
  }).catch((err) => console.error('Error notificando devolución de incapacidad:', err.message))

  return obtener(doc._id)
}

// El trabajador corrige lo que SIG pidió y la vuelve a enviar: misma solicitud,
// sin crear otra ni perder el historial. `soporte` ya viene armado por el
// controller a partir del archivo subido (nunca del body).
export async function reenviarIncapacidad(id, datos = {}, actor) {
  const doc = await cargarIncapacidad(id)
  if (String(doc.solicitante) !== String(actor.id_usuario)) {
    throw new ErrorAutorizacion('Solo quien reportó la incapacidad puede corregirla')
  }
  exigirEtapa(doc, 'devuelta', 'reenviar')

  const comentario = texto(datos.comentario)
  const hayArchivo = Boolean(datos.soporte?.archivo)
  const hayFechas = Boolean(datos.fechaInicio || datos.fechaFin)
  if (!hayArchivo && !comentario && !hayFechas) {
    throw new ErrorValidacion('Adjunta un soporte corregido, cambia las fechas o explica la corrección')
  }

  if (hayFechas) {
    const inicio = inicioDelDia(datos.fechaInicio || doc.fechaInicio)
    const fin = inicioDelDia(datos.fechaFin || doc.fechaFin)
    if (!inicio || !fin) throw new ErrorValidacion('Las fechas deben ser válidas')
    if (fin < inicio) throw new ErrorValidacion('La fecha de fin no puede ser anterior a la de inicio')
    if (await haySolapamiento(doc.solicitante, inicio, fin, doc._id)) {
      throw new ErrorConflicto('Ya tienes una ausencia registrada que se cruza con esas fechas')
    }
    doc.fechaInicio = inicio
    doc.fechaFin = fin
    doc.diasHabiles = contarDias(inicio, fin)
  }
  if (hayArchivo) doc.soporte = datos.soporte

  const firma = await firmaDe(actor)
  const partes = [hayArchivo && 'nuevo soporte', hayFechas && 'fechas corregidas'].filter(Boolean)
  avanzar(doc, 'en_verificacion', 'reenviada', actor, firma, [partes.join(' y '), comentario].filter(Boolean).join(': '))
  await doc.save()
  await auditar(actor, 'actualizar', doc, 'Corrigió y reenvió la incapacidad a verificación')

  const verificadores = await usuariosConPermiso('ausencias:verificar_incapacidades')
  notificarUsuarios(verificadores, {
    title: 'Incapacidad corregida: por verificar',
    body: `${firma.nombre} corrigió su incapacidad y la volvió a enviar.`,
    url: '/ausencias/incapacidades',
    detalles: detallesDeAusencia(doc, [{ etiqueta: 'Solicitante', valor: firma.nombre }]),
  }).catch((err) => console.error('Error notificando incapacidad reenviada:', err.message))

  return obtener(doc._id)
}

// ── Paso 2: la Secretaria de Gerencia folía ────────────────────────────────

export async function foliarIncapacidad(id, { numeroFolio, observacion } = {}, actor) {
  const doc = await cargarIncapacidad(id)
  exigirEtapa(doc, 'por_foliar', 'foliar')
  // El folio real lo llena la Secretaria en físico: aquí el número es solo una
  // referencia, por eso es opcional.
  const numero = texto(numeroFolio, MAX_FOLIO)

  const firma = await firmaDe(actor)
  doc.folio = {
    numero,
    observacion: texto(observacion),
    fecha: new Date(),
    por: actor.id_usuario,
    nombre: firma.nombre,
    cargo: firma.cargo,
    destinatarioRegistrado: false,
    destinatarioRegistradoEn: null,
    destinatarioRegistradoPor: '',
  }
  avanzar(doc, 'foliada', 'foliada', actor, firma, [numero && `Folio ${numero}`, doc.folio.observacion].filter(Boolean).join(': '))
  await doc.save()
  await auditar(actor, 'actualizar', doc, numero ? `Foliada con el número ${numero}` : 'Foliada')

  const direccionadores = await usuariosConPermiso('ausencias:direccionar_incapacidades')
  notificarUsuarios(direccionadores, {
    title: 'Incapacidad por direccionar',
    body: `Foliada${numero ? ` (folio ${numero})` : ''}, a la espera de que la direccione a Talento Humano.`,
    url: '/ausencias/incapacidades',
    detalles: detallesDeAusencia(doc, numero ? [{ etiqueta: 'Folio', valor: numero }] : []),
  }).catch((err) => console.error('Error notificando incapacidad por direccionar:', err.message))

  return obtener(doc._id)
}

// ── Paso 3: la Gerencia direcciona a Talento Humano ────────────────────────

// Personas de Talento Humano a quienes se puede dirigir la incapacidad: las
// que tienen el permiso de recibirlas (se resuelve por permiso, no por el
// nombre del rol, que cada Terminal renombra a su gusto).
export async function listarDestinatarios() {
  const ids = await usuariosConPermiso('ausencias:recibir_incapacidades', { incluirSuperAdmin: false })
  return Usuario.find({ _id: { $in: ids } }).select('nombre nombre_usuario cargo').sort({ nombre: 1 })
}

export async function direccionarIncapacidad(id, { destinatarioId, mensaje } = {}, actor) {
  const doc = await cargarIncapacidad(id)
  exigirEtapa(doc, 'foliada', 'direccionar')
  if (!destinatarioId) throw new ErrorValidacion('Indica a quién de Talento Humano va dirigida')

  const receptores = await usuariosConPermiso('ausencias:recibir_incapacidades', { incluirSuperAdmin: false })
  if (!receptores.some((r) => String(r) === String(destinatarioId))) {
    throw new ErrorValidacion('Esa persona no puede recibir incapacidades de Talento Humano')
  }
  const destinatario = await Usuario.findById(destinatarioId).select('nombre nombre_usuario cargo')
  if (!destinatario) throw new ErrorNoEncontrado('Destinatario no encontrado')

  const firma = await firmaDe(actor)
  const nombreDestinatario = destinatario.nombre || destinatario.nombre_usuario
  const msg = texto(mensaje)
  doc.direccionamiento = {
    destinatario: destinatario._id,
    nombreDestinatario,
    mensaje: msg,
    fecha: new Date(),
    por: actor.id_usuario,
    nombre: firma.nombre,
    cargo: firma.cargo,
  }
  avanzar(doc, 'direccionada', 'direccionada', actor, firma, `Dirigida a ${nombreDestinatario}${msg ? `: ${msg}` : ''}`)
  await doc.save()
  await auditar(actor, 'actualizar', doc, `Direccionó la incapacidad a Talento Humano (${nombreDestinatario})`)

  const detalles = detallesDeAusencia(doc, [
    { etiqueta: 'Dirigida a', valor: nombreDestinatario },
    ...(doc.folio?.numero ? [{ etiqueta: 'Folio', valor: doc.folio.numero }] : []),
  ])
  const enviar = (usuarios, payload) => notificarUsuarios(usuarios, { ...payload, detalles })
    .catch((err) => console.error('Error notificando direccionamiento de incapacidad:', err.message))

  // Talento Humano: la persona nombrada recibe un aviso propio, el resto del
  // área uno informativo.
  await enviar([destinatario._id], {
    title: 'Incapacidad dirigida a ti',
    body: msg || `${firma.nombre} te dirigió una incapacidad para tramitar.`,
    url: '/ausencias/incapacidades',
  })
  await enviar(receptores.filter((r) => String(r) !== String(destinatario._id)), {
    title: 'Incapacidad despachada a Talento Humano',
    body: `Dirigida a ${nombreDestinatario}. ${msg}`.trim(),
    url: '/ausencias/incapacidades',
  })
  // La Secretaria ya tiene lo que le faltaba para cerrar el folio.
  await enviar(await usuariosConPermiso('ausencias:foliar_incapacidades'), {
    title: 'Completa el folio de una incapacidad',
    body: `La Gerencia la dirigió a ${nombreDestinatario}. Regístralo en el folio${doc.folio?.numero ? ` ${doc.folio.numero}` : ''}.`,
    url: '/ausencias/incapacidades',
  })
  await enviar([doc.solicitante], {
    title: 'Tu incapacidad llegó a Talento Humano',
    body: `Fue despachada a ${nombreDestinatario}.`,
    url: '/ausencias/mias',
  })

  return obtener(doc._id)
}

// La Secretaria deja constancia de que ya escribió en el folio a quién va
// dirigida (el dato lo definió la Gerencia al direccionar).
export async function completarFolioIncapacidad(id, { observacion } = {}, actor) {
  const doc = await cargarIncapacidad(id)
  const etapaActual = etapaDe(doc)
  // Se puede completar mientras esté con Talento Humano o ya tramitada: la
  // Secretaria llena el folio a su ritmo, sin depender de que ya se tramitara.
  if (etapaActual !== 'tramitada') exigirEtapa(doc, 'direccionada', 'completar el folio de')
  if (doc.folio?.destinatarioRegistrado) {
    throw new ErrorConflicto('El folio de esta incapacidad ya tiene el destinatario registrado')
  }

  const firma = await firmaDe(actor)
  doc.folio.destinatarioRegistrado = true
  doc.folio.destinatarioRegistradoEn = new Date()
  doc.folio.destinatarioRegistradoPor = firma.nombre
  const nota = [`Destinatario registrado en el folio: ${doc.direccionamiento?.nombreDestinatario || ''}`, texto(observacion)].filter(Boolean).join('. ')
  if (!doc.historial) doc.historial = []
  doc.historial.push({ accion: 'folio_completado', por: actor.id_usuario, nombre: firma.nombre, cargo: firma.cargo, nota })
  await doc.save()
  await auditar(actor, 'actualizar', doc, 'Completó el folio con el destinatario')

  return obtener(doc._id)
}

// ── Paso 4: Talento Humano recibe y tramita ────────────────────────────────

// Cierra el ciclo. Lo puede marcar cualquiera con el permiso de recibir (no
// solo la persona nombrada): si ella no está, otra del área la atiende.
export async function tramitarIncapacidad(id, { observacion } = {}, actor) {
  const doc = await cargarIncapacidad(id)
  exigirEtapa(doc, 'direccionada', 'tramitar')

  const firma = await firmaDe(actor)
  const obs = texto(observacion)
  doc.tramite = { por: actor.id_usuario, nombre: firma.nombre, cargo: firma.cargo, fecha: new Date(), observacion: obs }
  avanzar(doc, 'tramitada', 'tramitada', actor, firma, obs)
  await doc.save()
  await auditar(actor, 'actualizar', doc, 'Recibió y tramitó la incapacidad (Talento Humano)')

  notificarUsuarios([doc.solicitante], {
    title: 'Tu incapacidad fue tramitada',
    body: obs || `${firma.nombre} la recibió y la tramitó en Talento Humano.`,
    url: '/ausencias/mias',
    detalles: detallesDeAusencia(doc, [{ etiqueta: 'Tramitada por', valor: firma.nombre }]),
  }).catch((err) => console.error('Error notificando incapacidad tramitada:', err.message))

  return obtener(doc._id)
}

// ── Consultas ──────────────────────────────────────────────────────────────

const POPULATE_LISTA = [
  { path: 'solicitante', select: 'nombre nombre_usuario cargo dependencia' },
  { path: 'direccionamiento.destinatario', select: 'nombre nombre_usuario' },
]

function conDias(doc, ahora = Date.now()) {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc
  const final = o.estado === 'cancelada' || o.etapa === 'tramitada'
  const desde = o.etapaDesde || o.createdAt
  return {
    ...o,
    etapaEfectiva: etapaDe(o),
    diasEnEtapa: final || !desde ? null : Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / MS_DIA)),
  }
}

// Lo que tiene pendiente quien consulta, según los permisos que tenga: cada
// persona ve solo las bandejas de los pasos que le tocan.
export async function listarTramite(actor) {
  const base = { tipo: 'incapacidad' }
  const lista = (filtro, orden) => Ausencia.find({ ...base, ...filtro }).populate(POPULATE_LISTA).sort(orden).limit(200)
  const resultado = {}

  if (tiene(actor, 'ausencias:verificar_incapacidades')) {
    resultado.porVerificar = (await lista(
      { estado: 'pendiente', $or: [{ etapa: 'en_verificacion' }, { etapa: null }] },
      { createdAt: 1 },
    )).map((d) => conDias(d))
  }
  if (tiene(actor, 'ausencias:foliar_incapacidades')) {
    resultado.porFoliar = (await lista({ estado: 'aprobada', etapa: 'por_foliar' }, { etapaDesde: 1 })).map((d) => conDias(d))
    resultado.porCompletarFolio = (await lista(
      { estado: 'aprobada', etapa: { $in: ['direccionada', 'tramitada'] }, 'folio.destinatarioRegistrado': { $ne: true } },
      { etapaDesde: 1 },
    )).map((d) => conDias(d))
  }
  if (tiene(actor, 'ausencias:direccionar_incapacidades')) {
    resultado.porDireccionar = (await lista({ estado: 'aprobada', etapa: 'foliada' }, { etapaDesde: 1 })).map((d) => conDias(d))
  }
  if (tiene(actor, 'ausencias:recibir_incapacidades')) {
    const recibidas = await lista({ estado: 'aprobada', etapa: { $in: ['direccionada', 'tramitada'] } }, { 'direccionamiento.fecha': -1 })
    resultado.recibidas = recibidas.map((d) => {
      const dest = d.direccionamiento?.destinatario?._id || d.direccionamiento?.destinatario
      return { ...conDias(d), paraMi: String(dest) === String(actor.id_usuario) }
    })
  }
  return resultado
}

// Todas las incapacidades, en la etapa que estén. `etapa` acepta cada etapa
// del trámite o 'cancelada'.
export async function supervisarIncapacidades({ etapa, q, desde, hasta } = {}) {
  const filtro = { tipo: 'incapacidad' }
  if (etapa === 'cancelada') filtro.estado = 'cancelada'
  else if (etapa) Object.assign(filtro, { etapa, estado: { $ne: 'cancelada' } })

  const inicio = desde ? inicioDelDia(desde) : null
  const fin = hasta ? inicioDelDia(hasta) : null
  if (inicio) filtro.fechaFin = { $gte: inicio }
  if (fin) filtro.fechaInicio = { $lte: fin }

  const busqueda = texto(q, 80)
  if (busqueda) {
    const rx = new RegExp(escapeRegex(busqueda), 'i')
    const personas = await Usuario.find({ $or: [{ nombre: rx }, { nombre_usuario: rx }] }).select('_id').limit(200)
    filtro.$or = [{ solicitante: { $in: personas.map((p) => p._id) } }, { 'folio.numero': rx }]
  }

  const [docs, grupos] = await Promise.all([
    Ausencia.find(filtro).populate(POPULATE_LISTA).sort({ createdAt: -1 }).limit(300),
    Ausencia.aggregate([
      { $match: { tipo: 'incapacidad' } },
      { $group: { _id: { etapa: '$etapa', estado: '$estado' }, n: { $sum: 1 } } },
    ]),
  ])

  const resumen = { total: 0, canceladas: 0, sin_tramite: 0 }
  for (const g of grupos) {
    resumen.total += g.n
    if (g._id.estado === 'cancelada') resumen.canceladas += g.n
    else if (g._id.etapa) resumen[g._id.etapa] = (resumen[g._id.etapa] || 0) + g.n
    // Sin etapa: anteriores a este trámite. Las que siguen pendientes entran a
    // SIG (ver etapaDe); las ya decididas por Talento Humano quedan aparte.
    else if (g._id.estado === 'pendiente') resumen.en_verificacion = (resumen.en_verificacion || 0) + g.n
    else resumen.sin_tramite += g.n
  }
  return { incapacidades: docs.map((d) => conDias(d)), resumen }
}
