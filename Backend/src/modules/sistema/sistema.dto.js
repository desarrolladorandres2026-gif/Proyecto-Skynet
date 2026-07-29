import { z } from 'zod'
import { ErrorValidacion } from '../../utils/errores.js'

const cambiarEstadoSchema = z.object({
  activo: z.boolean(),
})

export function validarCambiarEstadoDTO(body) {
  const resultado = cambiarEstadoSchema.safeParse(body)
  if (!resultado.success) {
    const primerError = resultado.error.issues[0]
    throw new ErrorValidacion(`${primerError.path.join('.')}: ${primerError.message}`)
  }
  return resultado.data
}

export function aModuloPublico(modulo) {
  return {
    key: modulo.key,
    nombre: modulo.nombre,
    descripcion: modulo.descripcion,
    activo: modulo.activo,
    esNucleo: modulo.esNucleo,
    orden: modulo.orden,
  }
}
