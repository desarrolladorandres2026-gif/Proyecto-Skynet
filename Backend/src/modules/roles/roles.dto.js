import { z } from 'zod'
import { ErrorValidacion } from '../../utils/errores.js'

const crearRolSchema = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]+$/, 'El slug solo admite minúsculas, números y guion bajo'),
  descripcion: z.string().trim().optional(),
  // Solo 'global' (ver models/Rol.js): el ámbito 'empresa' se retiró junto
  // con el módulo flota/Empresa.
  ambito: z.enum(['global']).default('global'),
  esSuperAdmin: z.boolean().default(false),
  // Códigos de Permiso (p. ej. "vehiculos:gestionar"); el Service los resuelve
  // a ObjectId contra el catálogo antes de guardar.
  permisos: z.array(z.string()).default([]),
})

const actualizarRolSchema = crearRolSchema.partial()

function ejecutarSchema(schema, body) {
  const resultado = schema.safeParse(body)
  if (!resultado.success) {
    const primerError = resultado.error.issues[0]
    throw new ErrorValidacion(`${primerError.path.join('.')}: ${primerError.message}`)
  }
  return resultado.data
}

export function validarCrearRolDTO(body) {
  return ejecutarSchema(crearRolSchema, body)
}

export function validarActualizarRolDTO(body) {
  return ejecutarSchema(actualizarRolSchema, body)
}

// Aplana los `permisos` poblados (ObjectId → doc de Permiso) a la forma que
// consume el frontend (matriz módulo × acción de RolesPage).
export function aRolPublico(rol) {
  return {
    _id: rol._id,
    nombre: rol.nombre,
    slug: rol.slug,
    descripcion: rol.descripcion,
    esSuperAdmin: rol.esSuperAdmin,
    ambito: rol.ambito,
    estado: rol.estado,
    esSistema: rol.esSistema,
    permisos: (rol.permisos || []).map((p) => ({
      codigo: p.codigo,
      nombre: p.nombre,
      modulo: p.modulo,
      accion: p.accion,
    })),
  }
}
