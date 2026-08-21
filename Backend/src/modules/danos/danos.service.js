import ReporteDano from '../../models/ReporteDano.js'
import Usuario from '../../models/Usuario.js'
import Rol from '../../models/Rol.js'
import Permiso from '../../models/Permiso.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto, ErrorAutorizacion } from '../../utils/errores.js'
import { notificarUsuarios as _notificarUsuarios } from '../../utils/sendPush.js'

// Categoría fija para todo este módulo (ver notificaciones.catalogo.js):
// respeta la preferencia de canal/categoría del usuario en vez del envío
// solo-push incondicional de antes.
const notificarUsuarios = (userIds, payload) => _notificarUsuarios(userIds, payload, 'danos')
import { registrarAuditoria } from '../../utils/auditoria.js'
import { usuariosConPermiso } from '../mantenimiento/comun.js'

// Único punto de verdad del ciclo de vida de un reporte de daño (mismo
// criterio que mantenimiento/ordenes.service.js: ningún controlador ni ruta
// muta `estado` ni `asignadoA` por fuera de este archivo).

export const ESTADOS = ['pendiente', 'asignado', 'en_proceso', 'en_espera', 'resuelto', 'cancelado']
export const TIPOS = ['dano', 'novedad', 'sugerencia', 'otro']
export const PRIORIDADES = ['baja', 'media', 'alta', 'critica']
export const MOTIVOS_ESPERA = ['repuestos', 'aprobacion', 'informacion', 'apoyo']
// Dónde se hizo la reparación física — específico del Terminal, se pide al
// marcar 'resuelto' (ver validarReparacion).
export const MODULOS_TRABAJO = ['regional', 'centenario', 'modulo_mixto']

// Regla de negocio del Terminal: un técnico nunca debe acumular más de esta
// cantidad de órdenes activas sin que un supervisor lo autorice a mano
// (ver asignarAutomaticamente y asignarReporte -> parámetro `forzar`).
export const MAX_ACTIVAS_TECNICO = 5

// Un reporte "ocupa" a su técnico mientras esté en alguno de estos estados.
export const ESTADOS_ACTIVOS = ['asignado', 'en_proceso', 'en_espera']

// Qué cuenta como "trabajo pendiente" para decidir si un técnico está
// desocupado. Incluye 'en_espera' a propósito: sigue siendo trabajo suyo aunque
// esté detenido. Sacar 'en_espera' de aquí es el único cambio necesario para
// que un técnico bloqueado esperando repuestos vuelva a recibir asignaciones
// automáticas mientras espera.
const ESTADOS_QUE_OCUPAN = ['asignado', 'en_proceso', 'en_espera']

// Una tarea de esta prioridad NO ocupa al técnico: puede recibir trabajo nuevo
// aunque tenga varias encima (regla de negocio definida para el Terminal).
const PRIORIDAD_NO_OCUPA = 'baja'

// Grafo de transiciones permitidas. Volver a 'pendiente' es "liberar": deja el
// reporte sin responsable y de vuelta en la cola (ver aplicarEfectos).
const TRANSICIONES = {
  pendiente: ['asignado', 'cancelado'],
  asignado: ['en_proceso', 'pendiente', 'cancelado'],
  en_proceso: ['en_espera', 'resuelto', 'pendiente', 'cancelado'],
  en_espera: ['en_proceso', 'pendiente', 'cancelado'],
  resuelto: ['en_proceso'],
  cancelado: ['pendiente'],
}

// Ser "técnico de mantenimiento" = tener este permiso. Se prefiere a mirar el
// slug del rol porque el RBAC es dinámico: un rol nuevo ("Auxiliar de
// mantenimiento") entra al equipo con solo darle el permiso, sin tocar código.
const PERMISO_TECNICO = 'mantenimiento:ejecutar'
// Quien puede asignarle trabajo a OTRA persona (el Administrador ya lo tiene).
const PERMISO_SUPERVISOR = 'mantenimiento:asignar'

// Solo un daño físico entra al reparto automático. Una sugerencia o una
// novedad no son trabajo de taller y despacharlas a un técnico sería ruido.
const TIPOS_AUTOASIGNABLES = ['dano']

const POPULATE_REPORTANTE = { path: 'reportadoPor', select: 'nombre nombre_usuario dependencia' }
const POPULATE_ASIGNADO = { path: 'asignadoA', select: 'nombre nombre_usuario email dependencia' }
const POPULATE_ATENDIDO = { path: 'atendidoPor', select: 'nombre nombre_usuario' }

function idDe(refOPoblado) {
  return refOPoblado?._id || refOPoblado
}

function esSupervisor(actor) {
  return actor.esSuperAdmin === true || actor.permisos?.has(PERMISO_SUPERVISOR) === true
}

// Quién ve la cola completa (todos los reportes, de cualquier técnico) en vez
// de solo lo suyo. Es justo el permiso que el rol Mantenimiento YA NO tiene:
// un técnico raso solo entra a este módulo con mantenimiento:ejecutar, así
// que esta función es la que traza la línea de "visualización" de la regla
// de negocio (nunca ver órdenes de otros).
function puedeVerTodo(actor) {
  return actor.esSuperAdmin === true || actor.permisos?.has('danos:gestionar') === true
}

function esElAsignado(reporte, actor) {
  return !!reporte.asignadoA && String(idDe(reporte.asignadoA)) === String(actor.id_usuario)
}

function registrarEvento(reporte, { accion, de, a, actor, nota }) {
  reporte.historial.push({
    accion,
    de,
    a,
    por: actor ? actor.id_usuario : null,
    nombrePor: actor ? actor.nombre_usuario : 'Sistema',
    nota: nota?.trim() || undefined,
  })
}

function auditar(actor, accion, reporte, descripcion, cambios) {
  // La asignación automática no tiene actor humano; su rastro queda en
  // reporte.historial con nombrePor:'Sistema'.
  if (!actor) return Promise.resolve()
  return registrarAuditoria({
    usuario: actor,
    accion,
    modulo: 'danos',
    entidad: 'ReporteDano',
    entidadId: reporte._id,
    descripcion,
    cambios,
  })
}

// ── Equipo de mantenimiento ──────────────────────────────────────────────

// A diferencia de mantenimiento/ordenes.service.js#listarTecnicos, aquí NO se
// incluyen los roles esSuperAdmin: la pregunta que responde esta lista es
// "¿qué trabajadores de mantenimiento hay?", y el Super Admin es una cuenta de
// sistema. Meterlo en el reparto automático le mandaría trabajo de taller.
async function tecnicosDeMantenimiento() {
  const permiso = await Permiso.findOne({ codigo: PERMISO_TECNICO }).select('_id')
  if (!permiso) return []
  const roles = await Rol.find({ permisos: permiso._id }).select('_id')
  if (!roles.length) return []
  return Usuario.find({ rol: { $in: roles.map((r) => r._id) }, estado: 'activo', esPrueba: false })
    .select('nombre nombre_usuario email dependencia cargo')
    .sort({ nombre: 1 })
}

// Devuelve el equipo con su carga real de trabajo. Un solo $group resuelve
// todos los contadores + la fecha de la última asignación, en vez de N
// countDocuments por técnico.
export async function listarTecnicosConCarga() {
  const tecnicos = await tecnicosDeMantenimiento()
  if (!tecnicos.length) return []

  const ids = tecnicos.map((t) => t._id)
  // `ocupa` marca las tareas que cuentan como carga real; sobre esa marca se
  // separan las de baja prioridad (que no ocupan) del resto.
  const ocupa = { $in: ['$estado', ESTADOS_QUE_OCUPAN] }
  const esBaja = { $eq: ['$prioridad', PRIORIDAD_NO_OCUPA] }
  const noEsBaja = { $ne: ['$prioridad', PRIORIDAD_NO_OCUPA] }
  const filas = await ReporteDano.aggregate([
    { $match: { asignadoA: { $in: ids } } },
    {
      $group: {
        _id: '$asignadoA',
        ultimaAsignacion: { $max: '$asignadoEn' },
        asignados: { $sum: { $cond: [{ $eq: ['$estado', 'asignado'] }, 1, 0] } },
        enProceso: { $sum: { $cond: [{ $eq: ['$estado', 'en_proceso'] }, 1, 0] } },
        enEspera: { $sum: { $cond: [{ $eq: ['$estado', 'en_espera'] }, 1, 0] } },
        resueltos: { $sum: { $cond: [{ $eq: ['$estado', 'resuelto'] }, 1, 0] } },
        activosBaja: { $sum: { $cond: [{ $and: [ocupa, esBaja] }, 1, 0] } },
        // Los reportes creados antes de que existiera `prioridad` no tienen el
        // campo: resuelve a null, null !== 'baja', y caen aquí — se tratan como
        // prioridad normal, igual que el default del modelo. Por eso no hace
        // falta migrar nada en Atlas.
        activosPrioritarios: { $sum: { $cond: [{ $and: [ocupa, noEsBaja] }, 1, 0] } },
      },
    },
  ])
  const porId = new Map(filas.map((f) => [String(f._id), f]))

  return tecnicos.map((t) => {
    const c = porId.get(String(t._id)) || {}
    const asignados = c.asignados || 0
    const enProceso = c.enProceso || 0
    const enEspera = c.enEspera || 0
    const activosBaja = c.activosBaja || 0
    const activosPrioritarios = c.activosPrioritarios || 0
    return {
      _id: t._id,
      nombre: t.nombre,
      nombre_usuario: t.nombre_usuario,
      email: t.email,
      dependencia: t.dependencia,
      cargo: t.cargo,
      asignados,
      enProceso,
      enEspera,
      resueltos: c.resueltos || 0,
      // Trabajo que tiene encima ahora mismo (incluye lo detenido en espera).
      activos: asignados + enProceso + enEspera,
      activosBaja,
      activosPrioritarios,
      ultimaAsignacion: c.ultimaAsignacion || null,
      // Desocupado = sin trabajo pendiente, o solo con tareas de baja prioridad.
      libre: activosPrioritarios === 0,
    }
  })
}

// ── Asignación automática ────────────────────────────────────────────────

/**
 * Decide a QUIÉN se le asigna solo un daño recién reportado, sin intervención
 * del administrador.
 *
 * Regla del Terminal (la única que gobierna el reparto automático): un
 * técnico con MENOS de MAX_ACTIVAS_TECNICO órdenes activas es candidato a
 * recibir la nueva automáticamente. `libre` (sin trabajo pendiente, o solo de
 * baja prioridad — ver listarTecnicosConCarga) ya NO es un requisito para
 * entrar al reparto: es solo una señal de UI para que el supervisor vea quién
 * está más disponible al asignar a mano. Si nadie tiene cupo devuelve `null`,
 * y el reporte se queda 'pendiente' esperando que el administrador lo asigne.
 *
 * Desempate entre varios con cupo:
 *  1. el que menos trabajo tenga encima (`activos`: preferimos al más
 *     suelto, se acerca menos al tope),
 *  2. y si siguen empatados, el que lleve más tiempo sin recibir nada
 *     (`ultimaAsignacion`) — reparto round-robin, para que no le caiga siempre
 *     todo al primero de la lista. `null` (nunca recibió una asignación) pasa
 *     al frente de la fila.
 *
 * @param {Array} candidatos técnicos activos con su carga
 * @param {object} reporte    el reporte a repartir (tiene .prioridad, .tipo)
 * @returns {object|null} el técnico elegido, o null para dejarlo pendiente
 */
export function elegirTecnicoDisponible(candidatos, reporte) {
  const disponibles = candidatos.filter((t) => t.activos < MAX_ACTIVAS_TECNICO)
  if (!disponibles.length) return null

  const desdeUltimaAsignacion = (t) => (t.ultimaAsignacion ? new Date(t.ultimaAsignacion).getTime() : 0)
  disponibles.sort((a, b) => a.activos - b.activos || desdeUltimaAsignacion(a) - desdeUltimaAsignacion(b))
  return disponibles[0]
}

// Mutación compartida por asignarAutomaticamente (un reporte nuevo) y
// redistribuirPendientes (uno que ya estaba pendiente y ahora encontró cupo):
// deja el reporte 'asignado' al elegido y avisa. No hace `save()` de más ni
// duplica el registro de evento entre los dos casos.
async function aplicarAsignacionAutomatica(reporte, elegido, nota) {
  reporte.asignadoA = elegido._id
  reporte.asignadoPor = null
  reporte.asignadoEn = new Date()
  reporte.asignacionAutomatica = true
  reporte.estado = 'asignado'
  registrarEvento(reporte, { accion: 'asignado', de: 'pendiente', a: 'asignado', actor: null, nota })
  await reporte.save()

  await notificarUsuarios([elegido._id], {
    titulo: 'Nuevo daño asignado automáticamente',
    cuerpo: `Prioridad ${reporte.prioridad}: ${reporte.descripcion.slice(0, 120)}`,
  })
}

// Best-effort: se llama al crear el reporte y NUNCA debe hacer fallar esa
// creación (mismo criterio que la subida a Cloudinary). Si no hay a quién
// asignarle, avisa a los supervisores para que lo hagan a mano.
export async function asignarAutomaticamente(reporte) {
  if (!TIPOS_AUTOASIGNABLES.includes(reporte.tipo)) return reporte

  try {
    const candidatos = await listarTecnicosConCarga()
    const elegido = candidatos.length ? elegirTecnicoDisponible(candidatos, reporte) : null

    if (!elegido) {
      const supervisores = await usuariosConPermiso(PERMISO_SUPERVISOR)
      await notificarUsuarios(supervisores, {
        titulo: 'Daño reportado sin técnico disponible',
        cuerpo: `Requiere asignación manual: ${reporte.descripcion.slice(0, 120)}`,
      })
      return reporte
    }

    await aplicarAsignacionAutomatica(reporte, elegido, `Asignación automática a ${elegido.nombre} (estaba disponible).`)
  } catch (err) {
    // El reporte ya está creado y visible; que el reparto falle solo significa
    // que se queda pendiente de asignación manual.
    console.error('Falló la asignación automática del reporte', String(reporte._id), err.message)
  }
  return reporte
}

// Se llama cada vez que alguien libera cupo (resuelve/cancela una tarea) o
// libera un reporte (vuelve a 'pendiente'): sin esto, un daño solo se
// repartía en el instante en que se CREABA, y uno que se hubiera quedado
// pendiente por falta de cupo podía quedarse ahí para siempre aunque un
// técnico terminara trabajo después y le sobrara espacio. Recorre los
// pendientes más urgentes primero y les busca cupo con el mismo criterio de
// elegirTecnicoDisponible, actualizando la carga en memoria en cada vuelta
// para no mandarle de golpe más de MAX_ACTIVAS_TECNICO al mismo técnico.
export async function redistribuirPendientes() {
  try {
    const pendientes = await ReporteDano.find({ estado: 'pendiente', tipo: { $in: TIPOS_AUTOASIGNABLES } })
    if (!pendientes.length) return
    ordenarPorUrgencia(pendientes)

    const candidatos = await listarTecnicosConCarga()
    if (!candidatos.length) return

    for (const reporte of pendientes) {
      const elegido = elegirTecnicoDisponible(candidatos, reporte)
      if (!elegido) continue // nadie con cupo todavía; sigue pendiente

      await aplicarAsignacionAutomatica(reporte, elegido, `Asignación automática a ${elegido.nombre} (se liberó cupo).`)
      // Refleja de inmediato la nueva carga del elegido para que el siguiente
      // pendiente en la lista no se le vuelva a ofrecer si ya llegó al tope.
      elegido.activos += 1
    }
  } catch (err) {
    console.error('Falló la redistribución automática de pendientes', err.message)
  }
}

// ── Consulta ─────────────────────────────────────────────────────────────

// Mongo solo puede ordenar `estado`/`prioridad` alfabéticamente, y eso da un
// orden sin sentido ("asignado, cancelado, en_espera, en_proceso…"). El orden
// que sí sirve —lo que exige acción arriba, y dentro de eso lo más crítico— se
// arma en memoria. Es viable porque esta lista no pagina: ya se traen todos
// los documentos.
const PESO_ESTADO = { pendiente: 0, en_espera: 1, asignado: 2, en_proceso: 3, resuelto: 4, cancelado: 5 }
const PESO_PRIORIDAD = { critica: 0, alta: 1, media: 2, baja: 3 }

// El último desempate (misma urgencia, misma prioridad) va en direcciones
// opuestas según quién pregunte, y por eso es un parámetro y no una constante:
//  - la LISTA que se le muestra a alguien quiere lo más reciente arriba: al
//    abrir la pantalla, lo que acaba de pasar es lo que se busca (opción del
//    usuario, ver listarReportes).
//  - el REPARTO automático quiere lo más viejo primero: un daño atrasado no
//    debe perder su turno de técnico contra uno que acaba de entrar (ver
//    redistribuirPendientes).
// Se ordena por `fecha` (cuándo ocurrió el daño), que es justo la columna
// "Fecha"/"Ocurrió" que se ve en pantalla, para que el orden coincida con el
// dato que el usuario está leyendo.
function ordenarPorUrgencia(reportes, { recientesPrimero = false } = {}) {
  const porFecha = (a, b) =>
    recientesPrimero ? new Date(b.fecha) - new Date(a.fecha) : new Date(a.fecha) - new Date(b.fecha)

  reportes.sort(
    (a, b) =>
      PESO_ESTADO[a.estado] - PESO_ESTADO[b.estado] ||
      PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad] ||
      porFecha(a, b)
  )
}

export async function listarReportes({ estado, tipo, asignado, prioridad } = {}, actor) {
  const filtro = {}
  if (estado) {
    if (!ESTADOS.includes(estado)) throw new ErrorValidacion(`estado debe ser uno de: ${ESTADOS.join(', ')}`)
    filtro.estado = estado
  }
  if (tipo) {
    if (!TIPOS.includes(tipo)) throw new ErrorValidacion(`tipo debe ser uno de: ${TIPOS.join(', ')}`)
    filtro.tipo = tipo
  }
  if (prioridad) {
    if (!PRIORIDADES.includes(prioridad)) throw new ErrorValidacion(`prioridad debe ser una de: ${PRIORIDADES.join(', ')}`)
    filtro.prioridad = prioridad
  }

  // Un técnico raso (sin danos:gestionar) SOLO puede ver lo suyo — nunca la
  // cola completa ni el trabajo de un compañero. Se fuerza el filtro y se
  // ignora cualquier `asignado` que haya mandado el cliente: no es un detalle
  // de UI, es la regla de negocio ("nunca visualizar órdenes de otros").
  if (!puedeVerTodo(actor)) {
    filtro.asignadoA = actor.id_usuario
  } else if (asignado === 'mi') filtro.asignadoA = actor.id_usuario
  else if (asignado === 'sin') filtro.asignadoA = null
  else if (asignado) filtro.asignadoA = asignado

  const reportes = await ReporteDano.find(filtro)
    .populate(POPULATE_REPORTANTE)
    .populate(POPULATE_ASIGNADO)
    .populate(POPULATE_ATENDIDO)
    .sort({ fecha: -1 })

  // Nota: este sort de Mongo lo pisa por completo ordenarPorUrgencia; se deja
  // solo para que el orden ya venga estable si algún día se lista sin reordenar.
  ordenarPorUrgencia(reportes, { recientesPrimero: true })

  // El resumen de contadores respeta el mismo alcance que la lista: si el
  // cliente pidió `asignado=mi` (p.ej. la pantalla "Mis tareas", incluso para
  // un supervisor que también tiene mantenimiento:ejecutar), el resumen debe
  // contar solo lo suyo — igual que `filtro` de arriba — y no todo el
  // Terminal, o los contadores de las pestañas no coincidirían con la lista.
  const filtroResumen = 'asignadoA' in filtro ? { asignadoA: filtro.asignadoA } : {}
  const porEstado = await ReporteDano.aggregate([
    { $match: filtroResumen },
    { $group: { _id: '$estado', n: { $sum: 1 } } },
  ])
  const resumen = Object.fromEntries(ESTADOS.map((e) => [e, 0]))
  for (const fila of porEstado) resumen[fila._id] = fila.n
  // sinAsignar responde "¿cuánto está esperando que yo lo reparta?", que es la
  // cifra que le importa al administrador y no se deduce de resumen.pendiente
  // (un reporte cancelado o reabierto también puede quedar sin responsable).
  // No aplica a un técnico: él no reparte trabajo, así que se deja en 0.
  resumen.sinAsignar = puedeVerTodo(actor)
    ? await ReporteDano.countDocuments({ asignadoA: null, estado: { $nin: ['resuelto', 'cancelado'] } })
    : 0

  return { reportes, resumen }
}

export async function obtenerReporte(id, actor) {
  const reporte = await ReporteDano.findById(id)
    .populate(POPULATE_REPORTANTE)
    .populate(POPULATE_ASIGNADO)
    .populate(POPULATE_ATENDIDO)
    .populate({ path: 'asignadoPor', select: 'nombre nombre_usuario' })
    .populate({ path: 'requerimientos', select: 'tipo estado createdAt bodega.estado' })
  if (!reporte) throw new ErrorNoEncontrado('Reporte no encontrado')
  // `actor` es opcional porque también se llama internamente (p. ej. al
  // final de asignarReporte/cambiarEstadoReporte) donde el permiso ya se
  // verificó antes de llegar aquí.
  if (actor && !puedeVerTodo(actor) && !esElAsignado(reporte, actor)) {
    throw new ErrorAutorizacion('No puedes consultar un reporte que no tienes asignado')
  }
  return reporte
}

// ── Asignación manual ────────────────────────────────────────────────────

async function validarTecnico(tecnicoId) {
  const usuario = await Usuario.findById(tecnicoId).populate({
    path: 'rol',
    populate: { path: 'permisos', select: 'codigo' },
  })
  if (!usuario || usuario.estado !== 'activo') throw new ErrorValidacion('Técnico no encontrado o inactivo')
  const habilitado = usuario.rol?.esSuperAdmin || usuario.rol?.permisos?.some((p) => p.codigo === PERMISO_TECNICO)
  if (!habilitado) throw new ErrorValidacion('El usuario seleccionado no pertenece al equipo de mantenimiento')
  return usuario
}

export async function asignarReporte(id, { tecnicoId, nota, forzar }, actor) {
  if (!tecnicoId) throw new ErrorValidacion('tecnicoId es obligatorio')

  const reporte = await ReporteDano.findById(id)
  if (!reporte) throw new ErrorNoEncontrado('Reporte no encontrado')
  if (['resuelto', 'cancelado'].includes(reporte.estado)) {
    throw new ErrorConflicto(`No se puede asignar un reporte en estado "${reporte.estado}"`)
  }

  // Auto-asignarse ("tomar" la tarea) lo puede hacer cualquiera del equipo;
  // repartirle trabajo a OTRA persona exige ser supervisor. Así el técnico
  // conserva el botón de tomar sin poder mover la cola de sus compañeros.
  const esAutoAsignacion = String(tecnicoId) === String(actor.id_usuario)
  if (!esAutoAsignacion && !esSupervisor(actor)) {
    throw new ErrorConflicto('Solo un supervisor puede asignarle un reporte a otra persona')
  }

  const tecnico = await validarTecnico(tecnicoId)
  const anterior = reporte.asignadoA ? String(idDe(reporte.asignadoA)) : null
  if (anterior === String(tecnico._id)) {
    throw new ErrorConflicto(`El reporte ya está asignado a ${tecnico.nombre}`)
  }

  // Tope de carga (regla del Terminal): nadie cruza las MAX_ACTIVAS_TECNICO
  // sin que un supervisor lo autorice explícitamente con `forzar`. El reparto
  // automático (asignarAutomaticamente) ya respeta este techo sin necesidad
  // de override porque simplemente no elige a alguien saturado.
  const activasDelTecnico = await ReporteDano.countDocuments({
    asignadoA: tecnico._id,
    estado: { $in: ESTADOS_QUE_OCUPAN },
  })
  if (activasDelTecnico >= MAX_ACTIVAS_TECNICO && !forzar) {
    throw new ErrorConflicto(
      `${tecnico.nombre} ya tiene ${activasDelTecnico} órdenes activas (máximo ${MAX_ACTIVAS_TECNICO} sin autorización). Confirma para asignar de todas formas.`
    )
  }

  const estadoAnterior = reporte.estado
  reporte.asignadoA = tecnico._id
  reporte.asignadoPor = actor.id_usuario
  reporte.asignadoEn = new Date()
  reporte.asignacionAutomatica = false
  reporte.atendidoPor = actor.id_usuario
  // Reasignar algo ya en curso no lo devuelve al principio: el trabajo sigue
  // donde estaba, solo cambia de manos.
  if (reporte.estado === 'pendiente') reporte.estado = 'asignado'

  registrarEvento(reporte, {
    accion: anterior ? 'reasignado' : 'asignado',
    de: estadoAnterior,
    a: reporte.estado,
    actor,
    nota: nota || `${esAutoAsignacion ? 'Tomó la tarea' : `Asignado a ${tecnico.nombre}`}.`,
  })
  await reporte.save()

  await auditar(actor, anterior ? 'reasignar' : 'asignar', reporte, `Reporte asignado a ${tecnico.nombre}`, {
    antes: { estado: estadoAnterior, asignadoA: anterior },
    despues: { estado: reporte.estado, asignadoA: String(tecnico._id) },
  })

  if (!esAutoAsignacion) {
    await notificarUsuarios([tecnico._id], {
      titulo: 'Nuevo daño asignado',
      cuerpo: `Prioridad ${reporte.prioridad}: ${reporte.descripcion.slice(0, 120)}`,
    })
  }
  // Al técnico que se lo quitaron también hay que avisarle: puede estar
  // trabajando en ello justo ahora.
  if (anterior && anterior !== String(tecnico._id)) {
    await notificarUsuarios([anterior], {
      titulo: 'Reporte reasignado',
      cuerpo: `El reporte que tenías asignado pasó a ${tecnico.nombre}.`,
    })
  }

  return obtenerReporte(reporte._id)
}

// ── Cambio de estado ─────────────────────────────────────────────────────

export async function cambiarEstadoReporte(id, { estado, nota, motivoEspera, prioridad, reparacion }, actor) {
  if (!ESTADOS.includes(estado)) {
    throw new ErrorValidacion(`estado debe ser uno de: ${ESTADOS.join(', ')}`)
  }

  const reporte = await ReporteDano.findById(id)
  if (!reporte) throw new ErrorNoEncontrado('Reporte no encontrado')

  const estadoAnterior = reporte.estado
  if (estado === estadoAnterior) throw new ErrorConflicto(`El reporte ya está en estado "${estado}"`)
  if (!TRANSICIONES[estadoAnterior]?.includes(estado)) {
    throw new ErrorConflicto(`No se puede pasar de "${estadoAnterior}" a "${estado}"`)
  }

  // Quien repara manda sobre el estado de su propio trabajo; el supervisor
  // puede intervenir cualquier reporte (destrabar, cancelar, reabrir).
  if (!esSupervisor(actor) && !esElAsignado(reporte, actor)) {
    throw new ErrorConflicto('Solo el técnico asignado o un supervisor pueden cambiar el estado de este reporte')
  }

  // Volver a 'pendiente' es "liberar": suelta el reporte de su responsable y
  // lo devuelve a la cola. Es, en el fondo, una reasignación — el técnico no
  // puede reasignar ni liberar su propio trabajo, solo un supervisor.
  if (estado === 'pendiente' && !esSupervisor(actor)) {
    throw new ErrorConflicto('Solo un supervisor puede liberar o reasignar este reporte')
  }

  if (estado === 'en_espera') {
    if (!MOTIVOS_ESPERA.includes(motivoEspera)) {
      throw new ErrorValidacion(`motivoEspera debe ser uno de: ${MOTIVOS_ESPERA.join(', ')}`)
    }
    reporte.motivoEspera = motivoEspera
  } else {
    reporte.motivoEspera = null
  }

  // Detener, cancelar o reabrir sin decir por qué deja el historial inútil
  // justo en los casos donde alguien va a preguntar "¿y esto por qué?".
  const exigeNota = ['en_espera', 'cancelado', 'resuelto'].includes(estado) || estadoAnterior === 'resuelto'
  if (exigeNota && !nota?.trim()) {
    throw new ErrorValidacion('Se requiere una nota que explique este cambio de estado')
  }

  if (prioridad) {
    if (!PRIORIDADES.includes(prioridad)) throw new ErrorValidacion(`prioridad debe ser una de: ${PRIORIDADES.join(', ')}`)
    reporte.prioridad = prioridad
  }

  // Marcar "Reparado" exige la prueba completa: sin fecha, sin módulo o sin
  // al menos una foto, la orden NO puede finalizarse (regla de negocio
  // explícita del Terminal, no solo una recomendación de UI).
  if (estado === 'resuelto') {
    const fecha = reparacion?.fecha ? new Date(reparacion.fecha) : null
    if (!fecha || Number.isNaN(fecha.getTime())) {
      throw new ErrorValidacion('La fecha de la reparación es obligatoria')
    }
    if (!MODULOS_TRABAJO.includes(reparacion?.modulo)) {
      throw new ErrorValidacion(`El módulo donde se hizo el trabajo debe ser uno de: ${MODULOS_TRABAJO.join(', ')}`)
    }
    const evidencias = reparacion?.evidenciasNuevas || []
    if (evidencias.length === 0) {
      throw new ErrorValidacion('Debes adjuntar al menos una foto de evidencia de la reparación')
    }
    reporte.reparacion = { fecha, modulo: reparacion.modulo, evidencias }
  }

  // Se guarda ANTES de limpiarlo: al liberar, el técnico al que se le quita el
  // trabajo es justamente a quien hay que avisarle, y para entonces
  // reporte.asignadoA ya sería null.
  const responsablePrevio = reporte.asignadoA ? String(idDe(reporte.asignadoA)) : null

  reporte.estado = estado
  reporte.atendidoPor = actor.id_usuario
  if (nota?.trim()) reporte.observacionAtencion = nota.trim()
  reporte.fechaResolucion = estado === 'resuelto' ? new Date() : null
  // Liberar: vuelve a la cola sin responsable, listo para repartirse de nuevo.
  if (estado === 'pendiente') {
    reporte.asignadoA = null
    reporte.asignadoPor = null
    reporte.asignadoEn = null
    reporte.asignacionAutomatica = false
  }

  registrarEvento(reporte, {
    accion: estado === 'pendiente' ? 'liberado' : 'estado',
    de: estadoAnterior,
    a: estado,
    actor,
    nota,
  })
  await reporte.save()

  await auditar(actor, 'cambiar_estado', reporte, `Reporte de ${estadoAnterior} a ${estado}`, {
    antes: { estado: estadoAnterior },
    despues: {
      estado,
      motivoEspera: reporte.motivoEspera,
      ...(estado === 'resuelto' ? { reparacion: { fecha: reporte.reparacion.fecha, modulo: reporte.reparacion.modulo, evidencias: reporte.reparacion.evidencias.length } } : {}),
    },
  })

  await notificarCambioEstado(reporte, estadoAnterior, estado, nota, actor, responsablePrevio)

  // Resolver o cancelar libera un cupo del técnico; volver a 'pendiente' pone
  // un reporte de vuelta en la cola. En los tres casos puede haber (este u
  // otro) daño pendiente esperando espacio — se intenta repartir de una vez
  // en lugar de esperar a que llegue un reporte nuevo (ver
  // redistribuirPendientes). Best-effort: nunca debe tumbar esta respuesta.
  if (['resuelto', 'cancelado', 'pendiente'].includes(estado)) {
    await redistribuirPendientes()
  }

  return obtenerReporte(reporte._id)
}

async function notificarCambioEstado(reporte, de, a, nota, actor, responsablePrevio) {
  const destinatarios = new Set()

  // Quien reportó siempre quiere saber cuándo se resolvió lo suyo.
  if (a === 'resuelto') destinatarios.add(String(idDe(reporte.reportadoPor)))
  // Un daño detenido o cancelado es una decisión que el supervisor debe ver;
  // liberado además significa "vuelve a estar sobre tu mesa para repartir".
  if (['en_espera', 'cancelado', 'pendiente'].includes(a)) {
    const supervisores = await usuariosConPermiso(PERMISO_SUPERVISOR)
    for (const s of supervisores) destinatarios.add(String(s))
  }
  // Si el que movió el estado no es quien tenía el trabajo (p. ej. el
  // supervisor reabrió, o le liberó la tarea), esa persona se entera.
  if (responsablePrevio) destinatarios.add(responsablePrevio)
  destinatarios.delete(String(actor.id_usuario))
  if (!destinatarios.size) return

  const detalleEspera = a === 'en_espera' ? ` (esperando ${reporte.motivoEspera})` : ''
  await notificarUsuarios([...destinatarios], {
    titulo: `Reporte ${a.replace('_', ' ')}${detalleEspera}`,
    cuerpo: nota?.trim() || `Pasó de ${de} a ${a}.`,
  })
}

// ── Vínculo con Requerimientos ───────────────────────────────────────────

// La llama requerimientos.service.js cuando un requerimiento nace desde un
// daño ("necesito este repuesto para poder repararlo").
export async function vincularRequerimiento(danoId, requerimiento, actor) {
  const reporte = await ReporteDano.findById(danoId)
  if (!reporte) return null

  reporte.requerimientos.addToSet(requerimiento._id)
  registrarEvento(reporte, {
    accion: 'requerimiento',
    actor,
    nota: `Requerimiento de ${requerimiento.tipo} solicitado para reparar este daño.`,
  })
  await reporte.save()
  return reporte
}
