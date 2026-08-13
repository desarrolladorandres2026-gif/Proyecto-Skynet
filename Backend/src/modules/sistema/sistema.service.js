import Permiso from '../../models/Permiso.js'
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

// Permisos que están en Mongo pero ya no en rbac.data.js. Se exporta para que
// scripts/limpiar-permisos-obsoletos.js muestre exactamente lo mismo que el
// arranque reporta, sin duplicar la consulta.
export async function permisosObsoletos() {
  const codigosVigentes = PERMISOS.map((p) => p.codigo)
  return Permiso.find({ codigo: { $nin: codigosVigentes } }).select('codigo nombre')
}

// ── Sincronización del catálogo (arranque del servidor) ─────────────────────
// Upserta los módulos declarados en modulos.data.js y los permisos que falten
// de rbac.data.js: un módulo o permiso nuevo en código aparece en la BD al
// primer arranque, sin reejecutar seeds. Nunca pisa el estado `activo` ni los
// permisos ya asignados a los roles.
//
// ── Por qué el arranque NO borra permisos obsoletos ─────────────────────────
// Antes sí lo hacía ($pull sobre todos los Rol + deleteMany sobre Permiso), y
// era una operación destructiva ASIMÉTRICA: agregar un permiso usa
// $setOnInsert y por diseño NO lo asigna a ningún rol existente (para no pisar
// personalizaciones hechas desde la pantalla Roles), pero borrarlo sí
// cascadeaba a todos los roles. Es decir, un permiso podía SALIR de un rol
// solo, pero nunca podía VOLVER solo.
//
// El caso que lo rompe es un rollback de código, que es respuesta normal a un
// incidente: al arrancar el commit anterior, un permiso agregado después
// desaparece de PERMISOS y se borra de todos los roles; al volver adelante, el
// permiso se recrea pero NINGÚN rol lo recupera. La configuración RBAC queda
// destruida sin registro en auditoría y sin forma automática de restaurarla.
// (scripts/otorgar-permiso-catalogos.js existe precisamente por esto.)
//
// Ahora solo se REPORTA. La limpieza vive en scripts/limpiar-permisos-obsoletos.js,
// que muestra qué roles perderían qué antes de tocar nada.
//
// Los módulos sí se siguen borrando (repo.eliminarNoListados): ahí lo único
// que se pierde es el interruptor activo/inactivo, que vuelve a su valor por
// defecto si el módulo reaparece. Es recuperable con un clic; una asignación
// de permisos borrada de N roles no lo es.
export async function sincronizarCatalogoSistema() {
  try {
    for (const modulo of MODULOS_SISTEMA) {
      await repo.upsertCatalogo(modulo)
    }
    await repo.eliminarNoListados(MODULOS_SISTEMA.map((m) => m.key))
    for (const p of PERMISOS) {
      await Permiso.updateOne({ codigo: p.codigo }, { $setOnInsert: p }, { upsert: true })
    }

    const obsoletos = await permisosObsoletos()
    if (obsoletos.length > 0) {
      console.warn(
        `⚠️  ${obsoletos.length} permiso(s) en la base ya no existen en rbac.data.js: ` +
          `${obsoletos.map((p) => p.codigo).join(', ')}.\n` +
          '    No se borran automáticamente (ver el comentario en sistema.service.js).\n' +
          '    Para revisarlos y limpiarlos: node scripts/limpiar-permisos-obsoletos.js'
      )
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
