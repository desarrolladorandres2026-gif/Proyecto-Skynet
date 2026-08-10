import AvisoIA from '../../models/AvisoIA.js'
import PreferenciaIA from '../../models/PreferenciaIA.js'
import ConfiguracionIA from '../../models/ConfiguracionIA.js'
import { CATEGORIAS_NOTIFICACION, esCategoriaValida } from '../notificaciones/notificaciones.catalogo.js'
import { estaModuloActivo } from '../sistema/sistema.service.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { ErrorValidacion } from '../../utils/errores.js'

// Único punto de entrada llamado desde utils/sendPush.js — alimenta la cola
// de avisos que consume el widget del copiloto (ver AvisoIA). Nunca lanza:
// un fallo acá no debe tumbar el flujo de negocio (crear requerimiento,
// reportar daño...) que lo disparó, igual que registrarAuditoria.
export async function avisarIA({ usuarios, categoria, titulo, cuerpo, url }) {
  try {
    if (!esCategoriaValida(categoria)) return
    if (!(await estaModuloActivo('ia'))) return

    const configGlobal = await ConfiguracionIA.findOne({})
    if (configGlobal?.categorias?.get(categoria) === false) return

    const idsUnicos = [...new Set((usuarios || []).map(String))].filter(Boolean)
    if (!idsUnicos.length) return

    const preferencias = await PreferenciaIA.find({ usuario: { $in: idsUnicos } }).select('usuario categorias')
    const bloqueados = new Set(
      preferencias.filter((p) => p.categorias?.get(categoria) === false).map((p) => String(p.usuario))
    )
    const destinatarios = idsUnicos.filter((id) => !bloqueados.has(id))
    if (!destinatarios.length) return

    await AvisoIA.insertMany(destinatarios.map((usuario) => ({ usuario, categoria, titulo, cuerpo, url })))
  } catch (err) {
    console.error('No se pudo encolar el aviso de IA:', err.message)
  }
}

export async function listarPendientes(usuarioId) {
  return AvisoIA.find({ usuario: usuarioId, leido: false }).sort({ creadoEn: 1 }).limit(20)
}

export async function marcarLeidos(usuarioId, ids) {
  if (!Array.isArray(ids) || !ids.length) return
  await AvisoIA.updateMany({ _id: { $in: ids }, usuario: usuarioId }, { $set: { leido: true } })
}

// ── Preferencias personales ─────────────────────────────────────────────────
export async function obtenerPreferencias(usuarioId) {
  const pref = await PreferenciaIA.findOne({ usuario: usuarioId })
  return {
    voz: { activo: pref ? pref.voz.activo : true },
    categorias: Object.fromEntries(
      CATEGORIAS_NOTIFICACION.map((c) => [c.key, pref ? pref.categorias.get(c.key) !== false : true])
    ),
  }
}

export async function actualizarPreferencias(usuarioId, { voz, categorias }) {
  const set = {}
  if (typeof voz?.activo === 'boolean') set['voz.activo'] = voz.activo
  if (categorias && typeof categorias === 'object') {
    for (const [clave, valor] of Object.entries(categorias)) {
      if (!esCategoriaValida(clave)) throw new ErrorValidacion(`Categoría desconocida: ${clave}`)
      if (typeof valor !== 'boolean') throw new ErrorValidacion(`El valor de "${clave}" debe ser booleano`)
      set[`categorias.${clave}`] = valor
    }
  }

  const pref = await PreferenciaIA.findOneAndUpdate(
    { usuario: usuarioId },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  return {
    voz: { activo: pref.voz.activo },
    categorias: Object.fromEntries(CATEGORIAS_NOTIFICACION.map((c) => [c.key, pref.categorias.get(c.key) !== false])),
  }
}

// ── Configuración global (Super Admin) ──────────────────────────────────────
export async function obtenerConfiguracionGlobal() {
  const config = await ConfiguracionIA.findOne({})
  return {
    categorias: Object.fromEntries(
      CATEGORIAS_NOTIFICACION.map((c) => [c.key, config ? config.categorias.get(c.key) !== false : true])
    ),
  }
}

export async function actualizarConfiguracionGlobal(cambios, usuarioActor) {
  const { categorias } = cambios
  const set = {}
  if (categorias && typeof categorias === 'object') {
    for (const [clave, valor] of Object.entries(categorias)) {
      if (!esCategoriaValida(clave)) throw new ErrorValidacion(`Categoría desconocida: ${clave}`)
      if (typeof valor !== 'boolean') throw new ErrorValidacion(`El valor de "${clave}" debe ser booleano`)
      set[`categorias.${clave}`] = valor
    }
  }

  const antes = await obtenerConfiguracionGlobal()
  const config = await ConfiguracionIA.findOneAndUpdate(
    {},
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  await registrarAuditoria({
    usuario: usuarioActor,
    accion: 'configurar',
    modulo: 'ia',
    entidad: 'ConfiguracionIA',
    entidadId: config._id,
    descripcion: 'Actualizó la configuración global de avisos proactivos de IA',
    cambios: { antes, despues: categorias },
  })

  return {
    categorias: Object.fromEntries(CATEGORIAS_NOTIFICACION.map((c) => [c.key, config.categorias.get(c.key) !== false])),
  }
}
