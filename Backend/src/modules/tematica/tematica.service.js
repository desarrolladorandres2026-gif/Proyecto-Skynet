import { z } from 'zod'
import ConfiguracionTematica from '../../models/ConfiguracionTematica.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

const CLAVE = 'global'
const MODO_POR_DEFECTO = 'auto'

// 'auto', 'ninguna' o el id (slug) de una temática del frontend.
const modoSchema = z.object({
  modo: z.string().regex(/^[a-z0-9-]{1,40}$/, 'debe ser "auto", "ninguna" o el id de una temática'),
})

export function validarModo(body) {
  const resultado = modoSchema.safeParse(body)
  if (!resultado.success) {
    throw new ErrorValidacion(`modo: ${resultado.error.issues[0].message}`)
  }
  return resultado.data.modo
}

export async function obtenerModo() {
  const doc = await ConfiguracionTematica.findOne({ clave: CLAVE }).lean()
  return doc?.modo ?? MODO_POR_DEFECTO
}

export async function cambiarModo(body, usuarioActor) {
  const modo = validarModo(body)
  const antes = await obtenerModo()

  // upsert atómico: el índice único de `clave` evita dos documentos si dos
  // administradores guardan a la vez.
  await ConfiguracionTematica.findOneAndUpdate(
    { clave: CLAVE },
    { $set: { modo, actualizadoPor: usuarioActor.nombre_usuario }, $setOnInsert: { clave: CLAVE } },
    { upsert: true, setDefaultsOnInsert: true }
  )

  await registrarAuditoria({
    usuario: usuarioActor,
    accion: 'actualizar',
    modulo: 'tematica',
    entidad: 'ConfiguracionTematica',
    descripcion: `Temática del sistema cambiada a "${modo}"`,
    cambios: { antes: { modo: antes }, despues: { modo } },
  })

  return modo
}
