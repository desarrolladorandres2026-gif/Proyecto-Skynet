import ConfiguracionSig from '../../models/ConfiguracionSig.js'
import Usuario from '../../models/Usuario.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

// Helpers compartidos entre los service de este módulo — mismo criterio que
// comun.js de requerimientos/mantenimiento.

export function auditar(usuarioActor, accion, entidad, entidadId, descripcion, cambios) {
  return registrarAuditoria({
    usuario: usuarioActor,
    accion,
    modulo: 'sig_pregunta_dia',
    entidad,
    entidadId,
    descripcion,
    cambios,
  })
}

// Documento único de configuración (ver ConfiguracionSig.js): se crea con
// sus defaults la primera vez que algo lo necesita, nunca en el arranque del
// servidor — mismo patrón que ConfiguracionIA.
//
// Este devuelve el documento Mongoose REAL (no cacheado): lo usa
// actualizarConfiguracion() de sig-configuracion.service.js para mutarlo y
// hacer config.save(), y necesita partir siempre del estado más reciente en
// Mongo. Las lecturas de solo consulta (dashboard, reportes) deben usar
// obtenerConfiguracionCacheada() en su lugar.
export async function obtenerOCrearConfiguracion() {
  let config = await ConfiguracionSig.findOne({})
  if (!config) config = await ConfiguracionSig.create({})
  return config
}

// ── Caché de la configuración para lecturas de solo consulta ───────────────
// obtenerDashboard/listarTrabajadoresParticipantes/reporteTrabajador/
// recalcularYObtenerPlanRefuerzo la llamaban sin caché, una vez cada una, en
// cada carga del dashboard SIG — 4 round-trips a Mongo por un documento único
// que casi nunca cambia. Mismo patrón de Set/TTL en memoria que
// keysModulosDesactivados() en sistema.service.js.
const CACHE_TTL_MS = 30_000
let cacheConfig = null
let cacheExpira = 0

export async function obtenerConfiguracionCacheada() {
  if (!cacheConfig || Date.now() > cacheExpira) {
    const config = await obtenerOCrearConfiguracion()
    cacheConfig = config.toObject()
    cacheExpira = Date.now() + CACHE_TTL_MS
  }
  return cacheConfig
}

export function invalidarCacheConfiguracion() {
  cacheConfig = null
}

// Resuelve una `audiencia` (de ProgramacionSig o CampanaSig) a la lista de
// IDs de trabajadores ACTIVOS a quienes les corresponde esa pregunta. Con
// `todos: true` es cualquier usuario activo del sistema; si no, la unión de
// quienes coincidan en dependencia O cargo (reutiliza Usuario.dependencia
// como "área", igual que el resto de la plataforma — sin campo nuevo).
export async function resolverAudiencia(audiencia) {
  const filtro = { estado: 'activo', esPrueba: false }
  if (!audiencia?.todos) {
    const condiciones = []
    if (audiencia?.dependencias?.length) condiciones.push({ dependencia: { $in: audiencia.dependencias } })
    if (audiencia?.cargos?.length) condiciones.push({ cargo: { $in: audiencia.cargos } })
    filtro.$or = condiciones.length ? condiciones : [{ _id: null }] // audiencia vacía = nadie
  }
  const usuarios = await Usuario.find(filtro).select('_id').lean()
  return usuarios.map((u) => u._id)
}

// Nivel de desempeño correspondiente a un porcentaje de acierto, según los
// umbrales configurados (ver ConfiguracionSig.nivelesDesempeno). Compartido
// por "mi progreso" (sig-respuestas.service.js) y el dashboard/reporte
// individual (sig-dashboard.service.js) para que ambos clasifiquen igual.
export function calcularNivel(porcentaje, niveles) {
  const ordenado = [...(niveles || [])].sort((a, b) => b.umbralMinimo - a.umbralMinimo)
  return ordenado.find((n) => porcentaje >= n.umbralMinimo) || null
}

// Forma canónica de `audiencia` compartida por ProgramacionSig y CampanaSig:
// { todos: true } o { todos: false, dependencias: [...], cargos: [...] }.
export function normalizarAudiencia(audiencia) {
  if (!audiencia || audiencia.todos !== false) return { todos: true, dependencias: [], cargos: [] }
  return {
    todos: false,
    dependencias: audiencia.dependencias || [],
    cargos: audiencia.cargos || [],
  }
}
