import Permiso from '../../models/Permiso.js'
import Rol from '../../models/Rol.js'
import * as repo from './sistema.repository.js'
import { MODULOS_SISTEMA } from '../../seedData/modulos.data.js'
import { PERMISOS } from '../../seedData/rbac.data.js'
import { aModuloPublico } from './sistema.dto.js'
import { ErrorConflicto, ErrorNoEncontrado } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

// ── Caché del estado de módulos ─────────────────────────────────────────────
// requiereModuloActivo() corre en CADA petición de los módulos desactivables;
// consultar Mongo cada vez duplicaría el costo que ya paga verificarToken.
// Un Set en memoria con TTL corto basta: al togglear se invalida al instante
// en este proceso, y el TTL cubre el caso multi-instancia futuro.
const CACHE_TTL_MS = 30_000
let cacheDesactivados = null
let cacheExpira = 0

export async function keysModulosDesactivados() {
  if (!cacheDesactivados || Date.now() > cacheExpira) {
    const docs = await repo.listarDesactivados()
    cacheDesactivados = new Set(docs.map((d) => d.key))
    cacheExpira = Date.now() + CACHE_TTL_MS
  }
  return cacheDesactivados
}

export function invalidarCacheModulos() {
  cacheDesactivados = null
}

export async function estaModuloActivo(key) {
  const desactivados = await keysModulosDesactivados()
  return !desactivados.has(key)
}

// ── Sincronización del catálogo (arranque del servidor) ─────────────────────
// Upserta los módulos declarados en modulos.data.js y los permisos que falten
// de rbac.data.js: un módulo o permiso nuevo en código aparece en la BD al
// primer arranque, sin reejecutar seeds. Nunca pisa el estado `activo` ni los
// permisos ya asignados a los roles. También borra de ModuloSistema y de
// Permiso los que ya no estén en el código (p. ej. módulos/permisos
// eliminados) — sin este paso, un permiso retirado de rbac.data.js se queda
// huérfano en Mongo para siempre y la pantalla "Roles y permisos" lo sigue
// listando como asignable aunque ningún endpoint lo verifique ya.
export async function sincronizarCatalogoSistema() {
  try {
    for (const modulo of MODULOS_SISTEMA) {
      await repo.upsertCatalogo(modulo)
    }
    await repo.eliminarNoListados(MODULOS_SISTEMA.map((m) => m.key))
    for (const p of PERMISOS) {
      await Permiso.updateOne({ codigo: p.codigo }, { $setOnInsert: p }, { upsert: true })
    }
    const codigosVigentes = PERMISOS.map((p) => p.codigo)
    const permisosObsoletos = await Permiso.find({ codigo: { $nin: codigosVigentes } }).select('_id')
    if (permisosObsoletos.length > 0) {
      const idsObsoletos = permisosObsoletos.map((p) => p._id)
      // Se quitan primero de cualquier Rol que aún los referencie: si no, el
      // ObjectId queda colgando y Rol.find().populate('permisos') lo resuelve
      // a null, reventando aRolPublico() (lee p.codigo de un null) para ese rol.
      await Rol.updateMany({}, { $pull: { permisos: { $in: idsObsoletos } } })
      await Permiso.deleteMany({ _id: { $in: idsObsoletos } })
    }
    invalidarCacheModulos()
  } catch (err) {
    // El catálogo desincronizado no debe tumbar el servidor: sin fila en la
    // colección, estaModuloActivo() trata el módulo como activo (fail-open
    // deliberado — la autorización real sigue siendo RBAC por permiso).
    console.error('No se pudo sincronizar el catálogo de módulos:', err.message)
  }
}

// ── Casos de uso de la pantalla "Módulos del sistema" ───────────────────────
export async function listarModulos() {
  const modulos = await repo.listar()
  return modulos.map(aModuloPublico)
}

export async function cambiarEstadoModulo(key, activo, usuarioActor) {
  const modulo = await repo.obtenerPorKey(key)
  if (!modulo) throw new ErrorNoEncontrado('Módulo no encontrado')

  if (modulo.esNucleo && !activo) {
    throw new ErrorConflicto(`"${modulo.nombre}" es un módulo núcleo del sistema y no puede desactivarse`)
  }
  if (modulo.activo === activo) return aModuloPublico(modulo)

  const actualizado = await repo.actualizarActivo(key, activo)
  invalidarCacheModulos()

  await registrarAuditoria({
    usuario: usuarioActor,
    accion: activo ? 'activar' : 'desactivar',
    modulo: 'sistema',
    entidad: 'ModuloSistema',
    entidadId: modulo._id,
    descripcion: `Módulo ${activo ? 'activado' : 'desactivado'}: ${modulo.nombre}`,
    cambios: { antes: { activo: modulo.activo }, despues: { activo } },
  })

  return aModuloPublico(actualizado)
}
